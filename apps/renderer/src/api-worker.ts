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
import { Worker, UnrecoverableError, DelayedError, type Job, type WorkerOptions } from 'bullmq';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { Canvas, FontLibrary } from 'skia-canvas';
import { deriveFontIdentity, applyRuntimeFontIdentity } from './lib/font-identity.js';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { renderVideo, type RenderAssetsInput } from './index.js';
import { loadImage } from 'skia-canvas';
import { supportCodeFor } from '@pf-mediakit/shared';
import {
  checkInkPresent,
  formatInkGateFailure,
  parseInkGateMode,
  decideInkGatePolicy,
  formatInkGateLog,
} from './ink-gate.js';
import {
  composeVideoGate,
  formatVideoGateFailure,
  formatVideoGateLog,
  parseVideoGateMode,
  decideVideoGatePolicy,
} from './video-gate.js';
import { Image as SkiaImage } from 'skia-canvas';
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

// ٣٦٠: سقفُ تأجيلات cap · بعده الفشل بـTENANT_CAP_TIMEOUT.
// افتراضياً 6 × 5s = 30s سقف انتظار. دوالٌّ لا ثوابت — كي يقرأ الاختبار
// env المُحدَّث عند التشغيل (لا وقت الاستيراد).
export function getCapDelayMs(): number { return Number(process.env['TENANT_CAP_DELAY_MS'] ?? 5_000); }
export function getCapMaxDelays(): number { return Number(process.env['TENANT_CAP_MAX_DELAYS'] ?? 6); }

/**
 * ٣٦٠ · قرارُ tenant-cap · خالص (اختبارٌ مباشر بلا BullMQ).
 * يُحدّد بحسب العدّاد وسقف التأجيلات: `proceed` | `delay` | `timeout`.
 * الشرطُ الجانبيّ: يُنقص `active` counter إن كان القرار غير `proceed`
 * (المُتّصل يمرّر `activeAfterIncr` — يُنقصه بنفسه بعد القرار).
 */
export type CapDecision =
  | { action: 'proceed'; active: number }
  | { action: 'delay'; delayMs: number; nextDelaysConsumed: number }
  | { action: 'timeout'; delaysConsumed: number; message: string };

export function decideTenantCap(input: {
  activeAfterIncr: number;
  perTenantCap: number;
  tenantId: string;
  delaysConsumed: number;
  capDelayMs?: number;
  capMaxDelays?: number;
}): CapDecision {
  const { activeAfterIncr, perTenantCap, tenantId, delaysConsumed } = input;
  const delayMs = input.capDelayMs ?? getCapDelayMs();
  const maxDelays = input.capMaxDelays ?? getCapMaxDelays();
  if (activeAfterIncr <= perTenantCap) {
    return { action: 'proceed', active: activeAfterIncr };
  }
  if (delaysConsumed >= maxDelays) {
    return {
      action: 'timeout',
      delaysConsumed,
      message: `TENANT_CAP_TIMEOUT: ${tenantId} بلغ ${maxDelays} تأجيلاً (~${Math.round(maxDelays * delayMs / 1000)}s) · cap=${perTenantCap}`,
    };
  }
  return { action: 'delay', delayMs, nextDelaysConsumed: delaysConsumed + 1 };
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

// ٣٦٠ · دفنُ صفّ رندرٍ ماتَ في BullMQ · شرطيّ (لا يدهس مكتملاً/فاشلاً بالفعل).
// يُستدعى من failed-listener لسدّ الفجوة بين «BullMQ يعرف الفشل» و «DB يعرف».
async function finalizeFailedRender(
  tenantId: string, renderId: string, code: string, message: string,
): Promise<void> {
  const c = await getPgPool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    // WHERE status IN (queued, running) ⇒ صفّ فاشلٌ أو ناجحٌ لا يُلمس (idempotent-safe).
    await c.query(
      `UPDATE renders SET status='failed', completed_at=NOW(), error_code=$1, error_message=$2
       WHERE id = $3 AND status IN ('queued', 'running')`,
      [code, message, renderId],
    );
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

// IMAGE-VERTICAL: يستخلص أسماء حقول الصور من `template.layers` مباشرة —
// نفس ما يقرأه `renderFrame` (packages/engine/src/render.ts:1152). العقد
// في `packages/templates/src/types.ts:297` يعرّف `layers: readonly Layer[]`
// على المستوى الأعلى. القراءة السابقة من `t.card.layers ∪ t.video.layers`
// كانت ميّتة عمليّاً — الحقلان غير موجودَين في العقد (420 §1.2).
// **يسقط بصوت** إن لم يجد المفتاح في content مقابلاً حقيقياً في DB.
function extractImageFieldsFromTemplate(templateSnapshot: unknown): Set<string> {
  const fields = new Set<string>();
  const t = templateSnapshot as { layers?: unknown[] };
  const layers = Array.isArray(t?.layers) ? t.layers : [];
  for (const l of layers) {
    const layer = l as { type?: string; field?: string };
    if (layer?.type === 'image') fields.add(layer.field ?? 'image');
  }
  return fields;
}

async function resolveImageAssetsOrThrow(
  tenantId: string,
  templateSnapshot: unknown,
  content: Record<string, unknown>,
  tmpDir: string,
): Promise<RenderAssetsInput | undefined> {
  const imageFields = extractImageFieldsFromTemplate(templateSnapshot);
  if (imageFields.size === 0) return undefined;

  const required: Array<{ field: string; assetId: string }> = [];
  for (const field of imageFields) {
    const v = content[field];
    if (typeof v === 'string' && v.length > 0) required.push({ field, assetId: v });
  }
  if (required.length === 0) return undefined; // لا صور — fallback القالب

  const images: Record<string, { width: number; height: number }> = {};
  for (const { field, assetId } of required) {
    const storageKey = await lookupStorageKey(tenantId, assetId);
    if (!storageKey) {
      throw new Error(`IMAGE_ASSET_MISSING: field=${field} assetId=${assetId} — DB has no finalized asset row`);
    }
    let buf: Buffer;
    try { buf = await downloadAsset(storageKey); }
    catch (err) {
      throw new Error(`IMAGE_ASSET_FETCH_FAILED: field=${field} storage_key=${storageKey} err=${(err as Error).message}`);
    }
    const localPath = join(tmpDir, `${assetId}.img`);
    writeFileSync(localPath, buf);
    const img = await loadImage(localPath);
    images[field] = img as { width: number; height: number };
    // eslint-disable-next-line no-console
    console.log(`[api-worker] image loaded: field=${field} bytes=${buf.length}`);
  }
  return { images };
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

    // IMAGE-VERTICAL: حلّ أصول الصور — يُلقي بصوت إن كان content يشير إلى
    // assetId ولا يجد قيداً في DB. لا fallback صامت.
    const imageAssets = await resolveImageAssetsOrThrow(tenantId, templateSnapshot, content, tmpDir);

    // 5. Render — MP4 via renderVideo (+ FFmpeg) OR PNG via renderFrame (still)
    //
    // حارس عقد الرندر — من العقد لا من الخيال (types.ts:291-303):
    //   • كلّ قالب يحمل `layers` (schema-required) — renderFrame يعمل عليها.
    //   • `video?: TemplateVideo` **اختياريّ** — renderVideo يحتاجه للحركة.
    //   • `kind` تصريحٌ دلاليّ لا حاكمٌ فنيّ — لا يُشتقّ منه منعُ تصدير.
    //
    // لذلك: PNG يعمل على أيّ قالبٍ فيه layers (وكلّها كذلك بحكم schema).
    // MP4 يشترط video block فقط — لا يمكن تصنيع حركةٍ من عدم.
    //
    // الحارس القديم (`!template.card`) بُني على تعليقٍ خاطئ عن renderFrame —
    // راجع 420 §1.3 و 108 §1.
    const t = template as { id?: string; video?: unknown };
    if (format === 'mp4' && !t.video) {
      throw new Error(
        `MP4_UNSUPPORTED_TEMPLATE: قالب "${t.id}" لا يحمل video block — لا حركة معرَّفة، غير قابل للتصدير كفيديو`
      );
    }
    const outPath = join(tmpDir, `output.${format}`);
    if (format === 'mp4') {
      const videoResult = await renderVideo({
        template, brand, content, size: dims, outPath,
        ...(imageAssets && { assets: imageAssets }),
      });

      // VIDEO-GATE (340 · نظير ink-gate) — يقيس (duration · frames · إطار وسط
      // للحبر · فرق ٣ إطارات). **warn:** يمرّ الجميع + سطرُ لوغ موحّد.
      // **enforce:** (VIDEO_GATE_MODE=enforce) يرفع failed-output ثمّ يرمي
      // VIDEO_GATE_EMPTY. المعايرة على ٣ mp4s في تعليق video-gate.ts.
      const videoMode = parseVideoGateMode(process.env['VIDEO_GATE_MODE']);
      const midIdx = Math.floor(videoResult.frameCount / 2);
      const endIdx = videoResult.frameCount - 1;
      // نستخرج ٣ إطارات (0 · midIdx · endIdx) عبر ffmpeg-select — نفس أداة
      // renderVideo. لو فشل الاستخراج، نُسجّل ولا نرمي (لا نُدخل عطباً في
      // مسارٍ نجحت فيه ffmpeg الأصليّة).
      let videoGateFailedKey: string | undefined;
      try {
        const framesDir = join(tmpDir, 'vg-frames');
        mkdirSync(framesDir, { recursive: true });
        await execFileAsync('ffmpeg', [
          '-y', '-v', 'error',
          '-i', outPath,
          '-vf', `select='eq(n\\,0)+eq(n\\,${midIdx})+eq(n\\,${endIdx})'`,
          '-fps_mode', 'passthrough',
          join(framesDir, 'f-%d.png'),
        ]);
        const loadFrame = async (p: string): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> => {
          const buf = readFileSync(p);
          const img = new SkiaImage();
          img.src = buf;
          await img.decode();
          const c = new Canvas(img.width, img.height);
          const cctx = c.getContext('2d');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cctx.drawImage(img as any, 0, 0);
          const data = cctx.getImageData(0, 0, img.width, img.height).data;
          return { pixels: data, width: img.width, height: img.height };
        };
        const [f1, f2, f3] = await Promise.all([
          loadFrame(join(framesDir, 'f-1.png')),
          loadFrame(join(framesDir, 'f-2.png')),
          loadFrame(join(framesDir, 'f-3.png')),
        ]);
        const gate = composeVideoGate({
          durationSec: videoResult.duration,
          frameCount: videoResult.frameCount,
          middleFramePixels: f2!.pixels,
          width: f2!.width,
          height: f2!.height,
          frames: [f1!, f2!, f3!],
        });
        const decision = decideVideoGatePolicy(videoMode, gate.allOk);
        const tv = template as { id?: string };
        const line = formatVideoGateLog(decision.logKind, gate, {
          templateId: tv.id, width: dims.w, height: dims.h, fps: videoResult.fps, renderId,
        });
        // eslint-disable-next-line no-console
        console.log(line);
        if (decision.shouldThrow) {
          // enforce + فارغ — نرفع mp4 الفاشل تحت مفتاح failed-output ليبقى للفحص.
          videoGateFailedKey = `${tenantId}/renders/${renderId}/failed-output.${format}`;
          try {
            const failedBuf = readFileSync(outPath);
            await s3.send(new PutObjectCommand({
              Bucket: S3_BUCKET, Key: videoGateFailedKey, Body: failedBuf, ContentType: 'video/mp4',
            }));
          } catch (uploadErr) {
            // eslint-disable-next-line no-console
            console.error(`[api-worker] video-gate: failed to preserve artifact at ${videoGateFailedKey}: ${(uploadErr as Error).message}`);
          }
          throw new Error(formatVideoGateFailure(gate, videoGateFailedKey));
        }
      } catch (gateErr) {
        // إن كانت الرمية من الحارس نفسه (VIDEO_GATE_EMPTY أو mismatch) نُعيد الرمي.
        // أمّا لو فشلت أداة استخراج الإطارات (ffmpeg select · loadFrame)، نُسجّل ولا نُسقط الرندر.
        const msg = gateErr instanceof Error ? gateErr.message : String(gateErr);
        if (msg.startsWith('VIDEO_GATE_') || msg.startsWith('video-gate:')) throw gateErr;
        // eslint-disable-next-line no-console
        console.error(`[api-worker] video-gate: frame extraction failed, skipping gate: ${msg}`);
      }
    } else {
      // PNG-EXPORT: مرّ بالمحرك بنفس assets — لا شكل ثانٍ للأصول، لا stub.
      const { renderFrame } = await import('@pf-mediakit/engine');
      const canvas = new Canvas(dims.w, dims.h);
      const ctx = canvas.getContext('2d');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderFrame({
        ctx: ctx as any,
        size: dims,
        template,
        brand,
        content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(imageAssets && { assets: imageAssets as any }),
      });

      // INK-GATE (701 · وضع warn-only افتراضياً · 701b) — يقيس كثافةَ الحوافّ
      // على القماش الحيّ قبل الترميز. **warn:** كلُّ رندرٍ يمرّ + سطرُ لوغ
      // موحّد (الناجحُ ok · المشبوهُ INK_GATE_WOULD_FAIL). **enforce:**
      // (INK_GATE_MODE=enforce) يرفع الملفَّ الفاشلَ إلى S3 ثمّ يرمي
      // INK_GATE_EMPTY. الحدُّ 0.05٪ مُعايَرٌ على أربع عيّنات — أسبوعُ لوغٍ
      // في warn يعطينا التوزيعَ قبل التشديد.
      const inkMode = parseInkGateMode(process.env['INK_GATE_MODE']);
      const pixels = ctx.getImageData(0, 0, dims.w, dims.h).data;
      const ink = checkInkPresent(pixels, dims.w, dims.h);
      const decision = decideInkGatePolicy(inkMode, ink.hasInk);
      const t2 = template as { id?: string };
      const logLine = formatInkGateLog(decision.logKind, ink, {
        templateId: t2.id, width: dims.w, height: dims.h, renderId,
      });
      // eslint-disable-next-line no-console
      console.log(logLine);
      if (decision.shouldThrow) {
        // enforce + فارغ — نحفظ الملفَّ الفاشل قبل الرمي ليبقى للفحص.
        const failedBuf = await canvas.toBuffer('png');
        const failedKey = `${tenantId}/renders/${renderId}/failed-output.${format}`;
        try {
          await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET, Key: failedKey, Body: failedBuf, ContentType: 'image/png',
          }));
        } catch (uploadErr) {
          // eslint-disable-next-line no-console
          console.error(`[api-worker] ink-gate: failed to preserve artifact at ${failedKey}: ${(uploadErr as Error).message}`);
        }
        throw new Error(formatInkGateFailure(ink, failedKey));
      }
      writeFileSync(outPath, await canvas.toBuffer('png'));
    }

    // 6. Upload — output + plan snapshot (417 §٥)
    // مستخلصُ الخطّة يُكتب بجوار الرفع لبناء حارس «العنوان المفقود» لاحقاً.
    // لا حسابَ جديد: buildRenderPlan تُعيد استعمالَ ما يحسبه المحرك أصلاً
    // (`prepareHeadline` / `computeHeadlineLayout`). فشلُ الخطّة لا يُسقط الرندر.
    const outputBuf = readFileSync(outPath);
    const outputKey = `${tenantId}/renders/${renderId}/output.${format}`;
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: outputKey, Body: outputBuf,
      ContentType: format === 'mp4' ? 'video/mp4' : 'image/png',
    }));

    try {
      const { buildRenderPlan } = await import('@pf-mediakit/engine');
      const planCanvas = new Canvas(dims.w, dims.h);
      const planCtx = planCanvas.getContext('2d');
      const plan = buildRenderPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ctx: planCtx as any,
        size: dims,
        template,
        brand,
        content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(imageAssets && { assets: imageAssets as any }),
      });
      const planSnapshot = {
        renderId,
        tenantId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        templateId: (template as any).id ?? null,
        format,
        size: dims,
        headline: plan.headline
          ? {
              fontSize: plan.headline.fontSize,
              lineHeight: plan.headline.lineHeight,
              chosenBoxW: plan.headline.chosenBoxW,
              rightX: plan.headline.rightX,
              centerX: plan.headline.centerX,
              firstBaseline: plan.headline.firstBaseline ?? null,
              lastBaseline: plan.headline.lastBaseline ?? null,
              align: plan.headline.align,
              bounds: plan.headline.bounds ?? null,
              linesCount: plan.headline.linesJustified.length,
            }
          : null,
        headlineLineCount: plan.headlineLineCount,
        generatedAt: new Date().toISOString(),
      };
      const planKey = `${tenantId}/renders/${renderId}/output.plan.json`;
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: planKey,
        Body: Buffer.from(JSON.stringify(planSnapshot, null, 2)),
        ContentType: 'application/json',
      }));
      // eslint-disable-next-line no-console
      console.log(`[api-worker] plan snapshot uploaded: ${planKey}`);
    } catch (planErr) {
      // إخفاقُ الخطّة لا يُسقط الرندر — يُدَوَّن كتحذير.
      // eslint-disable-next-line no-console
      console.warn(`[api-worker] plan snapshot skipped: ${(planErr as Error).message}`);
    }

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
    const code = msg.startsWith('FONT_') || msg.startsWith('TEMPLATE_') || msg.startsWith('INVALID_') || msg.startsWith('INK_GATE_') || msg.startsWith('VIDEO_GATE_')
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
  // IMAGE-VERTICAL: مسار CLI يستقبل `assets` جاهزة (URLs محلولة) من الحمولة —
  // لا يستعلم DB. loadImage(url) لكل واحد + تمرير للمحرك.
  const cliImages: Record<string, { width: number; height: number }> | undefined = job.data.assets
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(job.data.assets).map(async ([field, spec]) => {
            const img = await loadImage(spec.url);
            return [field, img as { width: number; height: number }] as const;
          }),
        ),
      )
    : undefined;
  await renderVideo({
    template, brand: job.data.brand, content: job.data.content,
    size: job.data.size, outPath: job.data.outPath,
    ...(job.data.fps !== undefined && { fps: job.data.fps }),
    ...(cliImages && { assets: { images: cliImages } }),
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
async function processJob(job: Job, cfg: QueueConfig, perTenantCap: number, token?: string): Promise<void> {
  const tenantId = (job.data as { tenantId?: string }).tenantId;
  if (!tenantId) throw new UnrecoverableError('[api-worker] tenantId missing');
  const conn = getConnection();
  const key = tenantKey(tenantId);
  const activeAfterIncr = await conn.incr(key);
  const data = job.data as { __capDelays?: number };
  const decision = decideTenantCap({
    activeAfterIncr,
    perTenantCap,
    tenantId,
    delaysConsumed: data.__capDelays ?? 0,
  });
  if (decision.action !== 'proceed') {
    await conn.decr(key); // نُنقص العدّاد فوراً — لا نحجز مكاناً لتأجيلٍ لن يمرّ الآن.
    if (decision.action === 'timeout') {
      throw new UnrecoverableError(decision.message);
    }
    // delay: نطلب من BullMQ تأجيل المهمّة CAP_DELAY_MS
    if (!token) {
      // defensive · token غائب ⇒ لا يمكن moveToDelayed. ندفن بدل حلقةٍ عمياء.
      throw new UnrecoverableError(`[tenant-cap] token missing — cannot delay · tenant=${tenantId}`);
    }
    await job.updateData({ ...data, __capDelays: decision.nextDelaysConsumed });
    await job.moveToDelayed(Date.now() + decision.delayMs, token);
    // بروتوكول BullMQ: بعد moveToDelayed ارمِ DelayedError كي لا يعتبرها complete/fail.
    throw new DelayedError();
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
    const w = new Worker(cfg.bullmqName, async (job, token) => processJob(job, cfg, perTenantCap, token), options);

    // ٣٦٠ · failed-listener: يدفن الميّت في DB حتى لو مات قبل processApiJob.
    // يعالج زومبي «renders.status=queued لصفٍّ ماتَ في BullMQ» — أيّاً كان
    // مصدر الرمي (TENANT_CAP_TIMEOUT · قتل عامل · panic في التحميل …).
    // النداءات المكرَّرة على صفٍّ فاشلٍ سلفاً حياديّة (WHERE status IN queued/running).
    w.on('failed', async (job, err) => {
      if (!job || !isApiJob(job.data)) return; // CLI-shape لا يمسّ DB
      const { renderId, tenantId } = job.data;
      const msg = err instanceof Error ? err.message : String(err);
      const code = msg.startsWith('TENANT_CAP_') ? msg.split(':')[0]!
        : msg.startsWith('FONT_') || msg.startsWith('TEMPLATE_') || msg.startsWith('INVALID_')
          || msg.startsWith('INK_GATE_') || msg.startsWith('VIDEO_GATE_')
          ? msg.split(':')[0]!
          : 'RENDER_FAILED';
      try {
        await finalizeFailedRender(tenantId, renderId, code, msg.slice(0, 500));
        // ٣٧٠: supportCode في اللوغ ⇒ دعمٌ يبحث بـgrep 'support=MK-XXXX-XXXX' يجد الحادثة.
        const supportCode = supportCodeFor(renderId);
        // eslint-disable-next-line no-console
        console.log(`[api-worker] failed-listener sync · render=${renderId} · code=${code} · support=${supportCode}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[api-worker] failed-listener sync error · render=${renderId}: ${(e as Error).message}`);
      }
    });

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
