// scripts/check-docker-context — يفرض أن سياق Docker الحالي هو
// `colima-mediakit` (L-54). القاعدة موجودة في CLAUDE.md § بيئة مشتركة،
// وتُخالَف صامتاً بلا هذا الحارس ⇒ أوامر Docker قد تصيب بيئة منهاج.
//
// **الاستخدام:** `node scripts/check-docker-context.mjs`
// **الخروج:** 0 حين السياق صحيح · 1 حين مغاير · 0 مع رسالة صريحة حين
// المستودع لا يحمل بنية Docker (لا `infra/docker-compose.yml`).
//
// **التخطّي (2026-09-11 · CHECK-FIX · L-71):** لا متغيّر بيئة يفرض
// التخطّي (سابقاً `SKIP_DOCKER_CONTEXT_CHECK=1` — أُزيل لأنّه نظير L-71:
// حارس يمرّ بلا فحص إن اختار المشغّل). الشرط الآن **حالة مستودع
// حتميّة**: إن غاب `infra/docker-compose.yml` فالمستودع لا يحتاج Docker
// أصلاً، والفحص يمرّ. وجود الملفّ يعني الفحص إلزاميّ.
//
// **اختبار الوجود (L-46):**
//   1. غيّر السياق إلى غير `colima-mediakit` (مثلاً `docker context use default`)
//      وشغّل ⇒ يفشل بـexit 1.
//   2. أعده إلى `colima-mediakit` ⇒ يمرّ.
//   3. أعِد تسمية `infra/docker-compose.yml` مؤقّتاً ⇒ يمرّ مع رسالة
//      «المستودع بلا بنية Docker». أعده ⇒ يعود لسلوكه الإلزاميّ.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPOSE_PATH = join(ROOT, 'infra/docker-compose.yml');

const EXPECTED = 'colima-mediakit';

// الشرط الدقيق (بديل SKIP): مستودع بلا docker-compose.yml لا يحتاج
// السياق. حالة MDR-only أو checkout جزئيّ في CI بلا infra/.
if (!existsSync(COMPOSE_PATH)) {
  console.log(`[check-docker-context] ✓ المستودع بلا bنية Docker (لا ${COMPOSE_PATH}) — لا فحص`);
  process.exit(0);
}

let current;
try {
  current = execFileSync('docker', ['context', 'show'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch (err) {
  // Docker binary غير متاح — حالة مكتشَفة (CI · حاوية · محلّ لا يعرف docker).
  // لسنا في وضع «bypass اختياريّ» (L-71) — هذا فحص وجود binary. إن أراد
  // المطوّر تشغيل `pnpm db:up` وغيرها من أوامر Docker، سيفشل ذلك مباشرةً
  // برسالة docker-not-found طبيعيّة. لا ضمانة إخفاء هنا.
  //
  // GATE-2LAYER · 2026-09-11: هذا يسمح بتشغيل `pnpm test` داخل حاوية Linux
  // (`./bin/mk-ci`) بلا حاجة لـdocker-in-docker.
  console.log(`[check-docker-context] ✓ Docker غير مثبَّت — لا فحص (CI أو حاوية أو dev بلا docker).`);
  console.log(`   ملاحظة: أوامر Docker (db:up · db:reset · إلخ) ستفشل مباشرةً حين تُستدعى.`);
  process.exit(0);
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
