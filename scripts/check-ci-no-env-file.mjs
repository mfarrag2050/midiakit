#!/usr/bin/env node
// scripts/check-ci-no-env-file — يفشل البناء إن وُجد `.env` أثناء CI=1.
//
// **العلّة (من 30-RLS-NEG-PERM):** dotenv الافتراضيّ يقرأ `.env` من القرص
// ويحقن مفاتيحه إلى `process.env`. حين تظنّ CI أنّها تختبر «بيئة الإنتاج
// الفارغة»، يكون `.env` قد ملأ الفراغ صامتاً بقيَم dev. الحرّاس في
// `apps/api/src/config.ts` يرى البيئة كاملة → يمرّ → يخفي الغياب الحقيقيّ.
//
// **الشاهد التجريبيّ:** في تقرير 30-RLS-NEG-PERM §4، بيئة `env -i` فارغة
// تماماً + `.env` على القرص + `require('dotenv/config')` = 3 من 4 مفاتيح
// «أُحيت»، والرابع (`DATABASE_URL_PLATFORM`، غير موجود في الملف) بقي
// غائباً. هذا هو صنف «حارس يبلّغ نجاحاً بلا حراسة».
//
// **الحلّ:** فحص صريح يفشل إن وُجد `.env` وقيمة `CI` غير فارغة. يُشغَّل
// مبكّراً في `pnpm test` قبل أيّ verify يعتمد على البيئة.
//
// **متى يُفعَّل:** `process.env.CI` غير فارغ (Node يتبع اتفاق CI عام —
// GitHub Actions/CircleCI/GitLab كلّها تضع CI=true).
// **متى يخرج بـ0 صامتاً:** بيئة تطوير محلّية (CI غير مضبوط).
// **متى يخرج بـ1 مع رسالة:** CI مضبوط وأيّ `.env` موجود.
//
// **الاستخدام:** `node scripts/check-ci-no-env-file.mjs`
// **الاختبار:** `CI=1 node scripts/check-ci-no-env-file.mjs` (متوقّع 1)

import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// المواضع المعروفة التي يبحث فيها dotenv (افتراضيّاً هو process.cwd)،
// لكنّ verify:* تُشغَّل عبر pnpm --filter من مجلّدات فرعيّة تحمل .env خاصّاً.
const CANDIDATES = [
  '.env',
  'apps/api/.env',
  'packages/db/.env',
];

const isCi = (process.env['CI'] ?? '').trim() !== '';

if (!isCi) {
  console.log('[check-ci-no-env-file] CI غير مضبوط — يُتخطّى (تطوير محلّي).');
  process.exit(0);
}

const found = [];
for (const rel of CANDIDATES) {
  const full = join(ROOT, rel);
  if (existsSync(full)) found.push(rel);
}

if (found.length === 0) {
  console.log('[check-ci-no-env-file] ✓ CI=1 · لا `.env` في أيّ من المواضع المفحوصة.');
  process.exit(0);
}

// فشل صريح — رسالة تشرح العطب وطريقة الإصلاح، لا «خطأ».
console.error('[check-ci-no-env-file] ✗ خطأ تكامل: `.env` موجود بينما CI مضبوط.');
console.error('');
console.error('  الملفّات المكتشفة:');
for (const f of found) console.error(`    • ${f}`);
console.error('');
console.error('  ما العطب:');
console.error('    dotenv يقرأ `.env` من القرص ويحقن مفاتيحه في process.env.');
console.error('    حرّاس config.ts يرى البيئة «كاملة» ويسمح بالإقلاع —');
console.error('    بينما بيئة CI الحقيقيّة فارغة. النتيجة: اختبار يظنّ نفسه');
console.error('    يفحص «الإنتاج الفارغ» وهو يفحص نسخة dev المسرَّبة.');
console.error('    (شاهد تجريبيّ في تقرير 30-RLS-NEG-PERM §4.)');
console.error('');
console.error('  كيف يُصلَح في runner CI (اختر واحداً):');
console.error('    1. لا تنسخ `.env` في خطوة setup — اترك البيئة فارغة عمداً');
console.error('    2. إن كنت تحتاج بيئة اختبار، اضبطها من CI secret store');
console.error('       (secrets في GitHub Actions/GitLab · لا ملفّات على القرص)');
console.error('    3. إن كان `.env` جزءاً من خطوة، احذفه قبل تشغيل الفحوصات:');
console.error('       `rm -f .env apps/api/.env packages/db/.env`');
console.error('');
console.error('  عن الحارس المحليّ:');
console.error('    هذا الفحص يُتخطّى حين CI غير مضبوط — لا يمسّ dev.');
console.error('    الفشل يظهر فقط في بيئة تكامل معلَنة.');
process.exit(1);
