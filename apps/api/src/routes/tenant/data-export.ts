/**
 * GET /v1/tenant/data-export — 250-TENANT-DATA-EXPORT.
 *
 * وكالةٌ تدفع لنا تسأل يوماً «أعطني بياناتي». الجواب: أمرٌ واحد. هذا هو.
 *
 * ── العقد ──────────────────────────────
 *   • Content-Type: application/x-ndjson (سطرٌ بلـJSON لكل صفّ).
 *   • Content-Disposition: attachment; filename="..."
 *   • أوّل سطر `{"type":"meta", ...}` يحمل tenantId · exportedAt · version.
 *   • سطرٌ لكل سجلّ من الأقسام (14 قسماً).
 *   • السطر الأخير `{"type":"end", "counts":{...}}`.
 *
 * ── لماذا NDJSON بدل JSON عادي ──────
 * ملفٌّ واحد قابلٌ للتدفّق سطراً بسطر. لا JSON.parse على 300 ميغابايت.
 * جدول pandas.read_json(lines=True) يقرأه · jq -c يعمل بلا تعديل.
 * القالب «سطر واحد لكل صفّ» يُقيَّد بحجم أكبر صفّ لا بمجموع الأصول.
 *
 * ── لماذا CURSOR بدل SELECT * ────────
 * مستأجرٌ كبير قد يحمل 100k assets · 500k revisions. تحميل الكلّ في
 * الذاكرة يقتل العملية. SQL CURSOR + FETCH FORWARD 500 يقيّد الذاكرة
 * بـchunk واحد. RLS يبقى نافذاً على الـcursor لأنّه يقرأ ضمن نفس tx
 * الذي فيه `SET LOCAL app.tenant_id` (auth-guard.ts).
 *
 * ── ما يُستَبعَد صريحاً ────────────────
 *   • users.password_hash — سرّ. لا يُصدَّر أبداً.
 *   • ai_integrations.api_key_encrypted + api_key_ref — سرّ.
 *   • invitations.token_hash — token secret.
 *   • sessions — حالة auth · ليست ملك المستأجر (تُعرَف بجهاز).
 *   • password_reset_tokens — أسرار مؤقّتة (خارج جدول التصدير بالكامل).
 *   • assets.storage_key — نصدّر id + filename + kind + size · لا نصدّر
 *     مسار S3 الخام (implementation detail · قد يتغيّر).
 *
 * ── الفشل ────────────────────────────
 * الفشل بعد إرسال headers يُكتَب سطرَ NDJSON `{"type":"error","code":"..."}`
 * ثمّ يُغلَق stream. لا 500 مع headers مُرسَلة · هذا يفسد الملفّ الناتج.
 * قبل إرسال headers: يُرمى ApiError كالمعتاد.
 *
 * ── L-46 ─────────────────────────────
 * data-export.test.ts يبني مستأجرين · يشغّل export لكلّ · يُثبت أنّ
 * ملفّ B لا يحمل أيّ id/name/email من A. RED بديل: استبدال req.dbClient
 * بـgetPlatformPool() (control_plane_user يعبر RLS) — الاختبار يفشل
 * ذاكراً id مسرَّب من A. الاستعادة تُعيده أخضر.
 */
import type { FastifyPluginAsync } from 'fastify';

// أقسام التصدير · مرتَّبة (الأصغر أوّلاً · ذو التبعيّة قبل تابعِه).
// كل قسم: type · SELECT list (بلا secrets) · alias في الملفّ.
interface Section {
  type: string;
  select: string;
  table: string;
}

const SECTIONS: Section[] = [
  { type: 'tenant',            table: 'tenants',               select: 'id, name, plan, locale, plan_overrides, created_at, updated_at' },
  { type: 'user',              table: 'users',                 select: 'id, email, role, locale, is_active, external_id, last_login_at, created_at, updated_at' },
  { type: 'brand_kit',         table: 'brand_kits',            select: 'id, name, config, created_at, updated_at' },
  { type: 'asset',             table: 'assets',                select: 'id, kind, filename, size_bytes, content_type, license_ack, ack_by, ack_at, metadata, warnings, finalized_at, created_at, updated_at' },
  { type: 'template',          table: 'templates',             select: 'id, scope, source_ref, name, kind, definition, definition_hash, deleted_at, created_at, updated_at' },
  { type: 'workflow',          table: 'workflows',             select: 'id, name, kind, is_default, states, transitions, created_at, updated_at' },
  { type: 'project',           table: 'projects',              select: 'id, brand_kit_id, template_id, workflow_id, name, locale, state, assignee_id, content, deleted_at, created_by, created_at, updated_at' },
  { type: 'project_state',     table: 'project_state',         select: 'project_id, workflow_id, current_state, assignee_id, updated_at' },
  { type: 'transition',        table: 'transitions',           select: 'id, project_id, from_state, to_state, transitioned_by, reason, at' },
  { type: 'annotation',        table: 'annotations',           select: 'id, project_id, target, body, resolved, author_id, created_at, updated_at' },
  { type: 'render',            table: 'renders',               select: 'id, project_id, size, format, status, output_storage_key, brand_snapshot, template_snapshot, duration_ms, error_code, error_message, requested_by, idempotency_key, started_at, completed_at, cancel_requested_at, created_at, updated_at' },
  { type: 'export_log',        table: 'exports',               select: 'id, user_id, render_id, brand_kit_id, template_id, size, format, storage_key, size_bytes, status, error_code, created_at' },
  // revisions.snapshot يحمل to_jsonb(NEW) من trigger log_revision · وقت
  // INSERT على users يحمل password_hash · على ai_integrations يحمل
  // api_key_encrypted + api_key_ref · على invitations يحمل token_hash.
  // نُصفّي هذه المفاتيح على مستوى SQL بـjsonb `-` operator (يزيل مفتاحاً
  // من الجذر). اكتُشف عند كتابة test هذا الـexport — الترميز الذي
  // احتوى الأسرار موجود قبل 250 (تذكرة `_AMEND-244-REVISIONS-STRIP-SECRETS`
  // مقترحة لتصفية الـtrigger نفسه بدل sanitize at read time).
  { type: 'revision',          table: 'revisions',
    select: `id, resource_type, resource_id, actor_id, action,
             snapshot - 'password_hash' - 'api_key_encrypted' - 'api_key_ref' - 'token_hash' AS snapshot,
             reason, created_at` },
  { type: 'subscription',      table: 'subscriptions',         select: 'id, plan, status, external_customer_id, external_subscription_id, current_period_start, current_period_end, cancel_at, canceled_at, cancel_reason, created_at, updated_at' },
  { type: 'usage',             table: 'usage',                 select: 'id, period, renders_count, videos_count, video_seconds, ai_tokens_in, ai_tokens_out, created_at, updated_at' },
  { type: 'checkout_session',  table: 'checkout_sessions',     select: 'id, idempotency_key, target_plan, billing_cycle, checkout_url, expires_at, created_at, created_by' },
  { type: 'invitation',        table: 'invitations',           select: 'id, email, role, invited_by, expires_at, accepted_at, created_at' },
  { type: 'license_ack',       table: 'license_acks',          select: 'id, brand_kit_id, kind, subject, ack_by, ack_at, ip_address, notes, created_at' },
  { type: 'ai_integration',    table: 'ai_integrations',       select: 'id, provider, capabilities, config, enabled, configured_by, created_at, updated_at' },
];

const CHUNK_SIZE = 500;

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/data-export', { preHandler: fastify.authenticated }, async (req, reply) => {
    const client = req.dbClient!;
    const tenantId = req.auth!.tenantId;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    // Headers قبل أيّ streaming — لو فشلنا الآن، Fastify يُرسل JSON error عادي.
    // هذا يشمل validation, RLS init failures, etc.
    reply.raw.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.raw.setHeader(
      'Content-Disposition',
      `attachment; filename="mediakit-export-${tenantId}-${ts}.ndjson"`,
    );
    reply.raw.setHeader('X-MK-Export-Version', '1');
    // نأخذ سيطرة raw · Fastify لن يرسل response تلقائيّاً.
    reply.hijack();

    const counts: Record<string, number> = {};
    const writeLine = (obj: unknown): void => {
      reply.raw.write(JSON.stringify(obj) + '\n');
    };

    try {
      writeLine({
        type: 'meta',
        version: 1,
        tenantId,
        exportedAt: new Date().toISOString(),
        exportedBy: req.auth!.userId,
        sections: SECTIONS.map((s) => s.type),
      });

      for (const section of SECTIONS) {
        counts[section.type] = 0;
        const cursorName = `dx_${section.type}_${process.hrtime.bigint().toString(36)}`;
        // DECLARE يستعمل نفس tx (RLS مضبوط) — cursor محدود بـtenant المُصادَق.
        await client.query(
          `DECLARE ${cursorName} NO SCROLL CURSOR FOR SELECT ${section.select} FROM ${section.table}`,
        );
        try {
          while (true) {
            const chunk = await client.query(`FETCH FORWARD ${CHUNK_SIZE} FROM ${cursorName}`);
            if (chunk.rowCount === 0) break;
            for (const row of chunk.rows) {
              writeLine({ type: section.type, data: row });
              counts[section.type]!++;
            }
          }
        } finally {
          await client.query(`CLOSE ${cursorName}`).catch(() => {});
        }
      }

      writeLine({ type: 'end', counts });
      reply.raw.end();
    } catch (err) {
      // headers مُرسَلة بالفعل · نكتب سطر خطأ داخل NDJSON ثمّ نُغلق.
      req.log.error({ err, tenantId }, 'data-export streaming failed');
      try {
        writeLine({
          type: 'error',
          code: 'TENANT_DATA_EXPORT_FAILED',
          message: err instanceof Error ? err.message : 'unknown',
          partialCounts: counts,
        });
      } catch { /* stream مُغلَق سلفاً */ }
      reply.raw.end();
    }
  });
};

export default route;
