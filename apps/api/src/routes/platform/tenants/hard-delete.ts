/**
 * POST /v1/platform/tenants/:id/hard-delete — يمحو مستأجراً كاملاً.
 * ملك: platform owner فقط (قرار غير قابل للنقض).
 *
 * ── ما يجري بالضبط ──────────────────────────────
 * 1. **قراءة اسم المستأجر + مفاتيح التخزين** — من `tenants` + `assets` +
 *    `renders`. يجب قبل الحذف (CASCADE يزيلها).
 * 2. **INSERT في `tenant_deletion_log`** — سجلّ يبقى بعد ذهاب المستأجر
 *    (بلا FK إلى tenants). يذكر: name، actor، reason، timestamp.
 * 3. **مسح ملفّات التخزين** — كل storage_key من storage adapter.
 *    فشل مفتاح واحد لا يُوقف الباقي (يُسجَّل ويُواصَل).
 * 4. **DELETE FROM tenants WHERE id** — CASCADE على 19 FK يُزيل كل
 *    الأبناء (users, assets, brand_kits, projects, renders, revisions,
 *    subscriptions, invitations, ...).
 *
 * ── لماذا يعمل الحذف الآن ──────────────────────────
 * migration `20260912000000_tenant-deletion-log` عدّل `log_revision()`
 * ليقفز عن DELETE على tenants (لا يحاول INSERT revisions بـtenant_id
 * محذوف). الـtrigger يبقى مركّباً · لا `DISABLE` ولا `session_replication_role`.
 *
 * ── ما لا يُقبَل ───────────────────────────────────
 * ✗ Soft delete (`deleted_at`) — لا يُرضي طلب erasure قانونيّ.
 * ✗ Anonymization في هذه التذكرة — 150 §٠ لم يُقرَّر بعد. 151 حذفٌ صلب.
 * ✗ حذف يترك ملفّات (mkau §٤ في 260).
 * ✗ حذف يمحو سجلّ التدقيق كاملاً (شرط 151: «الحذف الذي يمحو أثره تستّر»).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, PlatformInsufficientRole } from '../../../errors.js';
import { getStorage } from '../../../storage/index.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
}).strict().optional();

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/hard-delete', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    if (req.platformAuth!.platformRole !== 'owner') throw PlatformInsufficientRole();
    const { id } = paramsSchema.parse(req.params);
    const body = req.body ? bodySchema.parse(req.body) : undefined;

    const db = req.platformDbClient!;

    // (1) قراءة الاسم — للـtenant_deletion_log
    const t = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants WHERE id = $1`, [id],
    );
    if (t.rowCount === 0) throw NotFound();
    const tenant = t.rows[0]!;

    // (2) جمع كل storage keys قبل CASCADE
    const assetKeys = await db.query<{ storage_key: string }>(
      `SELECT storage_key FROM assets WHERE tenant_id = $1 AND storage_key IS NOT NULL`,
      [id],
    );
    const renderKeys = await db.query<{ output_storage_key: string }>(
      `SELECT output_storage_key FROM renders
       WHERE tenant_id = $1 AND output_storage_key IS NOT NULL AND output_storage_key != ''`,
      [id],
    );
    const allKeys: string[] = [
      ...assetKeys.rows.map((r) => r.storage_key),
      ...renderKeys.rows.map((r) => r.output_storage_key),
    ];

    // (3) INSERT في tenant_deletion_log — يبقى بعد الحذف
    await db.query(
      `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deleted_by, deletion_type, reason)
       VALUES ($1, $2, $3, 'hard', $4)`,
      [id, tenant.name, req.platformAuth!.userId, body?.reason ?? null],
    );

    // (4) مسح ملفّات التخزين — فشل مفتاح واحد لا يُوقف الباقي
    const storage = getStorage();
    let storagePurged = 0;
    let storageErrors = 0;
    for (const key of allKeys) {
      try {
        await storage.deleteObject(key);
        storagePurged++;
      } catch (err) {
        storageErrors++;
        req.log.warn({ err, key, tenantId: id }, 'hard-delete: storage.deleteObject failed');
      }
    }

    // (5) DELETE FROM tenants — CASCADE يمسح كل الأبناء
    // نضبط app.tenant_id قبل الـDELETE لأنّ CASCADE يُفعّل triggers على الأبناء
    // (assets/users/brand_kits/...) · triggers تكتب في revisions · RLS يحتاج
    // GUC مطابقاً. control_plane_user لا يمرّ عبر revisions_control_plane_all
    // داخل trigger SECURITY DEFINER (CURRENT_USER يصير migration_user).
    await db.query(`SELECT app_set_tenant($1::uuid)`, [id]);
    const del = await db.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    if ((del.rowCount ?? 0) !== 1) {
      throw new Error(`hard-delete: DELETE tenants rowCount=${del.rowCount} (expected 1)`);
    }

    reply.status(200).send({
      tenantId: id,
      tenantName: tenant.name,
      storageKeys: allKeys.length,
      storagePurged,
      storageErrors,
      deletedAt: new Date().toISOString(),
    });
  });
};
export default route;
