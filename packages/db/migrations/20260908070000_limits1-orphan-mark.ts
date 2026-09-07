/**
 * LIMITS-1 §2 — assets.orphan_marked_at لسياسة الحذف الآمن.
 *
 * قرار المالك 2026-09-07: العلامة أولاً، الحذف ثانياً.
 * Sweep يومي (03:00 UTC، BullMQ repeat) يعمل خطوتين:
 *   1. mark: تعيين orphan_marked_at للأصول التي:
 *      • finalized_at IS NOT NULL
 *      • created_at < now() - interval '24 hours' (نافذة أمان)
 *      • لا مُشار إليها في brand_kits.config لأي kit في المستأجر
 *      • لا مُشار إليها في renders.brand_snapshot لأي render في المستأجر
 *   2. purge: حذف الأصول التي orphan_marked_at < now() - interval '7 days'
 *      عبر storage adapter (getStorage().deleteObject) + DELETE FROM assets
 *
 * أقصر عمر قبل الحذف: 8 أيام (24h grace + 7d marked window).
 *
 * L-46: أصل مرتبط بـbrand_kit.config أو brand_snapshot ⇒ لا يُعلَّم أبداً.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE assets ADD COLUMN orphan_marked_at timestamptz;
    CREATE INDEX assets_orphan_marked_idx
      ON assets(orphan_marked_at)
      WHERE orphan_marked_at IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS assets_orphan_marked_idx;
    ALTER TABLE assets DROP COLUMN IF EXISTS orphan_marked_at;
  `);
}
