/**
 * POST /v1/brand-kits/:id/fonts/:family/ack (docs/16 §5.5).
 * إقرار ترخيص خط مرفوع. owner/admin. licenseAck=false → 422.
 *
 * قرار المالك: 422 لكل نقطة إقرار (رغم أن نصّ docs/16 §5.5 يذكر 400 —
 * §1.4 يعرّف 422 لـ«مدخل صالح شكلاً مرفوض دلالياً»؛ نتّبع دلالياً).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { LicenseAckMustBeTrue, FontNotUploaded, NotFound } from '../../errors.js';
import type { DbBrandKitRow } from '../../shared/brand-kit-mapper.js';

const paramsSchema = z.object({
  id: z.string().uuid(),
  family: z.string().min(1).max(100),
});

const bodySchema = z.object({
  licenseAck: z.boolean(),
  acknowledgedBy: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/fonts/:family/ack', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id, family } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    if (body.licenseAck !== true) throw LicenseAckMustBeTrue();

    const cur = await req.dbClient!.query<DbBrandKitRow>(
      `SELECT id, tenant_id, name, config, created_at, updated_at
       FROM brand_kits WHERE id = $1`,
      [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const row = cur.rows[0]!;
    const cfg = row.config as {
      fonts?: { primary?: { family: string; source?: string; licenseAck?: boolean } };
    };

    const primary = cfg?.fonts?.primary;
    if (!primary) throw FontNotUploaded();

    // نطابق على family (case-insensitive). فقط الخط المرفوع (source='custom')
    // يحتاج إقراراً — 'builtin' من مكتبة داخلية.
    if (primary.family.toLowerCase() !== family.toLowerCase()) throw FontNotUploaded();
    if (primary.source !== 'custom') throw FontNotUploaded();

    const nowIso = new Date().toISOString();
    const updatedPrimary = {
      ...primary,
      licenseAck: true,
      ackBy: body.acknowledgedBy,
      ackAt: nowIso,
      ...(body.notes ? { ackNotes: body.notes } : {}),
    };

    const nextConfig = {
      ...cfg,
      fonts: {
        ...(cfg.fonts ?? {}),
        primary: updatedPrimary,
      },
    };

    const upd = await req.dbClient!.query<DbBrandKitRow>(
      `UPDATE brand_kits SET config = $2 WHERE id = $1
       RETURNING id, tenant_id, name, config, created_at, updated_at`,
      [id, nextConfig],
    );
    return { fonts: { primary: (upd.rows[0]!.config as { fonts: { primary: unknown } }).fonts.primary } };
  });
};

export default route;
