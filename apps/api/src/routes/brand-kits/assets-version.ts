/**
 * POST /v1/brand-kits/:id/assets-version (docs/16 §5.7).
 * ترقية assets.version. owner/admin فقط (L-29).
 * targetVersion: 'YYYY.MM'. acknowledgedDiff!=true → 409 DIFF_NOT_ACKNOWLEDGED.
 *
 * ملاحظة MVP: لا سجلّ إصدارات صالحة بعد (docs/13 §asset lifecycle).
 * أيّ YYYY.MM بصيغة صحيحة يُقبَل. سجلّ إصدارات مركزي بند لاحق.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  DiffNotAcknowledged, InvalidVersionFormat, NotFound,
} from '../../errors.js';
import type { DbBrandKitRow } from '../../shared/brand-kit-mapper.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const VERSION_RE = /^\d{4}\.(0[1-9]|1[0-2])$/;

const bodySchema = z.object({
  targetVersion: z.string(),
  acknowledgedDiff: z.boolean(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/:id/assets-version',
    { preHandler: fastify.authenticated },
    async (req) => {
      requireRoleIn(req, ['owner', 'admin']);
      const { id } = paramsSchema.parse(req.params);
      const body = bodySchema.parse(req.body);

      if (!VERSION_RE.test(body.targetVersion)) throw InvalidVersionFormat();
      if (body.acknowledgedDiff !== true) throw DiffNotAcknowledged();

      const cur = await req.dbClient!.query<DbBrandKitRow>(
        `SELECT id, tenant_id, name, config, created_at, updated_at
         FROM brand_kits WHERE id = $1`,
        [id],
      );
      if (cur.rowCount === 0) throw NotFound();
      const row = cur.rows[0]!;
      const cfg = row.config as { assets?: { version?: string; autoUpdate?: boolean } };

      const nextAssets = {
        version: body.targetVersion,
        autoUpdate: cfg.assets?.autoUpdate ?? false,
      };

      const nextConfig = {
        ...cfg,
        assets: nextAssets,
      };

      const upd = await req.dbClient!.query<DbBrandKitRow>(
        `UPDATE brand_kits SET config = $2 WHERE id = $1
         RETURNING id, tenant_id, name, config, created_at, updated_at`,
        [id, nextConfig],
      );
      const updated = (upd.rows[0]!.config as { assets: { version: string; autoUpdate: boolean } }).assets;
      return { assets: updated };
    },
  );
};

export default route;
