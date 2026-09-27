#!/usr/bin/env node
/**
 * 518 — حارس بنيويّ: كلّ ملف `apps/api/scripts/verify-*.mjs` ينشئ مستأجرين
 * (يحتوي `signup` أو `INSERT INTO tenants` أو `tenantName`) يجب أن يستورد
 * `assertNotShowroomEnv` من `apps/api/src/test-guard.js` **ويستدعيها**.
 *
 * سبب الحارس (514i · 514j): تسرّب `.env.show` كتب 53 مستأجراً + 146 كائناً
 * في العرض. الحارس الأوّل رفض التشغيل داخل الحاوية · الحارس الثاني (هذا)
 * يمنعنا من نسيان الاستيراد في سكربتٍ جديد.
 *
 * الخروج: 0 نجاح · 1 فشل بذكر الملفّات المخالفة.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'apps/api/scripts');

const tenantPattern = /(signup|INSERT INTO tenants|tenantName)/;
const importPattern = /from ['"][^'"]*test-guard(?:\.js)?['"]/;
const callPattern = /\bassertNotShowroomEnv\s*\(\s*\)/;

const missing = [];
const checked = [];
for (const name of readdirSync(SCRIPTS_DIR)) {
  if (!/^verify-.*\.mjs$/.test(name)) continue;
  const full = join(SCRIPTS_DIR, name);
  const src = readFileSync(full, 'utf8');
  if (!tenantPattern.test(src)) continue;
  checked.push(name);
  if (!importPattern.test(src) || !callPattern.test(src)) {
    missing.push(name);
  }
}

if (missing.length > 0) {
  console.error(`[check-verify-test-guard] ✗ ${missing.length}/${checked.length} سكربت verify-*.mjs`);
  console.error('  ينشئ مستأجرين بلا استيراد + استدعاء assertNotShowroomEnv:');
  for (const name of missing) console.error(`    - ${name}`);
  console.error('');
  console.error('  أضف السطرَين في أعلى الملفّ بعد الـimports:');
  console.error("    import { assertNotShowroomEnv } from '../src/test-guard.js';");
  console.error('    assertNotShowroomEnv();');
  process.exit(1);
}

console.log(`[check-verify-test-guard] ✓ ${checked.length} سكربت verify-*.mjs يستورد الحارسَ ويستدعيه.`);
