/**
 * GET /v1/assets — قائمة قابلة للتصفية (docs/16 §9.3).
 * الدور: viewer فما فوق.
 *
 * الفلاتر المدعومة (نصّ العقد):
 *   filter[kind]                — قيمة أو in
 *   filter[brand_kit_id]        — أصول هوية بعينها (يُقرأ من brand_kits.config)
 *   filter[createdAt][gte/lte]  — ISO
 *   filter[label]               — substring على metadata.label و filename
 *   filter[licenseAck]          — true|false
 *   filter[inUse]               — true|false (يُطابق على assetId في brand_kits.config)
 *   filter[sizeBytes][gte/lte]  — bigint
 *   filter[hasFaces]            — true|false
 *
 * الترتيب: sort=createdAt|label|sizeBytes مع `-` للتنازلي (الافتراضي -createdAt).
 *
 * قائمة الاستجابة **بلا publicUrl** (يُطلَب لكل أصل عبر §9.4/9.5).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  toAssetResponse, encodeCursor, decodeCursor, type DbAssetRow,
} from './shared/mapper.js';
import { ASSET_KINDS } from './shared/kind-rules.js';
import {
  InvalidFilterField, InvalidKindValue, ValidationFailed,
} from '../../errors.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sort: z.enum(['createdAt', 'label', 'sizeBytes',
                '-createdAt', '-label', '-sizeBytes']).default('-createdAt'),
}).passthrough();

const ALLOWED_FILTER_KEYS = new Set([
  'filter[kind]',
  'filter[brand_kit_id]',
  'filter[createdAt][gte]',
  'filter[createdAt][lte]',
  'filter[label]',
  'filter[licenseAck]',
  'filter[inUse]',
  'filter[sizeBytes][gte]',
  'filter[sizeBytes][lte]',
  'filter[hasFaces]',
]);

const RESERVED_QUERY_KEYS = new Set(['limit', 'cursor', 'sort']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);

    // فحص أي مفتاح غير مسموح — INVALID_FILTER_FIELD
    for (const key of Object.keys(req.query as Record<string, unknown>)) {
      if (RESERVED_QUERY_KEYS.has(key)) continue;
      if (!ALLOWED_FILTER_KEYS.has(key)) throw InvalidFilterField(key);
    }

    const raw = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = ['tenant_id = $1'];
    params.push(req.auth!.tenantId);

    // filter[kind]
    const kindRaw = raw['filter[kind]'];
    if (kindRaw) {
      const kinds = kindRaw.split(',').map(k => k.trim()).filter(Boolean);
      for (const k of kinds) {
        if (!(ASSET_KINDS as readonly string[]).includes(k)) throw InvalidKindValue();
      }
      const placeholders = kinds.map((_, i) => `$${params.length + i + 1}`).join(',');
      where.push(`kind IN (${placeholders})`);
      params.push(...kinds);
    }

    // filter[createdAt][gte/lte]
    if (raw['filter[createdAt][gte]']) {
      params.push(new Date(raw['filter[createdAt][gte]']));
      where.push(`created_at >= $${params.length}`);
    }
    if (raw['filter[createdAt][lte]']) {
      params.push(new Date(raw['filter[createdAt][lte]']));
      where.push(`created_at <= $${params.length}`);
    }

    // filter[label] — substring على metadata->>'label' أو filename
    if (raw['filter[label]']) {
      params.push(`%${raw['filter[label]']}%`);
      where.push(`((metadata->>'label') ILIKE $${params.length} OR filename ILIKE $${params.length})`);
    }

    // filter[licenseAck]
    if (raw['filter[licenseAck]'] === 'true' || raw['filter[licenseAck]'] === 'false') {
      params.push(raw['filter[licenseAck]'] === 'true');
      where.push(`license_ack = $${params.length}`);
    }

    // filter[sizeBytes][gte/lte]
    if (raw['filter[sizeBytes][gte]']) {
      const n = parseInt(raw['filter[sizeBytes][gte]']!, 10);
      if (Number.isNaN(n)) throw ValidationFailed('filter[sizeBytes][gte]');
      params.push(n); where.push(`size_bytes >= $${params.length}`);
    }
    if (raw['filter[sizeBytes][lte]']) {
      const n = parseInt(raw['filter[sizeBytes][lte]']!, 10);
      if (Number.isNaN(n)) throw ValidationFailed('filter[sizeBytes][lte]');
      params.push(n); where.push(`size_bytes <= $${params.length}`);
    }

    // filter[hasFaces]
    if (raw['filter[hasFaces]'] === 'true') {
      where.push(`faces IS NOT NULL AND jsonb_array_length(faces) > 0`);
    } else if (raw['filter[hasFaces]'] === 'false') {
      where.push(`(faces IS NULL OR jsonb_array_length(faces) = 0)`);
    }

    // filter[inUse] — قرار #1 A11: يطابق على assetId في brand_kits.config
    // JSONPath $.**.assetId == "<id>" — يعمل على PG 12+
    if (raw['filter[inUse]'] === 'true') {
      where.push(`EXISTS (
        SELECT 1 FROM brand_kits bk
        WHERE bk.tenant_id = assets.tenant_id
          AND jsonb_path_exists(bk.config, '$.**.assetId ? (@ == $val)',
              jsonb_build_object('val', assets.id::text))
      )`);
    } else if (raw['filter[inUse]'] === 'false') {
      where.push(`NOT EXISTS (
        SELECT 1 FROM brand_kits bk
        WHERE bk.tenant_id = assets.tenant_id
          AND jsonb_path_exists(bk.config, '$.**.assetId ? (@ == $val)',
              jsonb_build_object('val', assets.id::text))
      )`);
    }

    // filter[brand_kit_id] — أصول هوية بعينها
    if (raw['filter[brand_kit_id]']) {
      params.push(raw['filter[brand_kit_id]']);
      where.push(`EXISTS (
        SELECT 1 FROM brand_kits bk
        WHERE bk.id = $${params.length}::uuid
          AND bk.tenant_id = assets.tenant_id
          AND jsonb_path_exists(bk.config, '$.**.assetId ? (@ == $val)',
              jsonb_build_object('val', assets.id::text))
      )`);
    }

    // sort
    const sortMap: Record<string, string> = {
      createdAt:   'created_at ASC, id ASC',
      '-createdAt':'created_at DESC, id DESC',
      label:       "metadata->>'label' ASC NULLS LAST, id ASC",
      '-label':    "metadata->>'label' DESC NULLS LAST, id DESC",
      sizeBytes:   'size_bytes ASC NULLS LAST, id ASC',
      '-sizeBytes':'size_bytes DESC NULLS LAST, id DESC',
    };
    const orderBy = sortMap[q.sort];

    // cursor — يعمل مع -createdAt/createdAt فقط (الأنماط الأخرى تُتجاهل بلا خطأ)
    if (q.cursor && (q.sort === '-createdAt' || q.sort === 'createdAt')) {
      const c = decodeCursor(q.cursor);
      if (c) {
        if (q.sort === '-createdAt') {
          params.push(c.createdAt, c.id);
          where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        } else {
          params.push(c.createdAt, c.id);
          where.push(`(created_at, id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        }
      }
    }

    const sql = `
      SELECT * FROM assets
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbAssetRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      items: trimmed.map(row => toAssetResponse(row)),
      nextCursor: hasMore
        ? encodeCursor(trimmed[trimmed.length - 1]!.created_at, trimmed[trimmed.length - 1]!.id)
        : null,
    };
  });
};

export default route;
