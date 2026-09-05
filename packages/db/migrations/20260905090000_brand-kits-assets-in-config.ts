/**
 * A9.1 — إصلاح `brand_kits`: نقل assets داخل config jsonb.
 *
 * السبب: A2 أنشأ `assets_version int NOT NULL DEFAULT 1` (رقم متزايد
 * مضاربة). لكن BrandKit type في packages/shared/brand-kit.ts يعرّف
 * `assets?: { version: string; autoUpdate: boolean }` و docs/16 §5.7
 * يطلب `targetVersion: 'YYYY.MM'`. مصدر الحقيقة الوحيد يجب أن يكون
 * config jsonb (يطابق نوع BrandKit كاملاً). أُسقط العمود.
 *
 * أثر: لا بيانات في التطوير/الاختبار، آمن. عند وجود إنتاج، يُعاد
 * التفكير في مسار الهجرة.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE brand_kits DROP COLUMN assets_version`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE brand_kits ADD COLUMN assets_version int NOT NULL DEFAULT 1`);
}
