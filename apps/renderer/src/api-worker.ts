/**
 * api-worker — عامل يستهلك مهام mk-api من BullMQ (A18.5).
 *
 * البنية القديمة (worker.ts) صُممت لـCLI-shaped jobs. هذا الملف
 * يخدم API-shaped jobs (POST /v1/renders):
 *   { renderId, tenantId, projectId, size, format,
 *     brandSnapshot, templateSnapshot, content }
 *
 * التسلسل:
 *   1. استخراج assetIds من brandSnapshot (fonts.*.assetId فقط في A18.5)
 *   2. lookup storage_key عبر PG (app_user + SET LOCAL app_set_tenant)
 *   3. تنزيل من MinIO عبر @aws-sdk/client-s3 إلى /tmp/render-<jobId>/
 *   4. FontLibrary.use بمسارات محلّية — يرمي على missing (لا fallback)
 *   5. رندر PNG بسيط (اختبار — لا renderVideo كامل بعد)
 *   6. رفع output إلى MinIO
 *   7. UPDATE renders (status=succeeded, output_storage_key)
 *
 * على أي فشل: status=failed + error_code + error_message.
 * حارس check-no-brand-url-fetch يبقى نظيفاً — SDK فقط، لا fetch.
 */
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { Canvas, FontLibrary } from 'skia-canvas';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { Pool } = pg;

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379/3';
const BULLMQ_PREFIX = process.env['BULLMQ_PREFIX'] ?? 'pf-mediakit';
const DATABASE_URL_APP = process.env['DATABASE_URL_APP']!;
const S3_ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:19043';
const S3_REGION = process.env['S3_REGION'] ?? 'us-east-1';
const S3_BUCKET = process.env['S3_BUCKET'] ?? 'mk-assets-dev';
const S3_ACCESS_KEY_ID = process.env['S3_ACCESS_KEY_ID'] ?? 'minioadmin';
const S3_SECRET_ACCESS_KEY = process.env['S3_SECRET_ACCESS_KEY'] ?? 'minioadmin';

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const pool = new Pool({ connectionString: DATABASE_URL_APP, max: 5 });
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
});

// ── نموذج المهمة (يوازي apps/api/src/queues/index.ts) ─
interface ApiRenderJobPayload {
  renderId: string;
  tenantId: string;
  projectId: string;
  size: string;
  format: 'png' | 'mp4';
  brandSnapshot: Record<string, unknown>;
  templateSnapshot: Record<string, unknown>;
  content: Record<string, unknown>;
}

// ── استخراج assetIds من brand ──────────────────────
function extractFontAssetIds(brand: Record<string, unknown>): Array<{ family: string; assetId: string }> {
  const out: Array<{ family: string; assetId: string }> = [];
  const fonts = (brand as { fonts?: Record<string, { family?: string; assetId?: string; weights?: Record<string, { assetId?: string }> }> }).fonts;
  if (!fonts) return out;
  for (const [_key, f] of Object.entries(fonts)) {
    if (f?.family && f?.assetId) {
      out.push({ family: f.family, assetId: f.assetId });
    }
    // weights.{light|regular|bold}.assetId
    if (f?.weights) {
      for (const w of Object.values(f.weights)) {
        if (w?.assetId && f.family) {
          out.push({ family: f.family, assetId: w.assetId });
        }
      }
    }
  }
  return out;
}

// ── lookup storage_key ─────────────────────────────
async function lookupStorageKey(tenantId: string, assetId: string): Promise<string | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query<{ storage_key: string }>(
      `SELECT storage_key FROM assets WHERE id = $1 AND finalized_at IS NOT NULL`,
      [assetId],
    );
    await c.query('COMMIT');
    return r.rowCount === 0 ? null : r.rows[0]!.storage_key;
  } finally { c.release(); }
}

// ── تنزيل من MinIO ─────────────────────────────────
async function downloadAsset(storageKey: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKey }));
  if (!r.Body) throw new Error(`asset empty: ${storageKey}`);
  const chunks: Buffer[] = [];
  for await (const chunk of r.Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── تحديث renders row ─────────────────────────────
async function updateRender(tenantId: string, renderId: string, patch: Record<string, unknown>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const params = Object.values(patch);
    params.push(renderId);
    await c.query(
      `UPDATE renders SET ${sets} WHERE id = $${params.length}`,
      params,
    );
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// ── المعالج الرئيسي ──────────────────────────────
async function processApiJob(job: Job<ApiRenderJobPayload>): Promise<void> {
  const { renderId, tenantId, brandSnapshot, size } = job.data;
  const tmpDir = join(tmpdir(), `mk-render-${renderId}`);
  const startedAt = new Date();

  // status → running
  await updateRender(tenantId, renderId, {
    status: 'running', started_at: startedAt,
  });

  try {
    mkdirSync(tmpDir, { recursive: true });

    // 1. Fetch assets via SDK (L-46: fail if missing)
    const fontAssets = extractFontAssetIds(brandSnapshot);
    const loadedFonts: Array<{ family: string; path: string }> = [];
    for (const fa of fontAssets) {
      const storageKey = await lookupStorageKey(tenantId, fa.assetId);
      if (!storageKey) {
        throw new Error(`FONT_ASSET_MISSING: assetId=${fa.assetId} (finalized asset not found)`);
      }
      let buf: Buffer;
      try {
        buf = await downloadAsset(storageKey);
      } catch (err) {
        throw new Error(`FONT_ASSET_FETCH_FAILED: storage_key=${storageKey} err=${(err as Error).message}`);
      }
      const localPath = join(tmpDir, `${fa.assetId}.font`);
      writeFileSync(localPath, buf);
      // 2. Register with FontLibrary (skia-canvas)
      // NO FALLBACK — يرمي إن ملف الخط تالف
      FontLibrary.use(fa.family, [localPath]);
      loadedFonts.push({ family: fa.family, path: localPath });
      // eslint-disable-next-line no-console
      console.log(`[api-worker] font loaded: family=${fa.family} path=${localPath}`);
    }

    // 3. Render minimal PNG (A18.5 baseline — الرندر الكامل بند لاحق)
    const dims = size === 'reel' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 };
    const canvas = new Canvas(dims.w, dims.h);
    const ctx = canvas.getContext('2d');
    const brand = brandSnapshot as { colors?: { surface?: string; brandBg?: string } };
    ctx.fillStyle = brand.colors?.surface ?? '#111111';
    ctx.fillRect(0, 0, dims.w, dims.h);
    // نستعمل أول font family مُحمَّل (إن وجد)، وإلا نرمي
    if (loadedFonts.length === 0 && fontAssets.length > 0) {
      throw new Error(`FONT_LOAD_INCONSISTENCY: expected ${fontAssets.length} fonts, loaded 0`);
    }
    const fontFamily = loadedFonts[0]?.family ?? 'sans-serif';
    ctx.font = `bold 80px "${fontFamily}"`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('اختبار', dims.w / 2, dims.h / 2);
    const pngBuffer = await canvas.toBuffer('png');

    // 4. Upload output to MinIO
    const outputKey = `${tenantId}/renders/${renderId}/output.png`;
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: outputKey, Body: pngBuffer, ContentType: 'image/png',
    }));

    // 5. Update DB → succeeded
    const completedAt = new Date();
    await updateRender(tenantId, renderId, {
      status: 'succeeded',
      completed_at: completedAt,
      output_storage_key: outputKey,
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    });

    // eslint-disable-next-line no-console
    console.log(`[api-worker] job ${renderId} succeeded (${pngBuffer.length} bytes, output=${outputKey})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.startsWith('FONT_') ? msg.split(':')[0]! : 'RENDER_FAILED';
    await updateRender(tenantId, renderId, {
      status: 'failed',
      completed_at: new Date(),
      error_code: code,
      error_message: msg.slice(0, 500),
    });
    // eslint-disable-next-line no-console
    console.error(`[api-worker] job ${renderId} failed: ${msg}`);
    throw err;
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── تشغيل العامل ───────────────────────────────────
export function startApiWorker(): { normal: Worker; urgent: Worker; stop: () => Promise<void> } {
  const opts = { connection: redis, prefix: BULLMQ_PREFIX, concurrency: 2 };
  const normal = new Worker<ApiRenderJobPayload>('render-normal', processApiJob, opts);
  const urgent = new Worker<ApiRenderJobPayload>('render-urgent', processApiJob, opts);

  return {
    normal, urgent,
    async stop() {
      await normal.close();
      await urgent.close();
      await redis.quit();
      await pool.end();
    },
  };
}

// standalone mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const running = startApiWorker();
  console.log('[api-worker] started (render-normal + render-urgent)');
  const shutdown = async () => {
    console.log('[api-worker] shutting down...');
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
