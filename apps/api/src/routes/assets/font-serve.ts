/**
 * GET /v1/assets/:id/font — يخدم ملفّ خطّ الهويّة للمتصفّح (preview).
 * الدور: viewer فما فوق (أيّ مستخدم للمستأجر).
 *
 * ── لماذا server-proxy لا presigned ──
 * presigned URL bearer capability — من حازها في 900s يقرأ بلا تحقّق
 * إضافيّ. الخطّ المرفوع مِلك عميل بترخيص · قد يمنع إعادة التوزيع.
 * server-proxy يفرض RLS + كل ownership check لكلّ طلب فردياً.
 *
 * ── سلوك ─────────────────────────────────────────────
 * 1. RLS يفرز عبر req.dbClient (app.tenant_id مضبوط في auth-guard).
 *    مستأجر (أ) يطلب `id` لخطّ مستأجر (ب) ⇒ rowCount=0 ⇒ 404 NOT_FOUND
 *    (لا كشف عن وجود/غياب أصل لمستأجر آخر).
 * 2. kind يجب أن يكون 'font' — أصول أخرى (image · logo · font metadata)
 *    ترجع 404 من هذا المسار (استعملها عبر /v1/assets/:id).
 * 3. الاستجابة: بايتات الملفّ حرفيّاً + ترويسات:
 *    - Content-Type: font/ttf | font/otf | font/woff2 | font/woff (حسب الامتداد).
 *    - Cache-Control: private, max-age=3600 (assetId ثابت · لكن ليس immutable
 *      لأنّ الحقّ قد يُلغى بحذف الأصل).
 *    - Access-Control-Allow-Origin: * (browser preview من studio · CSS @font-face
 *      يحتاج CORS لخطوط cross-origin).
 *    - Access-Control-Allow-Credentials: false (Bearer في header · لا cookies).
 *    - Vary: Origin, Authorization (تجنّب cache poisoning عبر CDN).
 *
 * ── ما لا يشمله ───────────────────────────────────────
 * - أصول غير خطوط ⇒ استعمل GET /v1/assets/:id (presigned URL).
 * - أصول بلا finalize ⇒ 422 (النموذج ما اكتمل بعد).
 * - streaming ranged (Range header) ⇒ لا · الخطّ صغير · نُرسل bytes كاملة.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getStorage } from '../../storage/index.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

/** يستنبط MIME من امتداد الملفّ (خطوط ويب معياريّة). */
function fontContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  // fallback — application/octet-stream يحمل بايتات صحيحة لكنّ browser
  // لن يعالجها كـfont. نرمي بصوت.
  return 'application/octet-stream';
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id/font', { preHandler: fastify.authenticated }, async (req, reply) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{
      storage_key: string; filename: string; kind: string; finalized_at: Date | null;
    }>(
      `SELECT storage_key, filename, kind, finalized_at FROM assets WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) throw NotFound(); // RLS يفرز مستأجر آخر هنا
    const row = r.rows[0]!;
    if (row.kind !== 'font') throw NotFound(); // ليس خطّاً · لا نكشف نوعه
    if (!row.finalized_at) throw NotFound(); // draft — نُخفي وجوده كما لو غير موجود

    const buf = await getStorage().getObjectBuffer(row.storage_key);
    const ct = fontContentType(row.filename);

    reply
      .header('Content-Type', ct)
      .header('Content-Length', String(buf.length))
      .header('Cache-Control', 'private, max-age=3600')
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Credentials', 'false')
      .header('Vary', 'Origin, Authorization')
      .send(buf);
  });
};

export default route;
