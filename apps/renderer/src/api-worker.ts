/**
 * api-worker — العامل الوحيد بعد A18.6. يستهلك 4 طوابير:
 *   render-urgent  · concurrency 2 · timeout 30s
 *   render-normal  · concurrency floor(cores/2) · timeout 180s
 *   render-edit    · concurrency 1 · timeout 600s (تحرير يتنافس على القرص — docs/10)
 *   render-batch   · concurrency 1 · بلا timeout (يعمل ليلاً)
 *
 * الحصّة العادلة (docs/08 §4): cap مطلق = ceil((urgent + normal)/2).
 * INCR `tenant:{id}:active` قبل الرندر · DECR في finally مهما كانت النتيجة.
 *
 * دعم شكلَين للحمولة (router على مفتاح `renderId`):
 *   1. API-shape (POST /v1/renders):
 *      {renderId, tenantId, brandSnapshot, templateSnapshot, content, size, format}
 *      ↳ fetch assets from S3 → renderVideo/canvas → upload → UPDATE renders
 *   2. CLI-shape (dev scripts): {tenantId, templateId, brand, content, size:{w,h}, outPath}
 *      ↳ TEMPLATES lookup + renderVideo → local outPath (no S3, no DB)
 */
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Worker, UnrecoverableError, type Job, type WorkerOptions } from 'bullmq';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { Canvas, FontLibrary } from 'skia-canvas';
import { deriveFontIdentity, applyRuntimeFontIdentity } from './lib/font-identity.js';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { renderVideo } from './index.js';
import {
  QUEUE_NAMES, BULLMQ_PREFIX, getConnection, type QueueName,
} from './queues.js';
import type { RenderJobInput } from './validate.js';
import { getTempSpaceLimitBytes } from './alerts.js';

const execFileAsync = promisify(execFile);

const { Pool } = pg;

// ── إعدادات ─────────────────────────────────────────
const DATABASE_URL_APP = process.env['DATABASE_URL_APP'];
const S3_ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:19043';
const S3_REGION = process.env['S3_REGION'] ?? 'us-east-1';
const S3_BUCKET = process.env['S3_BUCKET'] ?? 'mk-assets-dev';
const S3_ACCESS_KEY_ID = process.env['S3_ACCESS_KEY_ID'] ?? 'minioadmin';
const S3_SECRET_ACCESS_KEY = process.env['S3_SECRET_ACCESS_KEY'] ?? 'minioadmin';

let pgPool: pg.Pool | null = null;
function getPgPool(): pg.Pool {
  if (!pgPool) {
    if (!DATABASE_URL_APP) throw new Error('DATABASE_URL_APP required for API-shape jobs');
    pgPool = new Pool({ connectionString: DATABASE_URL_APP, max: 5 });
  }
  return pgPool;
}

const s3 = new S3Client({
  region: S3_REGION, endpoint: S3_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
});

// ── تكوين الطوابير (منقول من worker.ts) ─────────────
const CORES = os.cpus().length;
const HALF_CORES = Math.max(1, Math.floor(CORES / 2));
const NORMAL_CONCURRENCY = Math.max(1, Number(process.env['WORKER_NORMAL'] ?? HALF_CORES));

export interface QueueConfig {
  readonly name: QueueName;
  readonly bullmqName: string;
  readonly concurrency: number;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIGS: Readonly<Record<QueueName, QueueConfig>> = {
  urgent: { name: 'urgent', bullmqName: 'render-urgent', concurrency: 2, timeoutMs: 30_000 },
  normal: { name: 'normal', bullmqName: 'render-normal', concurrency: NORMAL_CONCURRENCY, timeoutMs: 180_000 },
  edit:   { name: 'edit',   bullmqName: 'render-edit',   concurrency: 1, timeoutMs: 600_000 },
  batch:  { name: 'batch',  bullmqName: 'render-batch',  concurrency: 1, timeoutMs: 0 },
};

function computePerTenantCap(cfgs: Readonly<Record<QueueName, QueueConfig>>): number {
  return Math.max(1, Math.ceil((cfgs.urgent.concurrency + cfgs.normal.concurrency) / 2));
}
function tenantKey(tenantId: string): string {
  return `${BULLMQ_PREFIX}:tenant:${tenantId}:active`;
}
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[timeout] ${label} تجاوزت ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); },
           (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── API payload ──────────────────────────────────────
interface ApiRenderJobPayload {
  renderId: string; tenantId: string; projectId: string;
  size: 'x' | 'instagram' | 'feed' | 'reel';
  format: 'png' | 'mp4';
  brandSnapshot: Record<string, unknown>;
  templateSnapshot: Record<string, unknown>;
  content: Record<string, unknown>;
}
function isApiJob(data: unknown): data is ApiRenderJobPayload {
  return typeof data === 'object' && data !== null && 'renderId' in data && 'brandSnapshot' in data;
}

const SIZE_MAP: Record<string, { w: number; h: number }> = {
  x: { w: 1080, h: 1080 }, instagram: { w: 1080, h: 1440 },
  feed: { w: 1080, h: 1350 }, reel: { w: 1080, h: 1920 },
};

// ── DB helpers ─────────────────────────────────────
async function lookupStorageKey(tenantId: string, assetId: string): Promise<string | null> {
  const c = await getPgPool().connect();
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
async function updateRender(tenantId: string, renderId: string, patch: Record<string, unknown>): Promise<void> {
  const c = await getPgPool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const params = [...Object.values(patch), renderId];
    await c.query(`UPDATE renders SET ${sets} WHERE id = $${params.length}`, params);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function downloadAsset(storageKey: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKey }));
  if (!r.Body) throw new Error(`asset empty: ${storageKey}`);
  const chunks: Buffer[] = [];
  for await (const chunk of r.Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function extractFontAssetIds(brand: Record<string, unknown>): Array<{ family: string; assetId: string }> {
  const out: Array<{ family: string; assetId: string }> = [];
  const fonts = (brand as { fonts?: Record<string, { family?: string; assetId?: string; weights?: Record<string, { assetId?: string }> }> }).fonts;
  if (!fonts) return out;
  for (const f of Object.values(fonts)) {
    if (f?.family && f?.assetId) out.push({ family: f.family, assetId: f.assetId });
    if (f?.weights && f?.family) {
      for (const w of Object.values(f.weights)) {
        if (w?.assetId) out.push({ family: f.family, assetId: w.assetId });
      }
    }
  }
  return out;
}

// ── API job processor ────────────────────────────
async function processApiJob(job: Job<ApiRenderJobPayload>): Promise<void> {
  const { renderId, tenantId, brandSnapshot, templateSnapshot, content, size, format } = job.data;
  const tmpDir = join(tmpdir(), `mk-render-${renderId}`);
  const startedAt = new Date();
  await updateRender(tenantId, renderId, { status: 'running', started_at: startedAt });

  try {
    mkdirSync(tmpDir, { recursive: true });

    // 1. Fetch font assets (L-46)
    const fontAssets = extractFontAssetIds(brandSnapshot);
    const loadedFonts: Array<{ family: string; path: string }> = [];
    for (const fa of fontAssets) {
      const storageKey = await lookupStorageKey(tenantId, fa.assetId);
      if (!storageKey) throw new Error(`FONT_ASSET_MISSING: assetId=${fa.assetId}`);
      let buf: Buffer;
      try { buf = await downloadAsset(storageKey); }
      catch (err) { throw new Error(`FONT_ASSET_FETCH_FAILED: storage_key=${storageKey} err=${(err as Error).message}`); }
      const localPath = join(tmpDir, `${fa.assetId}.font`);
      writeFileSync(localPath, buf);
      // 141-FONT-IDENTITY-BY-ASSET: نُسجّل باسم مشتقّ من assetId لا اسم العائلة.
      // شرح تفصيليّ + خطّة إزالة الـshim: `lib/font-identity.ts` رأس الملفّ.
      const runtimeFamily = deriveFontIdentity(fa);
      FontLibrary.use(runtimeFamily, [localPath]);
      loadedFonts.push({ family: runtimeFamily, path: localPath });
      // eslint-disable-next-line no-console
      console.log(`[api-worker] font loaded: runtime=${runtimeFamily} display=${fa.family} path=${localPath}`);
    }

    // 2. Parse + validate template
    const { validateTemplate, TemplateValidationError } = await import('@pf-mediakit/templates');
    let template;
    try { template = validateTemplate(templateSnapshot); }
    catch (err) {
      if (err instanceof TemplateValidationError) throw new Error(`TEMPLATE_SNAPSHOT_INVALID: [${err.path}] ${err.message}`);
      throw err;
    }

    // 3. Resolve brand + apply runtime font identity (shim · 141)
    // engine يقرأ `brand.fonts.primary.family` لبناء ctx.font. نستبدله
    // بـruntime المشتقّ ليتطابق مع ما سجّل api-worker في FontLibrary.
    // يموت هذا السطر حين ينفّذ mk deriveFamily داخل resolveBrand.
    const { resolveBrand } = await import('@pf-mediakit/engine');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brand = applyRuntimeFontIdentity(resolveBrand(brandSnapshot as any));

    // 4. size mapping
    const dims = SIZE_MAP[size];
    if (!dims) throw new Error(`INVALID_SIZE: ${size}`);

    // 5. Render — MP4 via renderVideo (+ FFmpeg) OR PNG via canvas
    const outPath = join(tmpDir, `output.${format}`);
    if (format === 'mp4') {
      await renderVideo({ template, brand, content, size: dims, outPath });
    } else {
      const canvas = new Canvas(dims.w, dims.h);
      const ctx = canvas.getContext('2d');
      const brandC = brand as { colors?: { surface?: string } };
      ctx.fillStyle = brandC.colors?.surface ?? '#111';
      ctx.fillRect(0, 0, dims.w, dims.h);
      if (loadedFonts.length > 0) ctx.font = `bold 80px "${loadedFonts[0]!.family}"`;
      else ctx.font = 'bold 80px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(content['headline'] ?? 'اختبار'), dims.w / 2, dims.h / 2);
      writeFileSync(outPath, await canvas.toBuffer('png'));
    }

    // 6. Upload
    const outputBuf = readFileSync(outPath);
    const outputKey = `${tenantId}/renders/${renderId}/output.${format}`;
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: outputKey, Body: outputBuf,
      ContentType: format === 'mp4' ? 'video/mp4' : 'image/png',
    }));

    // 7. Update DB
    const completedAt = new Date();
    await updateRender(tenantId, renderId, {
      status: 'succeeded', completed_at: completedAt,
      output_storage_key: outputKey,
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    });
    // eslint-disable-next-line no-console
    console.log(`[api-worker] job ${renderId} succeeded (${outputBuf.length} bytes, output=${outputKey})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.startsWith('FONT_') || msg.startsWith('TEMPLATE_') || msg.startsWith('INVALID_')
      ? msg.split(':')[0]! : 'RENDER_FAILED';
    await updateRender(tenantId, renderId, {
      status: 'failed', completed_at: new Date(),
      error_code: code, error_message: msg.slice(0, 500),
    });
    // eslint-disable-next-line no-console
    console.error(`[api-worker] job ${renderId} failed: ${msg}`);
    throw err;
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── CLI job processor (منقول من worker.ts) ─────
async function processCliJob(job: Job<RenderJobInput>): Promise<void> {
  const { TEMPLATES } = await import('@pf-mediakit/templates');
  const template = TEMPLATES[job.data.templateId];
  if (!template) throw new UnrecoverableError(`[api-worker] CLI template ${job.data.templateId} غير معروف`);
  await renderVideo({
    template, brand: job.data.brand, content: job.data.content,
    size: job.data.size, outPath: job.data.outPath,
    ...(job.data.fps !== undefined && { fps: job.data.fps }),
  });
}

// ── مراقب المساحة المؤقتة (LIMITS-1 §3) ───────────
/**
 * يقيس حجم tmpdir الجذر دورياً أثناء المهمة الطويلة. إن تجاوز الحدّ
 * (يُقرأ من `getTempSpaceLimitBytes()` — env `TEMP_SPACE_LIMIT_BYTES` مع
 * افتراضي 25GB)، يرفع علماً — الحلقة الرئيسية تفحصه وترمي
 * TempSpaceExceededError، finally ينظّف tmpDir الخاص بالمهمة.
 *
 * فترة القياس افتراضياً 30s، تُقرأ من env `TEMP_SPACE_POLL_MS`
 * (ALERTS-WIRE §2: الاختبار يستعمل 200ms + حدّ 1MB لإثبات السلوك).
 *
 * يُطبَّق فقط لطوابير `edit` و `batch` (المتوقّعة تلمس القرص فعلياً).
 * urgent/normal يعملون بأنابيب FFmpeg بلا ملفات مؤقتة كبيرة (ADR-008).
 */
export class TempSpaceExceededError extends Error {
  constructor(usedBytes: number, limit: number) {
    super(`[temp-space] مساحة مؤقتة ${usedBytes} بايت تجاوزت الحدّ ${limit} بايت`);
    this.name = 'TempSpaceExceededError';
  }
}

async function measureTmpDirBytes(path: string): Promise<number> {
  try {
    // du -sk: KiB, نضربها × 1024
    const { stdout } = await execFileAsync('du', ['-sk', path], { timeout: 5000 });
    const kib = Number(stdout.split(/\s+/)[0] ?? 0);
    return kib * 1024;
  } catch { return 0; }
}

/**
 * يُشغّل monitor بشكل غير متزامن بجانب المهمة الطويلة. يرمي إن تجاوز
 * الحدّ. Promise.race مع doJob() — أيّهما ينتهي أوّلاً ينهي الآخر عبر
 * AbortSignal.
 */
async function withTempSpaceMonitor<T>(
  doJob: () => Promise<T>, tmpDirRoot: string,
): Promise<T> {
  const abort = new AbortController();
  const limit = getTempSpaceLimitBytes();
  const pollMs = Number(process.env['TEMP_SPACE_POLL_MS'] ?? 30_000);
  const monitor = (async () => {
    while (!abort.signal.aborted) {
      const used = await measureTmpDirBytes(tmpDirRoot);
      if (used > limit) throw new TempSpaceExceededError(used, limit);
      await new Promise((r) => setTimeout(r, pollMs));
      if (abort.signal.aborted) return;
    }
  })();
  try {
    return await Promise.race([doJob(), monitor as Promise<T>]);
  } finally {
    abort.abort();
  }
}

// ── معالج مُوحَّد مع fair-share + timeout ──────────
async function processJob(job: Job, cfg: QueueConfig, perTenantCap: number): Promise<void> {
  const tenantId = (job.data as { tenantId?: string }).tenantId;
  if (!tenantId) throw new UnrecoverableError('[api-worker] tenantId missing');
  const conn = getConnection();
  const key = tenantKey(tenantId);
  const active = await conn.incr(key);
  if (active > perTenantCap) {
    await conn.decr(key);
    throw new Error(`[tenant-cap] ${tenantId} at cap (${active - 1}/${perTenantCap})`);
  }
  try {
    const doJob = async () => {
      if (isApiJob(job.data)) await processApiJob(job as Job<ApiRenderJobPayload>);
      else await processCliJob(job as Job<RenderJobInput>);
    };
    // LIMITS-1: temp-space monitor مفعَّل لـedit و batch (المتوقّعة تلمس القرص فعلياً).
    // urgent/normal يعملون بأنابيب FFmpeg (ADR-008) — بلا ملفات مؤقتة كبيرة.
    const wrapped = (cfg.name === 'edit' || cfg.name === 'batch')
      ? () => withTempSpaceMonitor(doJob, tmpdir())
      : doJob;
    await withTimeout(wrapped(), cfg.timeoutMs, `${cfg.name}#${job.id}`);
  } finally { await conn.decr(key); }
}

// ── تشغيل الأربعة ──────────────────────────────────
export interface RunningApiWorkers {
  readonly workers: readonly Worker[];
  stop(): Promise<void>;
}

export function startApiWorker(
  cfgs: Readonly<Record<QueueName, QueueConfig>> = DEFAULT_CONFIGS,
): RunningApiWorkers {
  const perTenantCap = computePerTenantCap(cfgs);
  const workers: Worker[] = [];
  for (const name of QUEUE_NAMES) {
    const cfg = cfgs[name];
    const options: WorkerOptions = {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
      concurrency: cfg.concurrency,
    };
    const w = new Worker(cfg.bullmqName, async (job) => processJob(job, cfg, perTenantCap), options);
    workers.push(w);
  }
  return {
    workers,
    async stop() {
      await Promise.all(workers.map((w) => w.close()));
      if (pgPool) { await pgPool.end(); pgPool = null; }
    },
  };
}

// standalone mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const running = startApiWorker();
  const perTenantCap = computePerTenantCap(DEFAULT_CONFIGS);
  const concurrencies = QUEUE_NAMES.map((n) => `${n}=${DEFAULT_CONFIGS[n].concurrency}`).join(', ');
  console.log(`[api-worker] started · queues: ${concurrencies} · perTenantCap: ${perTenantCap}`);
  const shutdown = async () => {
    console.log('[api-worker] shutting down...');
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Legacy exports for dev scripts (was startWorkers in worker.ts)
export const startWorkers = startApiWorker;
export { computePerTenantCap, tenantKey };

/**
 * تُصدَّر لغرض الاختبار السلوكي (ALERTS-WIRE §2 G-AW-3):
 * حقن حدّ صغير عبر `TEMP_SPACE_LIMIT_BYTES` env + `TEMP_SPACE_POLL_MS` env
 * ⇒ مهمة تكتب > الحدّ تُقتل. لا استعمال إنتاجي مباشر — استعمله عبر
 * withTempSpaceMonitor في processJob.
 */
export { withTempSpaceMonitor };
