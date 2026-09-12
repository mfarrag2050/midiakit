#!/usr/bin/env node
/**
 * _AMEND-241-EXPORT-PATH-TRUTH — بوّابة عقد الرندر.
 *
 * لكل قالب في `packages/templates/src/templates/*.json`، يتحقّق أنّه يحمل
 * فروع الرندر المُتوقَّعة من engine:
 *   • `card` — للـPNG (renderFrame · main:api-worker.ts:284-289).
 *   • `video` — للـMP4 (renderVideo).
 * قالب بلا `card` ⇒ export=PNG يفشل بـPNG_UNSUPPORTED_TEMPLATE.
 * قالب بلا `video` ⇒ export=MP4 يفشل بشكل مقابل.
 *
 * «قالبٌ يُعرَض في المنتج ولا يُصدَّر هو وعدٌ كاذب» (نصّ inbox).
 *
 * ── ماذا تكشف الآن (2026-09-13) ─────────
 * 6/6 قوالب تفتقر إلى `card` branch. مسار PNG على main ميت لكلّ قالب.
 * mkst رأت PNG_UNSUPPORTED_TEMPLATE عند تشغيل حيّ.
 *
 * ── الحلّ الدائم (خارج نطاق mkapi · مُسلَّم إلى mk) ──
 * إمّا (أ) mk يُضيف `card` layer لكل قالب.
 * إمّا (ب) engine.renderFrame يقبل بغياب card (fallback إلى video snapshot).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'packages/templates/src/templates');

// عقد الرندر الحاليّ (من main:api-worker.ts):
//   PNG → renderFrame → يستعمل template.card
//   MP4 → renderVideo → يستعمل template.video
const REQUIRED_BRANCHES = ['card', 'video'];

const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json')).sort();
const errors = [];

for (const file of files) {
  const obj = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'));
  for (const branch of REQUIRED_BRANCHES) {
    if (!obj[branch]) {
      errors.push(
        `  ✗ ${file}: يفتقر إلى \`${branch}\` branch.\n` +
        `      عقد engine: PNG=template.card · MP4=template.video.\n` +
        `      قالب بلا ${branch} ⇒ export يفشل عند api-worker (${branch === 'card' ? 'PNG_UNSUPPORTED_TEMPLATE' : 'MP4_UNSUPPORTED_TEMPLATE'}).`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`[check-templates-render-ready] ✗ ${errors.length} انحراف عقد:`);
  for (const e of errors) console.error(e);
  console.error(
    `\n  الحلّ (مقفول عندي · مسلَّم لـmk):\n` +
    `    (أ) أضِف "${REQUIRED_BRANCHES.join('" + "')}" layer لكل قالب في packages/templates/src/templates/.\n` +
    `    (ب) engine.renderFrame يقبل بغياب card (fallback إلى video snapshot).`
  );
  process.exit(1);
}

console.log(`[check-templates-render-ready] ✓ ${files.length} قوالب تحمل [${REQUIRED_BRANCHES.join(', ')}] كلّها.`);
