# ترتيبُ الدمج · ماذا تفعل صباحاً — ورقةٌ واحدة

**التاريخ:** 2026-09-15 · بعد ليلةٍ عملت فيها أربعُ جلسات متوازية.
**اقرأها كما هي — لا تفترض معرفةً بأيّ تقريرٍ سابق.** الإحالاتُ إلى الملفّات بمساراتها الكاملة، لا بأرقام تذاكر.

---

## ١ · حالةُ الفروع الأربعة الآن

مقاسٌ عند كتابة هذه الورقة بـ`git ls-remote origin` — تُصبح قديمةً كلَّما دُفع شيء. أَعِد فحصها إن مرَّت ساعة:
```
git fetch origin
for b in main feat/api feat/ci feat/studio; do
  echo "$b: $(git rev-parse --short origin/$b)"
done
```

| الفرع | HEAD (قصير · مقاسٌ الآن) | أمام main | خلف main | آخرُ التزامٍ عليه |
|---|---|---:|---:|---|
| `main` | `6c7f28b` | — | — | 412 · حارسُ `render.ts:739 firstBaseline` |
| `feat/api` | `f17ec26` | 8 | 8 | 360 · tenant-cap · موصولةٌ بحدّ المستأجر |
| `feat/ci` | `b5bd5f8` | 55 | 38 | 330 · فحصُ دخانِ الشوروم (`scripts/mk-show-smoke.mjs`) |
| `feat/studio` | `1efd027` | 12 | 19 | 401 · تمييزُ المعدود العربيّ |

**ما بُني هذه الليلة (بلا ما زال على أيّ فرع بلا دمج):**
- `feat/api` · بوّابةُ الحبر · حارسُ الفيديو · إصلاحُ الهاشتاغ والأقواس · حدُّ المستأجر.
- `feat/studio` · BiDi · الأرقام · رمزُ الخطأ · حالةُ الانتظار · معدود عربيّ (401).
- `feat/ci` · انفصالُ منطقةِ السكيل العابرة للفروع · مولّد الفحوصات (`scripts/check-test-wiring.mjs`) · سقّاطةُ typecheck (`scripts/check-typecheck.mjs` + `scripts/typecheck-excludes.json`) · فحصُ دخانِ الشوروم (`scripts/mk-show-smoke.mjs`) · إصلاحات `bin/mk-worker` · اثنتا عشرةَ غلطةَ أنواعٍ في `packages/engine/src/timeline/*`.
- `main` · الخطُّ المرجعيُّ لأخطاءِ الأنواع (`scripts/typecheck-excludes.json` بأعداد main · تنتهي 2026-10-15) · حارسُ `render.ts:739 firstBaseline`.

---

## ٢ · الترتيبُ الملزم · بشرطِ عبورٍ لكلّ خطوة

**لا تنتقل إلى الخطوة التالية قبل أن يكون شرطُ العبور أخضر.** إن ظهر أحمرُ خارج قائمة المتوقَّع، توقّف وسائل — لا تُحدِّث لقطةً ولا استثناءً لتُسكته.

### الخطوة ٠ · تحقّق من أنّ main لم يتحرَّك أثناءَ نومك

قبل أيّ شيء:
```bash
git fetch origin && git rev-parse origin/main
```
إن اختلف `6c7f28b` عن ما تراه، **أعِد قراءة § ١ بعد الجذب** — قد يكون main تلقّى شيئاً لم يحتسبه هذا الملفّ.

**العبور:** `origin/main = 6c7f28b` أو رأسٌ أحدث بالتزامات mediakit موثَّقة.

---

### الخطوة ١ · إصلاحُ مولّدِ اللقطات الدلاليّة **قبل أيّ لقطةٍ جديدة**

**المشكلة (مقاسة):** جميع الاثنَي عشرَ ملفّاً في `snapshots-semantic/*.png` **متطابقةٌ بايت-بايت** لنظائرها في `snapshots/*.png` منذ ولادتها (2026-09-02 · التزام `4ca3242`). الحارسُ الدلاليّ **لم يكن حارساً في أيّ لحظة** — كان قناعاً. تفاصيل في `claude/reports/350-DO-THE-SNAPSHOTS-EVEN-WORK.md` § ٧.

**تصحيحُ الملفّات وحدها يعود قناعاً عند أوّل regen** لأنّ العطبَ في المولّد نفسِه — `bin/mk-ci:51-53` نصّه:
```bash
if [[ "${1:-}" == "--regen-refs" ]]; then
  echo "[mk-ci] --regen-refs غير مُنفَّذ بعد ..."
  exit 1
fi
```

**المطلوب على main (ينفّذه mediakit):**
1. **نفّذ `--regen-refs` في `bin/mk-ci`**: يشغّل `scripts/preview.mjs --brand=<default,client-demo> --template=all --semantic=off/on` مرّتين، ثم ينسخ **حصريّاً**: `out/nosemantic/*.png → snapshots/` و `out/semantic/*.png → snapshots-semantic/`.
2. **حارسٌ مضادّ للنسخ:** بعد التوليد، لكلّ اسمٍ اثنَي عشرَ، ارفض التزام إن `md5(snapshots/x) == md5(snapshots-semantic/x)`.
3. **احذف المجلّدَين اليتيمَين:** `snapshots-pre-placement/` و `snapshots-semantic-pre-placement/` — ٢٤ ملفّاً بلا سكربتٍ يمسّها منذ 2026-09-02. تُحدث قناعاً خفيفاً.
4. أَعِد توليد المجموعتَين داخل حاوية Linux (`docker run --platform linux/arm64 -v $PWD:/work -v pf-mediakit-ci-node-modules:/work/node_modules -w /work node:20.18.1-bookworm-slim bash -c 'pnpm install --frozen-lockfile && bin/mk-ci --regen-refs'`).

**العبور:**
- `pnpm verify:snapshot` داخل حاوية Linux على main = **٢٤/٢٤ مطابقة · 0 إخفاق**.
- على الأقلّ عشرة من الاثنَي عشرَ ملفّاً لديها `md5(snapshots/x) != md5(snapshots-semantic/x)` — الدلاليّ يختلف عن اللادلاليّ في مدخلاتٍ متعدّدة.
- المجلّدان اليتيمان محذوفان (`git ls-tree origin/main | grep pre-placement` = فارغ).

---

### الخطوة ٢ · دمجُ `feat/api` في main

feat/api يجلب: بوّابةَ الحبر · حارسَ الفيديو · إصلاحاتِ الهاشتاغ والأقواس · حدَّ المستأجر (360). يلمس أساساً `apps/api/*` و `apps/renderer/src/api-worker.ts` و `packages/i18n/*.json`.

**بعد الدمج:**
```bash
pnpm skill:build && git add docs/SKILL-mediakit.md && git commit -m "chore(skill): regenerate بعد دمج feat/api"
```

**العبور:**
- `bin/mk-ci` (حاوية Linux · محلّياً) على main = أخضر.
- `pnpm check:skill-fresh` = ✓.

---

### الخطوة ٣ · دمجُ `feat/studio` في main

feat/studio يجلب: BiDi · الأرقام · رمزَ الخطأ · حالةَ الانتظار · معدود عربيّ (401). يلمس أساساً `apps/studio/*` و `packages/i18n/*.json` — الأخير قد يتعارض مع feat/api (كلاهما يضيف مفاتيح locale).

**بعد الدمج:**
```bash
pnpm skill:build && git add docs/SKILL-mediakit.md && git commit -m "chore(skill): regenerate بعد دمج feat/studio"
```

**العبور:** كخطوة ٢.

---

### الخطوة ٤ · دمجُ `feat/ci` في main — البنيةُ التحتيّةُ الكاملة

feat/ci يجلب: `.github/workflows/*.yml` (**ملفّاتُ CI · غيرُ موجودة على main اليوم**) · `bin/mk-ci` · `scripts/check-test-wiring.mjs` + `scripts/gates-excludes.json` · `scripts/check-typecheck.mjs` + `scripts/typecheck-excludes.json` · `scripts/mk-show-smoke.mjs` · إصلاحات `bin/mk-worker` (٤ التزامات ٢٩٠) · اثنتا عشرةَ إصلاحَ أنواعٍ في `packages/engine/src/timeline/*` (٤ التزامات ٣٠٠) · فصل منطقة CROSS-BRANCH في `docs/SKILL-mediakit.md` (٢٨٠).

**تعارضٌ متوقَّع:** `scripts/typecheck-excludes.json` — feat/ci يحمل نسخةً بأعداد feat/ci (٧-٢٨ خطأ/حزمة · ١٠٨ إجماليّ)، main يحمل نسخةً بأعداد main (٧-٣٩ · ١٦٢ إجماليّ). **احتفظ بنسخة main** (`git checkout --ours` أو حلّاً يدويّاً · أعداد main هي الصحيحة بعد ٤١٢).

**بعد الدمج:**
```bash
pnpm skill:build && git add docs/SKILL-mediakit.md && git commit -m "chore(skill): regenerate بعد دمج feat/ci"
```

**العبور:**
- `bin/mk-ci` على main = أخضر (يشغّل الآن ٥١ بوّابة داخل السلسلة + ٢٠ verifier إضافيّ).
- `pnpm check:typecheck` على main = `✓ 0 خضراء · N استثناء بمبرِّر` (N = عدد الحزم الحمراء · بحسب `scripts/typecheck-excludes.json`).
- `pnpm check:test-wiring` = `✓ M حارس · K في pnpm test · L استثناء بمبرِّر`.
- `pnpm check:skill-fresh` = ✓.
- `pnpm verify:snapshot` (داخل حاوية Linux) = ٢٤/٢٤ مطابقة (شرطُ الخطوة ١ محقَّق).

---

### الخطوة ٥ · إضاءةُ CI — الدفع الأوّل يفير `.github/workflows/ci.yml`

**قبل هذه اللحظة، GitHub Actions لا يعمل على main.** الملفّ `.github/workflows/ci.yml` لم يكن على main حتى الخطوة ٤. أوّلُ push إلى main بعد ذلك يقرأه GitHub ويُشعل الـworkflow.

**قبل الضغط على المفتاح، تأكّد:**
- الخطوات ١-٤ كلُّها عبَرت (اللقطات مُصلَحة · typecheck أخضر · test-wiring أخضر · skill مُوَلَّد حديثاً).

**افتح GitHub Actions فور الدفع:**
- workflow `CI` يبدأ خلال ~10 ثوانٍ.
- container `node:20.18.1-bookworm-slim` يقلع.
- postgres/redis/minio services تقلع.
- خطوة `pnpm test` تجري ~51 بوّابة (ابحث عن السطر `===== سلسلة pnpm test (51 بوابة) =====`).
- خطوة `20 verifier خارج pnpm test` تجري (ابحث عن `===== 20 verifier خارج pnpm test =====`).
- مدّة الـrun: ١٢-٢٠ دقيقة.
- artifact `breaking-linux-amd64.mp4` مرفوع.

**العبور:** الـrun أخضرُ في نهايته. إن أحمرَ، **لا تُحدِّث لقطةً ولا استثناءً لتُسكته** — راجع السجلَّ واقرأ الرسالةَ الحرفيّة.

---

### الخطوة ٦ · اختبارُ الطفرة — أنّ CI يستطيع الاحمرار

الأخضرُ في الخطوة ٥ يُثبت أنّ CI يعمل ويُنتج نتيجةً خضراء. لا يُثبت أنّه **قادرٌ على الاحمرار عند فسادٍ متعمَّد** — القاعدة كاملة (`claude/reports/320-THE-DEEPER-STEP.md § ٤`) تشترط:

**«حارسٌ حقيقيّ يُثبت ثلاثاً: يخضرّ الآن على الشجرة السليمة · يستطيع الاحمرار عند فسادٍ متعمَّد · والحمرةُ تُفشل البناء وتُوقف الدمج.»**

**التنفيذ:**
```bash
git checkout -b test/ci-mutation-check
# أَدخِل خطأً واضحاً في ملفٍّ غير مقفول — مثلاً typecheck error:
echo 'const _mkci_mutation: string = 42;' >> packages/engine/src/timeline/plan.ts
git commit -am "test: deliberate typecheck error"
git push origin test/ci-mutation-check
# افتح GitHub Actions — الـworkflow يفير، pnpm test أحمر عند check:typecheck.
# بعد التأكّد:
git push origin --delete test/ci-mutation-check
```

**العبور:** run الفرع المؤقّت أحمر · اسمُ الحارس المحدَّد (`check:typecheck`) يظهر في `FAILED[]` summary. احذف الفرع بعد التأكّد.

---

### الخطوة ٧ · صيانة · لا تُنسَ

بعد الأخضرَين (٥ و ٦)، الطقمُ محروسٌ حقيقيّاً. **لكنّ الحرّاسَ تتشيّخ:**
- **استثناءات `scripts/typecheck-excludes.json` تنتهي 2026-10-15.** قبل هذا التاريخ، إمّا يُخفَّض السقفُ (أخطاء أُغلقت) أو يُمَدَّد الاستثناءُ بمبرِّرٍ محدَّث. مذكورة في `claude/POST-DEMO-QUEUE.md` § سابعاً.
- **ربطُ `mk-show-smoke.mjs` بـ`bin/mk-show`** — الفحصُ موجود لكن لم يُربَط تلقائيّاً بعد `up` (بانتظار 403ب). راجع `claude/reports/330-A-STACK-THAT-CANNOT-BE-ENTERED-IS-NOT-UP.md § ٤`.

---

## ٣ · ثلاثةٌ لا تُفعَل — بصيغة النهي وسببٍ لكلٍّ

### لا تُحدِّث لقطةً لتُسكت فرقاً قبل معرفة سببه

`pnpm verify:snapshot` يُنتج فروقاً بحجم البايت — `فعلي=Xb متوقّع=Yb`. إغراءُ نسخ `out/*.png` إلى `snapshots/` لجعل الأخضرِ يعود **يُغلق الحارسَ على عطبٍ حقيقيّ صامتاً**. أوّلاً افحص:
- هل الفرقُ **بيئيّ** (metadata PNG · نسخةُ native lib)؟ `pngcheck -tv` يفرّق.
- هل هو **حقيقيّ** (المحرّك تغيّر · طبقةٌ رسمت أقلّ)؟ افتح الصورةَ وقارن.
تحديثُ اللقطة قبل الجواب يخبّئ العطبَ في السقّاطة نفسِها.

### لا تُضِئ CI وهو أحمرُ من الثانية الأولى

حارسٌ يولد أحمرَ يُتَعَلَّم تجاهلُه في أسبوع. هذا سبب ترتيب هذه الورقة: ١٢ خطأً موروثاً في `packages/engine/src/timeline/*` أُغلقت (٣٠٠) · ٤٢ خطأً في باقي main مضبوطة بسقّاطة تنتهي 2026-10-15 (٤١٢) · اللقطاتُ الدلاليّة تُصلَح (١) قبل الدمج. إن دَفعتَ ci.yml إلى main قبل الخطوات ١-٤، الـrun الأوّل أحمرُ فوريّاً على أشياءَ لم نُصلحها بعد، فيصير الأحمرُ ضجيجاً.

### لا تُمدّد استثناءَ typecheck بلا كتابة سببٍ وتاريخ

`scripts/typecheck-excludes.json` تحمل ست حزم مع `max_errors` + `expires: "2026-10-15"` + `reason` + `owner` + `close_ticket`. عند 2026-10-15، الحارس يفشل تلقائيّاً. المُغرَى بتمديدِ التاريخ بلا كتابة سببٍ جديد يُبقي دَيناً بلا مساءلة. **«كما كان» ليست مبرِّراً.** إمّا يُخفَّض السقف (أُغلقت أخطاء) أو يُكتب سببُ التمديد بوقتٍ جديد ومالكٍ يقدر أن يُسأل عنه.

---

## ٤ · أين ينتهي عملي، وأين يبدأ ما لم أَفحص

**ما أنجزتُه ووُثِّق في `claude/reports/`:**
- `280-THE-FRESHNESS-CHECK-GOES-RED-AFTER-EVERY-MERGE.md` — فصلُ منطقة CROSS-BRANCH في `docs/SKILL-mediakit.md`.
- `290-THE-TOOLS-THAT-LIE.md` — إصلاحاتٌ في `bin/mk-worker` + قراءة `claude/bin/mk-sync.sh` + plist.
- `300-TWELVE-ERRORS-NOBODY-OWNS.md` — اثنتا عشرةَ غلطةَ أنواعٍ في `packages/engine/src/timeline/*` أُغلقت.
- `310-A-GUARD-THAT-DOES-NOT-RUN.md` — مولّدُ الفحوصات (`scripts/check-test-wiring.mjs`).
- `320-THE-DEEPER-STEP.md` — سقّاطةُ typecheck (`scripts/check-typecheck.mjs`).
- `330-A-STACK-THAT-CANNOT-BE-ENTERED-IS-NOT-UP.md` — فحصُ دخانِ الشوروم (`scripts/mk-show-smoke.mjs`).
- `340-WHAT-IS-RED-AND-WHERE.md` — جردُ حالةِ الفروع الأربعة.
- `350-DO-THE-SNAPSHOTS-EVEN-WORK.md` — كشفُ أنّ `snapshots-semantic/` قناعٌ · واثنَي مجلّدَين يتيمَين.

**كلُّها على `feat/ci` (`b5bd5f8`) — مدفوعةٌ إلى origin.**

**ما لم أَفحصه (ولا يُفترَض أنّي فعلت):**
- **صحّةُ ٤١٢ على main تفصيليّاً** — قِسْتُ إجماليّ أخطاء main = ١٦٢ (بعد إصلاح `render.ts:739`)، لكن لم أَفتح `scripts/typecheck-excludes.json` على main للتحقّق من كلّ حزمةٍ فرداً.
- **الكود الجديد في `feat/api` منذ آخر مسحٍ** — لمستُ ٥٥ التزاماً على feat/ci من زاويةِ الدمج، لا من زاويةِ محتوى `feat/api`.
- **الكود الجديد في `feat/studio` منذ آخر مسحٍ** — 401 (تمييز المعدود العربيّ · اليوم 13:44) لم أَقرأه.
- **العاملُ الحيّ على الميني (PID 2255 تحت `mkguard`)** — لَمْ ألمسه (وكانت تعليمةً صريحة). لَمْ أَفحص ذاكرتَه أو صحّةَ اتّصاله بـRedis.
- **الأربعُ workflows الأخرى في `.github/workflows/`** (`l46-redis-observe.yml` · `nightly-slow.yml` · `regen-breaking-linux-md5.yml`) — لم أفحص محتواها.
- **`snapshots-video/`** — ملفّان (mp4 + md5) خارج نطاق `verify:snapshot`. يحرسه `verify:breaking-video`. لم أَفحصه.
- **`snapshots-plan/`** — 12 JSON مقارنةً بـ`verify:plan-values`. صرفتُه في § ٧·ب من ٣٥٠ بأنّه مسارٌ مختلف (خطة لا صورة) — لم أَفتح ملفّاً منه.
- **ما بعد إضاءة CI** — الخطوات ٥-٦ في § ٢ **مخطَّطةٌ لا مُقاسة**. أوّلُ run حقيقيّ على main يُعرِّف ديناً محتملاً موروثاً لم يظهر بعد.

**إن سقط شيءٌ خارج هذه القائمة، لا تنسبه إليّ — لم أفحصه. وإن سقط داخلها، افتح تقريرَه في `claude/reports/` — الأمرُ الذي أنتجه مذكورٌ فيه.**

---

*هذه الورقة مكتوبةٌ في `/Users/mdervis/MediaKit/pf-mediakit-dash/claude/MERGE-ORDER.md` على فرع `feat/ci` (`b5bd5f8` عند الكتابة). إن دُمج `feat/ci` في main تجدها في `claude/MERGE-ORDER.md` هناك.*
