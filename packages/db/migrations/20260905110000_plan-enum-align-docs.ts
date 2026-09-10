/**
 * PLAN-FIX 2026-09-05 — مواءمة plan enum مع docs/01 + docs/16.
 *
 * الحسم من المصادر (لا قرار مالك):
 *   • docs/01-product.md §نموذج الإيراد: Starter · Studio · Agency · API
 *   • docs/16-api-contract.md:292, 1271:
 *     "plan": "'trial'|'starter'|'studio'|'agency'|'api'"
 *   • docs/17:229 — العملاء الأوائل بحسابات يدوية (فرض حدود المقاعد A21)
 *
 * A2 الأصلية أدخلت 'pro' و 'enterprise' كقيمتَين مخترَعتَين لا وثيقة
 * لهما. هذه الهجرة تُصحّح CHECK على جدولَي tenants و subscriptions.
 *
 * البيانات: كل الصفوف الحالية بقيمة 'trial' فقط (فُحص قبل الهجرة).
 * DEFAULT 'trial' يبقى.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const NEW_PLANS = "('trial', 'starter', 'studio', 'agency', 'api')";
const OLD_PLANS = "('trial', 'starter', 'pro', 'agency', 'enterprise')";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE tenants DROP CONSTRAINT tenants_plan_check;
    ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
      CHECK (plan IN ${NEW_PLANS});

    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check;
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ${NEW_PLANS});
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check;
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ${OLD_PLANS});

    ALTER TABLE tenants DROP CONSTRAINT tenants_plan_check;
    ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
      CHECK (plan IN ${OLD_PLANS});
  `);
}
