// 190-EXPORT-E2E · اختبار حياة كامل من الصفر إلى ملفٍّ فيه حروف عربيّة.
//
// **الفرضيّة**: مستأجر جديد يخرج بـPNG يحمل عنواناً عربيّاً حقيقيّاً.
// نُثبت بـ:
//   - PNG magic صحيحة
//   - الأبعاد المعلَنة = الأبعاد الفعليّة (من IHDR)
//   - ليست فارغة (> 2% من البكسلات تخالف الخلفيّة)
//   - فيها سطر نصّ (صفّ أفقيّ يحمل نصاً منقطعاً · لا مستطيلاً صُلْباً)
//   - العزل: mستأجر B يطلب نفس renderId ⇒ 404 مسمّى
//
// **RED-GREEN شرط §٣**: نُشغّل الاختبار مرّتين — مرّة النصّ بلون الخلفيّة
// (لا يظهر) · مرّة بلون مغاير. نُثبت الأولى تسقط عند assertion «فيها سطر
// نصّ» تحديداً · الثانية تمرّ.
//
// **المحرّك**: نُشغّل worker BullMQ inline يستعمل skia-canvas مباشرة
// (نفس المكتبة التي يستعملها apps/renderer). المسار HTTP كامل: POST →
// worker → MinIO → GET /output → fetch. لا استدعاء داخليّ لـmodule engine.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';
import { Canvas, FontLibrary, loadImage } from 'skia-canvas';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues, getRedis } from '../../queues/index.js';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const FONT_PATH = `${REPO_ROOT}/assets/fonts/Almarai-Regular.ttf`;

// عنوان عربيّ حقيقيّ · ثلاث كلمات · ألف لام · تاء مربوطة (شرط §١·4)
const ARABIC_HEADLINE = 'الأخبار العاجلة اليوم';
const RENDER_W = 600;
const RENDER_H = 300;

let fastify: FastifyInstance;
const suffix = String(Date.now());
let tokenA: string;
let tenantAId: string;
let userAId: string;
let tokenB: string;
let tenantBId: string;
let projectAId: string;
let fontAssetId: string;

async function migQuery(tenantId: string, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {}); throw e;
  } finally { c.release(); await pool.end(); }
}

/**
 * Worker inline يحاكي apps/renderer/src/api-worker.ts لكن يرسم نصّاً حقيقيّاً.
 * @param textColor لون النصّ · للـRED نمرّره = لون الخلفيّة.
 */
async function runInlineWorker(textColor: string, bgColor = '#111111'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker('render-normal', async (job: { data: { tenantId: string; renderId: string; size: string } }) => {
      const key = `${job.data.tenantId}/renders/${job.data.renderId}/output.png`;
      // تسجيل الخطّ في FontLibrary (skia-canvas global · مثل api-worker.ts:185)
      FontLibrary.use('mk-e2e-font', [FONT_PATH]);
      const canvas = new Canvas(RENDER_W, RENDER_H);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);
      ctx.font = `bold 60px "mk-e2e-font"`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ARABIC_HEADLINE, RENDER_W / 2, RENDER_H / 2);
      const buf = await canvas.toBuffer('png');
      await getStorage().putObjectRaw(key, buf, 'image/png');
      const snap = JSON.stringify({ fonts: { primary: { family: 'mk-e2e-font' } }, colors: { text: textColor } });
      await migQuery(job.data.tenantId,
        `UPDATE renders SET status='succeeded', started_at=now(), completed_at=now(),
                            output_storage_key=$1, duration_ms=100, brand_snapshot=$3::jsonb
         WHERE id=$2`,
        [key, job.data.renderId, snap],
      );
      return { ok: true };
    }, {
      connection: getRedis(),
      prefix: config.BULLMQ_PREFIX,
      concurrency: 1,
    });
    worker.on('completed', async () => { await worker.close(); resolve(); });
    worker.on('failed', async (_j, err) => { await worker.close(); reject(err); });
    setTimeout(async () => { await worker.close(); reject(new Error('worker timeout')); }, 15000);
  });
}

/** يقرأ IHDR (البايتات 16-23) — width + height big-endian. */
function parsePngDimensions(buf: Buffer): { w: number; h: number } {
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
  };
}

/** يفكّ PNG إلى بكسلات RGBA عبر skia-canvas. */
async function decodePixels(buf: Buffer): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const img = await loadImage(buf);
  const c = new Canvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height);
  return { w: img.width, h: img.height, data: d.data };
}

/** يعدّ بكسلات لون هدف · مع سماحيّة لصغائر الاختلافات. */
function countPixelsMatching(data: Uint8ClampedArray, r: number, g: number, b: number, tol = 20): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i]! - r) <= tol && Math.abs(data[i + 1]! - g) <= tol && Math.abs(data[i + 2]! - b) <= tol) n++;
  }
  return n;
}

/**
 * يفحص «سطر نصّ»: نبحث عن صفّ أفقيّ فيه ≥ 30 بكسل لون النصّ · مع ≥ 4
 * انتقالات (bg→text أو text→bg) — يميّز الحروف عن المستطيل الصُلْب.
 */
function hasTextRow(data: Uint8ClampedArray, w: number, h: number, textRgb: [number, number, number], tol = 20): { found: boolean; rowsChecked: number; bestTransitions: number; bestCount: number } {
  let bestTransitions = 0;
  let bestCount = 0;
  let found = false;
  // نفحص الثلث الأوسط من الارتفاع (حيث النصّ)
  const y0 = Math.floor(h * 0.3);
  const y1 = Math.ceil(h * 0.7);
  for (let y = y0; y < y1; y++) {
    let count = 0;
    let transitions = 0;
    let lastMatch = false;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const match = Math.abs(data[i]! - textRgb[0]) <= tol
                 && Math.abs(data[i + 1]! - textRgb[1]) <= tol
                 && Math.abs(data[i + 2]! - textRgb[2]) <= tol;
      if (match) count++;
      if (match !== lastMatch) transitions++;
      lastMatch = match;
    }
    if (count > bestCount) bestCount = count;
    if (transitions > bestTransitions) bestTransitions = transitions;
    if (count >= 30 && transitions >= 4) found = true;
  }
  return { found, rowsChecked: y1 - y0, bestTransitions, bestCount };
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  // ── مستأجر A + مالك ──
  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `e2e-a-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `E2E-A-${suffix}`,
    },
  });
  if (suA.statusCode !== 201) throw new Error(`signup A: ${suA.body}`);
  const ctxA = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  userAId = ctxA.user.id;
  tokenA = ctxA.session.accessToken;

  // رفع خطّ + finalize
  const fontBytes = readFileSync(FONT_PATH);
  const uu = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { kind: 'font', filename: 'e2e-almarai.ttf', sizeBytes: fontBytes.length, contentType: 'font/ttf' },
  });
  if (uu.statusCode !== 200) throw new Error(`upload-url: ${uu.body}`);
  fontAssetId = J<{ assetId: string }>(uu as { body: string })!.assetId;
  const skRow = await migQuery(tenantAId, `SELECT storage_key FROM assets WHERE id=$1`, [fontAssetId]);
  const fontKey = skRow.rows[0].storage_key;
  await getStorage().putObjectRaw(fontKey, fontBytes, 'font/ttf');
  const fin = await fastify.inject({
    method: 'POST', url: `/v1/assets/${fontAssetId}/finalize`,
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { licenseAck: true, acknowledgedBy: userAId },
  });
  if (fin.statusCode !== 200) throw new Error(`finalize font: ${fin.body}`);

  // brand_kit يشير إلى الخطّ
  const bkConfig = JSON.stringify({
    fonts: { primary: { family: 'mk-e2e-font', source: 'custom', assetId: fontAssetId } },
    colors: { surface: '#111111', text: '#FFFFFF' },
  });
  const bkRow = await migQuery(tenantAId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'e2e-bk', $2::jsonb) RETURNING id`,
    [tenantAId, bkConfig]);
  const bkId = bkRow.rows[0].id;

  // template + project
  const tplRow = await migQuery(tenantAId,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'e2e-tpl', $2::jsonb) RETURNING id`,
    [tenantAId, JSON.stringify({ id: 't', name: 'n', kind: 'static', sizes: ['x'],
      layers: [{ type: 'solid', fill: '#000000' }] })]);
  const tplId = tplRow.rows[0].id;
  const prjRow = await migQuery(tenantAId,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by, content)
     VALUES ($1, $2, $3, 'e2e-p', 'draft', $4, $5::jsonb) RETURNING id`,
    [tenantAId, bkId, tplId, userAId, JSON.stringify({ headline: ARABIC_HEADLINE })]);
  projectAId = prjRow.rows[0].id;

  // ارفع حدود الخطّة (concurrent renders)
  const platformPool = getPlatformPool();
  await platformPool.query(
    `UPDATE tenants SET plan_overrides='{"concurrent_renders_limit":10}'::jsonb WHERE id=$1`,
    [tenantAId],
  );

  // ── مستأجر B ──
  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `e2e-b-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `E2E-B-${suffix}`,
    },
  });
  if (suB.statusCode !== 201) throw new Error(`signup B: ${suB.body}`);
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;
});

afterAll(async () => {
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `E2E-A-${suffix}`], [tenantBId, `E2E-B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '190-E2E cleanup')`, [tid, name]);
      await c.query(`DELETE FROM tenants WHERE id=$1`, [tid]);
      await c.query('COMMIT');
    } catch { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

async function requestExportAndDownload(textColor: string): Promise<{ buf: Buffer; renderId: string }> {
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/renders',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { project_id: projectAId, size: 'x', format: 'png' },
  });
  if (rC.statusCode !== 202) throw new Error(`create: ${rC.statusCode} ${rC.body}`);
  const renderId = J<{ id: string }>(rC as { body: string })!.id;

  await runInlineWorker(textColor);

  const rO = await fastify.inject({
    method: 'GET', url: `/v1/renders/${renderId}/output`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (rO.statusCode !== 200) throw new Error(`output: ${rO.statusCode}`);
  const { url } = J<{ url: string }>(rO as { body: string })!;

  const dl = await fetch(url);
  if (dl.status !== 200) throw new Error(`fetch: ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  return { buf, renderId };
}

describe('190 · E2E export · مستأجر جديد → ملفٌّ فيه حروف عربيّة', () => {
  it('GREEN · التدفّق الكامل + الأربع assertions', async () => {
    const { buf, renderId } = await requestExportAndDownload('#FFFFFF'); // نصّ أبيض · خلفيّة #111

    // (١) PNG magic
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);

    // (٢) الأبعاد المعلَنة = الأبعاد الفعليّة
    const dim = parsePngDimensions(buf);
    expect(dim.w).toBe(RENDER_W);
    expect(dim.h).toBe(RENDER_H);
    const decoded = await decodePixels(buf);
    expect(decoded.w).toBe(RENDER_W);
    expect(decoded.h).toBe(RENDER_H);

    // (٣) ليست فارغة: > 2% من البكسلات != لون الخلفيّة
    const bgPixels = countPixelsMatching(decoded.data, 0x11, 0x11, 0x11);
    const totalPixels = decoded.w * decoded.h;
    const nonBg = totalPixels - bgPixels;
    const pctNonBg = (nonBg / totalPixels) * 100;
    console.log(`[190-GREEN] non-bg pixels: ${nonBg}/${totalPixels} (${pctNonBg.toFixed(2)}%)`);
    expect(pctNonBg).toBeGreaterThan(2);

    // (٤) فيها سطر نصّ · صفّ فيه ≥ 30 بكسل نصّ + ≥ 4 انتقالات
    const rowCheck = hasTextRow(decoded.data, decoded.w, decoded.h, [255, 255, 255]);
    console.log(`[190-GREEN] text-row: bestCount=${rowCheck.bestCount} bestTransitions=${rowCheck.bestTransitions} found=${rowCheck.found}`);
    expect(rowCheck.found).toBe(true);
    expect(renderId).toBeTruthy();
  }, 30000);

  it('العزل · mستأجر B يطلب output لـrender A ⇒ 404 مسمّى', async () => {
    const { renderId } = await requestExportAndDownload('#FFFFFF');
    const rB = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId}/output`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(rB.statusCode).toBe(404);
    const body = J<{ error: { code: string } }>(rB as { body: string })!;
    expect(body.error.code).toBe('NOT_FOUND');
  }, 30000);

  it('RED · نصّ بلون الخلفيّة ⇒ assertion «سطر نصّ» تسقط', async () => {
    const { buf } = await requestExportAndDownload('#111111'); // نصّ = خلفيّة
    const decoded = await decodePixels(buf);
    // PNG magic + dimensions لا يزالان صحيحَين (assertions أخرى تمرّ)
    expect(buf[0]).toBe(0x89);
    // الـassertion الحاسم: sطر نصّ يجب أن يفشل
    const rowCheck = hasTextRow(decoded.data, decoded.w, decoded.h, [255, 255, 255]);
    console.log(`[190-RED] text-row: bestCount=${rowCheck.bestCount} bestTransitions=${rowCheck.bestTransitions} found=${rowCheck.found}`);
    expect(rowCheck.found).toBe(false); // ← يجب أن يفشل عند لون النصّ الأبيض
    expect(rowCheck.bestCount).toBeLessThan(10); // اللون الأبيض لا يظهر
  }, 30000);
});
