// scripts/check-docker-context — يفرض أن سياق Docker الحالي هو
// `colima-mediakit` (L-54). القاعدة موجودة في CLAUDE.md § بيئة مشتركة،
// وتُخالَف صامتاً بلا هذا الحارس ⇒ أوامر Docker قد تصيب بيئة منهاج.
//
// **الاستخدام:** `node scripts/check-docker-context.mjs`
// **الخروج:** 0 حين السياق صحيح · 1 حين مغاير أو Docker غير مثبَّت.
//
// **الاستثناء:** إن كان متغيّر `SKIP_DOCKER_CONTEXT_CHECK=1` في البيئة
// (بيئة CI بلا Docker، مثلاً)، يمرّ الفحص مع تحذير.

import { execFileSync } from 'node:child_process';

const EXPECTED = 'colima-mediakit';

if (process.env.SKIP_DOCKER_CONTEXT_CHECK === '1') {
  console.log(`[check-docker-context] ⚠ تُخطّي (SKIP_DOCKER_CONTEXT_CHECK=1)`);
  process.exit(0);
}

let current;
try {
  current = execFileSync('docker', ['context', 'show'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch (err) {
  console.error(`[check-docker-context] ✗ فشل استدعاء \`docker context show\`.`);
  console.error(`   السبب المحتمل: Docker غير مثبَّت أو غير متاح في PATH.`);
  console.error(`   إن كان مقصوداً (CI بلا Docker)، عيّن SKIP_DOCKER_CONTEXT_CHECK=1.`);
  process.exit(1);
}

if (current === EXPECTED) {
  console.log(`[check-docker-context] ✓ السياق = ${current}`);
  process.exit(0);
}

console.error(`[check-docker-context] ✗ سياق Docker غير مطابق.`);
console.error(`   المتوقّع: ${EXPECTED}`);
console.error(`   الفعلي:  ${current}`);
console.error(`   الحل: docker context use ${EXPECTED}`);
console.error(`   السبب (L-54): أوامر Docker خارج \`colima-mediakit\` قد تُلوّث بيئة`);
console.error(`   \`~/Minhaj\` أو \`~/PrimeMind\`. راجع CLAUDE.md § بيئة مشتركة.`);
process.exit(1);
