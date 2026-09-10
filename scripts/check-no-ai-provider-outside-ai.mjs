#!/usr/bin/env node
/**
 * A24 — check-no-ai-provider-outside-ai (حارس بنيوي — docs/16 §15.0).
 *
 * قاعدة: بقية النظام تعرف «capability مفعَّلة» و«مخرج» فقط. اسم المزوّد
 * (gemini · openai · anthropic · claude) يبقى داخل `apps/api/src/ai/`
 * حصراً في **منطق النداء**. تبديل مزوّد = تعديل ملف واحد داخل ai/.
 *
 * التمييز الدقيق (أدقّ من حارس Paddle A21):
 *   ✓ الاسم في **enum** — مقبول، لأن العقد يفرضه صراحةً (§15.1 حرفياً:
 *     "'gemini'|'openai'|'claude'|...")
 *   ✗ الاسم في **منطق النداء** — ممنوع خارج ai/
 *
 * لذلك الاستثناءات ليست صامتة — كل واحد بسبب معلَن:
 *   1. apps/api/src/ai/          — منطق النداء نفسه، هو المكان الصحيح
 *   2. apps/api/src/errors.ts    — رمز INVALID_PROVIDER (اسم عام، لا مزوّد)
 *   3. packages/shared/src/brand-kit.ts — TtsProviderName (TTS برند مقفول)
 *   4. packages/tts/             — TTS منفصل عن مسار AI invoke
 *   5. apps/api/src/routes/ai/create.ts — VALID_PROVIDERS enum (§15.2 يفرضها)
 *
 * L-46 اختبار الوجود: أضف مؤقّتاً في `apps/api/src/routes/health.ts` سطر
 *   `// openai test`
 * شغّل السكربت — يخرج بـ1. احذف السطر — يخرج بـ0.
 *
 * الخروج: 0 نجاح · 1 فشل بذكر الأسطر المخالفة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_ROOTS = [
  join(ROOT, 'apps/api/src'),
];
const EXCLUDE_PREFIXES = [
  join(ROOT, 'apps/api/src/ai'),           // منطق النداء نفسه
  join(ROOT, 'apps/api/src/errors.ts'),    // رمز INVALID_PROVIDER
  join(ROOT, 'apps/api/src/routes/ai/create.ts'), // enum §15.2
];

const BANNED = /\b(openai|gemini|anthropic|claude)\b/i;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (EXCLUDE_PREFIXES.some((ex) => p === ex || p.startsWith(ex + '/'))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|js)$/.test(name)) out.push(p);
  }
}

const files = [];
for (const root of SCAN_ROOTS) walk(root, files);

const violations = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (BANNED.test(line)) violations.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error(`✗ check-no-ai-provider-outside-ai: ${violations.length} مخالفة`);
  console.error('  القاعدة: اسم المزوّد يبقى داخل apps/api/src/ai/ في منطق النداء.');
  console.error('  الاسم في enum مقبول (§15.1) — أضف الملف إلى EXCLUDE_PREFIXES مع مبرِّر.');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`✓ check-no-ai-provider-outside-ai: صفر ذكر لمزوّد خارج ai/ (${files.length} ملفاً)`);
process.exit(0);
