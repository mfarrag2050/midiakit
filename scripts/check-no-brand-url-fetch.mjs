#!/usr/bin/env node
/**
 * SEC-1 البند 2 — check-no-brand-url-fetch (حارس SSRF كامن).
 *
 * **الخطر:** BrandKit.logo.url + FontWeight.url + BrandAudioTrack.url
 * حقول اسمها URL وسلوكها الحالي path محلّي. أول مطوّر يكتب
 * `await loadImage(brand.logo.url)` يفتح SSRF كامل:
 *   • 127.0.0.1:19041 (Postgres dev)
 *   • 169.254.169.254 (metadata AWS/GCP)
 *   • أي RFC1918
 *
 * **الحدّ المُختار (2026-09-05):** بحث دلالي متسامح — سطر بأحد
 * الاستدعاءات الممنوعة + سطر نفسه ± سطران يحوي `brand` أو `logo.url`
 * أو `fonts.` ⇒ فشل. أعلى نسبة false-positive أفضل من ثغرة صامتة.
 *
 * **النطاق:**
 *   packages/engine/src · apps/renderer/src · apps/api/src
 *   استثناء ملفات الاختبار (*.test.ts, *.spec.ts)
 *   استثناء موثَّق سطر-برقم: apps/renderer/src/alerts.ts:63
 *     (fetch(WEBHOOK_URL) من env، ليس من brand — راجع 9.h في A9-V R1)
 *
 * **الاستدعاءات الممنوعة:** fetch( · axios · got( · http.get · https.get ·
 *   loadImage( · new Image( · createImageBitmap(
 *
 * **اختبار الوجود (L-46):** أضف مؤقتاً في ملف داخل النطاق سطر
 *   `await loadImage(brand.logo.url);`
 *   شغّل هذا السكربت — يجب أن يخرج بـ1. احذف السطر — يخرج بـ0.
 *
 * الخروج: 0 نجاح · 1 فشل مع طباعة الأسطر المخالفة.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SCAN_DIRS = [
  'packages/engine/src',
  'apps/renderer/src',
  'apps/api/src',
];

// أنماط الاستدعاءات الممنوعة (تعبيرات نصية بسيطة — بحث محافظ).
const FORBIDDEN_CALL_PATTERNS = [
  /\bfetch\s*\(/,
  /\baxios\b/,
  /\bgot\s*\(/,
  /\bhttp\.get\b/,
  /\bhttps\.get\b/,
  /\bhttp\.request\b/,
  /\bhttps\.request\b/,
  /\bloadImage\s*\(/,
  /\bnew\s+Image\s*\(/,
  /\bcreateImageBitmap\s*\(/,
];

// أنماط brand context (سطر ± سطران).
const BRAND_CONTEXT_PATTERNS = [
  /\bbrand\b/,
  /\.logo\.url\b/,
  /\bfonts\./,
];

// استثناءات مُعلَنة (path:line) — يجب توثيق السبب في التعليق قبلها.
const EXCEPTIONS = new Set([
  // apps/renderer/src/alerts.ts سطر بـfetch(WEBHOOK_URL) — env var، ليس brand.
  'apps/renderer/src/alerts.ts:63',
]);

function walk(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (ext !== '.ts' && ext !== '.mts' && ext !== '.js' && ext !== '.mjs') continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      results.push(full);
    }
  }
  return results;
}

function scanFile(filePath) {
  const rel = relative(ROOT, filePath);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const callHit = FORBIDDEN_CALL_PATTERNS.find((p) => p.test(line));
    if (!callHit) continue;

    // فحص السطر نفسه + السطر قبله + السطر بعده
    const contextLines = [
      lines[i - 1] ?? '',
      line,
      lines[i + 1] ?? '',
    ];
    const contextHit = BRAND_CONTEXT_PATTERNS.find((p) =>
      contextLines.some((l) => p.test(l)),
    );
    if (!contextHit) continue;

    const location = `${rel}:${i + 1}`;
    if (EXCEPTIONS.has(location)) continue;

    findings.push({
      location,
      call: callHit.source,
      context: contextHit.source,
      line: line.trim(),
    });
  }
  return findings;
}

// ── main ────────────────────────────────────────────────

console.log('▶ SEC-1 check-no-brand-url-fetch');
console.log(`  scan: ${SCAN_DIRS.join(' · ')}`);
console.log(`  exceptions: ${[...EXCEPTIONS].join(', ') || '(none)'}`);

const allFiles = SCAN_DIRS.flatMap((d) => {
  const full = join(ROOT, d);
  try { statSync(full); } catch { return []; }
  return walk(full);
});

console.log(`  files scanned: ${allFiles.length}`);

const allFindings = allFiles.flatMap(scanFile);

if (allFindings.length === 0) {
  console.log('\n✓ check-no-brand-url-fetch PASSED — لا اقتران خطر بين http/loader و brand');
  process.exit(0);
}

console.error('\n✗ check-no-brand-url-fetch FAILED — الأسطر التالية تجمع استدعاء خطراً مع سياق brand:');
for (const f of allFindings) {
  console.error(`  ${f.location}`);
  console.error(`    call:    ${f.call}`);
  console.error(`    context: ${f.context}`);
  console.error(`    line:    ${f.line}`);
}
console.error(
  '\nإن كان الاستعمال آمناً (مثل env var لا brand)، أضف السطر إلى EXCEPTIONS في السكربت مع تعليق يوثّق السبب.',
);
process.exit(1);
