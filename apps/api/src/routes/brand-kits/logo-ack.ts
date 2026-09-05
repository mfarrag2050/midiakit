/**
 * POST /v1/brand-kits/:id/attribution/logo-acks/:platform (docs/16 §5.6).
 * إقرار حقّ عرض شعار منصة رسمية. owner/admin.
 * licenseAck=false → 422. logoMode≠official → 409 LOGO_MODE_NOT_OFFICIAL.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  LicenseAckMustBeTrue, UnknownPlatform, LogoModeNotOfficial, NotFound,
} from '../../errors.js';
import type { DbBrandKitRow } from '../../shared/brand-kit-mapper.js';

const PLATFORMS = ['tiktok', 'x', 'instagram', 'youtube', 'telegram', 'facebook'] as const;
type Platform = typeof PLATFORMS[number];

const paramsSchema = z.object({
  id: z.string().uuid(),
  platform: z.string(),
});

const bodySchema = z.object({
  licenseAck: z.boolean(),
  acknowledgedBy: z.string().min(1),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/:id/attribution/logo-acks/:platform',
    { preHandler: fastify.authenticated },
    async (req) => {
      requireRoleIn(req, ['owner', 'admin']);
      const { id, platform } = paramsSchema.parse(req.params);
      const body = bodySchema.parse(req.body);

      if (!PLATFORMS.includes(platform as Platform)) throw UnknownPlatform();
      if (body.licenseAck !== true) throw LicenseAckMustBeTrue();

      const cur = await req.dbClient!.query<DbBrandKitRow>(
        `SELECT id, tenant_id, name, config, created_at, updated_at
         FROM brand_kits WHERE id = $1`,
        [id],
      );
      if (cur.rowCount === 0) throw NotFound();
      const row = cur.rows[0]!;
      const cfg = row.config as {
        attribution?: {
          logoMode?: string;
          logoAcks?: Record<string, unknown>;
        };
      };

      if (cfg?.attribution?.logoMode !== 'official') throw LogoModeNotOfficial();

      const nowIso = new Date().toISOString();
      const nextAck = {
        licenseAck: true,
        ackBy: body.acknowledgedBy,
        ackAt: nowIso,
      };

      const nextConfig = {
        ...cfg,
        attribution: {
          ...cfg.attribution,
          logoAcks: {
            ...(cfg.attribution.logoAcks ?? {}),
            [platform]: nextAck,
          },
        },
      };

      const upd = await req.dbClient!.query<DbBrandKitRow>(
        `UPDATE brand_kits SET config = $2 WHERE id = $1
         RETURNING id, tenant_id, name, config, created_at, updated_at`,
        [id, nextConfig],
      );
      const updatedAttr = (upd.rows[0]!.config as { attribution: { logoAcks: Record<string, unknown> } }).attribution;
      return { platform, logoAck: updatedAttr.logoAcks[platform] };
    },
  );
};

export default route;
