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
// **محلّيّ بقرار — لا يُشغَّل في CI (2026-09-11 · 20-CI-BUILD §4):**
// هذا الحارس **مُستبعَد صراحةً** من سلسلة CI — راجع خطوة «pnpm test
// (بلا check:docker-context — استثناء محلّيّ فقط)» في
// `.github/workflows/ci.yml`. السبب:
//   • **ما يحرسه:** عزل سياق Colima على الميني — يمنع أوامر Docker
//     الخاصّة بـpf-mediakit من إصابة بيئتَي `~/Minhaj` و `~/PrimeMind`
//     المشتركتَين على نفس الجهاز (CLAUDE.md § بيئة مشتركة).
//   • **متى يُشغَّل:** **التطوير المحلّيّ فقط** على الميني — كلّ استدعاء
//     `pnpm test` هناك يفحصه، فالخطر اليوميّ مغطّى.
//   • **لماذا ليس في CI:** runner ephemeral · بلا Colima · بلا مشاريع
//     مشتركة — الغاية غير قابلة للتطبيق. تسمية سياق `colima-mediakit`
//     في CI لتمرير الفحص = مسرح (Option 3 المرفوض في §4 من 20-CI-BUILD).
//   • **إخراج نظيف (Option B):** الـworkflow يقرأ سلسلة `pnpm test` من
//     `package.json` وقت التشغيل ويحذف السطر — مصدر حقيقة واحد، بلا
//     حقيقة متوازية، بلا لمس `package.json`.
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
  console.error(`[check-docker-context] ✗ فشل استدعاء \`docker context show\`.`);
  console.error(`   السبب المحتمل: Docker غير مثبَّت أو غير متاح في PATH.`);
  console.error(`   المستودع يحمل infra/docker-compose.yml ⇒ Docker مطلوب.`);
  console.error(`   الحلّ: ثبّت Docker (أو Colima) وأعد المحاولة.`);
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
