/**
 * تحويل بين صفّ DB و استجابة API لـBrandKit.
 *
 * الجدول: `brand_kits(id, tenant_id, name, config jsonb, created_at, updated_at)`
 * `config` يحمل كل حقول BrandKit عدا id/name/timestamps (تُحفظ في أعمدة).
 * assets يعيش داخل config (`config.assets.version` بصيغة YYYY.MM).
 *
 * DEBT-1 §2 (2026-09-07 · 8b): fill-in عند القراءة — مفتاح غائب من config
 * يُستبدل من DEFAULT_BRAND. docs/03: «عند غياب أي مفتاح: يُستبدل من
 * DEFAULT_BRAND لا يُرمى خطأ». **بلا مسّ للـsnapshot**: brand_snapshot
 * تُقرأ raw من renders/brand-snapshot.ts (يتخطّى هذا المسار) و api-worker
 * يستهلك snapshot من BullMQ payload — كلاهما لا يمرّ بـtoFull.
 */
import type { BrandKit } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

export interface DbBrandKitRow {
  id: string;
  tenant_id: string;
  name: string;
  config: Record<string, unknown>; // كائن JSON — يمثّل BrandKit منقوصاً id/name
  created_at: Date;
  updated_at: Date;
}

export interface BrandKitSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assetsVersion: string | null;
}

export interface BrandKitFull {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  // BrandKit عبر config + الحقول العمودية.
  config: BrandKit;
  // مؤشّر ترقية assets (يُحسب من config.assets.version — latest tracker لاحقاً).
  assetsVersionInfo?: {
    current: string;
    latest?: string;
    updateAvailable?: boolean;
  };
}

export function toSummary(row: DbBrandKitRow): BrandKitSummary {
  const cfg = row.config as { assets?: { version?: string } };
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    assetsVersion: cfg?.assets?.version ?? null,
  };
}

/**
 * deep-merge — DEFAULT_BRAND تحت cfg. المفتاح الموجود في cfg يفوز
 * (verbatim). المفتاح الغائب يُملأ من DEFAULT. arrays تُستبدل بالكامل
 * (لا اندماج عنصري — نمط JSON Merge Patch RFC 7396).
 */
function fillIn(target: unknown, defaults: unknown): unknown {
  if (Array.isArray(target)) return target;
  if (target === null || typeof target !== 'object') {
    return target === undefined ? defaults : target;
  }
  if (Array.isArray(defaults) || defaults === null || typeof defaults !== 'object') {
    return target;
  }
  const t = target as Record<string, unknown>;
  const d = defaults as Record<string, unknown>;
  const out: Record<string, unknown> = { ...t };
  for (const k of Object.keys(d)) {
    if (!(k in out) || out[k] === undefined) out[k] = d[k];
    else if (typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = fillIn(out[k], d[k]);
    }
  }
  return out;
}

export function toFull(row: DbBrandKitRow): BrandKitFull {
  // يعيد BrandKit مركَّبة من columns + config. `id` من العمود لا jsonb.
  // DEBT-1 §2 (8b): fill-in من DEFAULT_BRAND للمفاتيح الغائبة.
  const cfg = row.config as Partial<BrandKit>;
  const filled = fillIn(cfg, DEFAULT_BRAND) as Partial<BrandKit>;
  const brandKit = {
    ...filled,
    id: row.id,
    name: row.name,
  } as BrandKit;

  const currentVersion = (cfg as { assets?: { version?: string } }).assets?.version;

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    config: brandKit,
    ...(currentVersion
      ? {
          assetsVersionInfo: {
            current: currentVersion,
            // latest + updateAvailable يُحسبان من scanner لـassets/manifest —
            // بند لاحق (docs/13). حالياً نعرض current فقط.
          },
        }
      : {}),
  };
}

// ── Cursor pagination ──────────────────────────────────

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(row: DbBrandKitRow): string {
  const c: Cursor = { createdAt: row.created_at.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Cursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const c = JSON.parse(json) as unknown;
    if (
      typeof c === 'object' && c !== null &&
      typeof (c as Cursor).createdAt === 'string' &&
      typeof (c as Cursor).id === 'string'
    ) {
      return c as Cursor;
    }
  } catch {
    // fall through
  }
  return null;
}
