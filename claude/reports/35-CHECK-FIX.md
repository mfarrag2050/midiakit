# CHECK-FIX — تقرير

**سطر الاستلام:** استلمتُ 35-CHECK-FIX · شجرة `/Users/mdervis/MediaKit/pf-mediakit` على `main`.

**وسم الجُمَل:** 👁‍🗨 رأيتُه في مخرَج · 📄 قاله سكربت ولم أتحقّق · ❓ لا أعرف.

---

## ١. الحارسان الجديدان — وُصلا

**👁‍🗨** أُضيفا إلى سلسلة `pnpm test` بعد `check:dashboard-not-published` مباشرةً (قبل فحوص feat/api):

```
+ pnpm check:skill-fresh
+ pnpm check:docs-bundle-fresh
```

**عدد أوامر السلسلة:** 25 → **27**.

**👁‍🗨 حالتهما الحاليّة:** كلاهما أخضر — SKILL و BUNDLE مولَّدان بعد آخر التزام في WIRE-7 (skill:publish commit `9a299b3`).

**ملاحظة تصميم:** كلٌّ منهما يفحص فقط ملفّه (`git status --porcelain -- docs/SKILL-mediakit.md` أو `BUNDLE.md`) — لا يفشل لتغيّر ملفّات أخرى غير مُلتزَمة. يفشل عند إمّا: (أ) المُلتزَم لا يطابق المولَّد الآن، أو (ب) الملفّ نفسه dirty. طبيعتهما التي تكفي: يمنع رفع SKILL/BUNDLE متأخّرَين عن HEAD.

---

## ٢. `check:docker-context` — القرار والسبب

**قراري:** **الخيار (ب) — حذف المنفذ + شرط دقيق.**

**لماذا:** ال-`SKIP_DOCKER_CONTEXT_CHECK=1` كان **بالضبط الأنموذج الذي يحذّر منه L-71** — «حارس يمرّ بلا فحص إن اختار المشغّل». من يكتب `SKIP=1` مرّة يعتاد كتابتها كلّ مرّة، ويصير الفحص عملياً معطَّلاً. الخيار (أ) (فشل بـexit 1 داخل pnpm test فقط) يُصلح نصف المشكلة ويترك السطح المتاح للاستدعاء اليدويّ — الذي هو المكان الأخطر لأنّ المطوّر هناك يعمل مع docker فعلياً. الشرط الدقيق (وجود `infra/docker-compose.yml`) **حالة مستودع حتميّة** — لا env var، لا اختيار مشغّل.

**التغيير في `scripts/check-docker-context.mjs`:**

| قبل | بعد |
|---|---|
| `if (process.env.SKIP_DOCKER_CONTEXT_CHECK === '1')` → يطبع «⚠ تُخطّي» و`exit 0` | **أُزيل بالكامل**. `SKIP_DOCKER_CONTEXT_CHECK=1` صار بلا أثر |
| — | جديد: `if (!existsSync('infra/docker-compose.yml'))` → `exit 0` مع رسالة «المستودع بلا بنية Docker» |
| رسالة عند غياب `docker` تُشير للـSKIP كحلّ | رسالة جديدة تُشير لتثبيت Docker/Colima كحلّ (المستودع يحمل infra ⇒ docker مطلوب) |

**اختبار الوجود (L-46 · مُثبَت 👁‍🗨):**

| الحالة | المتوقّع | المُلتقَط |
|---|---|---|
| السياق = `colima-mediakit` + infra موجود | exit 0 + `✓ السياق = colima-mediakit` | ✓ ثبت |
| `SKIP_DOCKER_CONTEXT_CHECK=1` (متغيّر لم يعد يفعل شيئاً) | يتصرّف كأنّه غير مضبوط | ✓ ثبت — طبع نفس رسالة النجاح، لم يتخطّ |
| `docker` غير موجود في PATH + infra موجود | exit **1** + رسالة «Docker مطلوب» | ✓ ثبت — `env -i PATH="/usr/bin:/bin" node scripts/check-docker-context.mjs` = exit 1 |
| `infra/docker-compose.yml` مُعاد تسميته | exit 0 مع «المستودع بلا بنية Docker» | ✓ ثبت |
| استعادة الملفّ | سلوك إلزاميّ يعود | ✓ ثبت |

**التوثيق في السكربت:** أُضيف قسم «التخطّي (2026-09-11 · CHECK-FIX · L-71)» يشرح لماذا أُزيل SKIP، وقسم «اختبار الوجود (L-46)» بثلاث خطوات.

---

## ٣. الاختباران السلبيّان — لماذا هذان بالذات

**المعيار:** أيّهما لو كذب لأضرّ أكثر. من السبعة بلا اختبار موثَّق:

1. **`check:no-brand-leak`** — **الضرر لو كذب:** اسم مؤسسة حقيقية («أناضول») يظهر في مادة تسويقية أو عيّنة تُعرض على عميل. يكسر القاعدة العاشرة (CLAUDE.md §المشروع) — أساس التمييز التجاريّ. **بوابة مرحلة أولى.**
2. **`check:engine-purity`** — **الضرر لو كذب:** استيراد `document`/`window` يعبر في المحرك، فينهار الرندر على skia-canvas (Node · خادم). القاعدة الأولى في CLAUDE.md («المحرك خالص»). **بوابة معماريّة أساسيّة.**

الخمسة الأخرى (doc-paths · docker-context · no-git-internals · docs-bundle-fresh · skill-fresh) أدنى ضرراً نسبياً — الأوّل تحذير في وثيقة، الثاني وضّحته أعلاه، الثالث يحمي فقط من كتابة .git، والأخيران يمنعان publish stale لكن الأثر بشريّ يُكتشف قبل الشحن.

### 3.1 · `check:no-brand-leak`

**👁‍🗨 الحقنة (سطر واحد):**
```
$ echo '// canary WIRE-7/CHECK-FIX — أناضول' > packages/engine/src/__canary-brand-leak.ts
```

**مخرَج أحمر (👁‍🗨 رأيتُه):**
```
✗ 2 تسرّب/تسرّبات — نصوص عيّنة تستعمل اسم مؤسسة حقيقية:
  packages/engine/src/__canary-brand-leak.ts:1 — «أناضول» (وكالة الأناضول — الأداة الأصلية بُنيت لها)
    // canary WIRE-7/CHECK-FIX — أناضول
```
exit=**1** · العدد قبل الحذف: 517 ملفاً.

**مخرَج أخضر بعد الحذف (👁‍🗨 رأيتُه):**
```
$ rm packages/engine/src/__canary-brand-leak.ts
[check-no-brand-leak] فحص 440 ملفاً …
✓ نظيف — لا تسرّب في 440 ملفاً مفحوصاً.
```
exit=**0**.

**التوثيق في السكربت:** أُضيف قسم «اختبار الوجود (L-46 · CHECK-FIX 2026-09-11)» في رأس `scripts/check-no-brand-leak.mjs` بثلاث خطوات + سطر «مُثبَّت بمخرَج (2026-09-11)» يذكر رقم الملفّات ومحتوى المخرَج.

### 3.2 · `check:engine-purity`

**👁‍🗨 الحقنة:**
```
$ cat > packages/engine/src/__canary-purity.ts <<'EOF'
export function __canary() { return document.body; }
EOF
```

**مخرَج أحمر (👁‍🗨 رأيتُه):**
```
[engine-purity] فشل: 1 مخالفة في packages/engine/src
  packages/engine/src/__canary-purity.ts:3  banned-identifier (document)  ← export function __canary() { return document.body; }
```
exit=**1**.

**مخرَج أخضر بعد الحذف (👁‍🗨 رأيتُه):**
```
$ rm packages/engine/src/__canary-purity.ts
[engine-purity] نظيف — المحرك يحترم القاعدة الوحيدة.
```
exit=**0**.

**التوثيق في السكربت:** أُضيف قسم «اختبار الوجود (L-46 · CHECK-FIX 2026-09-11)» في رأس `scripts/check-engine-purity.mjs` بثلاث خطوات + سطر «مُثبَّت بمخرَج (2026-09-11)».

---

## ٤. سؤال `mkau` — `verify:render-video-all-templates` على مدخل تافه

**👁‍🗨 النتيجة: يفشل صحيحاً على المدخل الفارغ.** exit=**1**.

**التجربة:** استبدلتُ `CONTENT` القياسي بحقول فارغة (`headline: ""`, `kicker: ""`, ...) بحقنة `sed`، شغّلتُ `node --import tsx scripts/verify-render-video-all-templates.mjs`، ثم استعدتُ الأصل.

**المُلتقَط الحرفيّ:**
```
▶ verify-render-video-all-templates
  6 قالب · fps=30 · حدّ الزمن 5000ms

  ✗ breaking:      frames=225 · ms=46   · in-loop=0   · فشل: [renderFrame] badge (above/below-headline) قبل headline
  ✗ card_centered: frames=225 · ms=995  · in-loop=225 · IN_LOOP
  ✗ card_bottom:   frames=225 · ms=1017 · in-loop=225 · IN_LOOP
  ✗ card_kicker:   frames=225 · ms=1093 · in-loop=225 · IN_LOOP
  ✗ reel:          frames=225 · ms=1    · in-loop=1   · فشل: [renderFrame] badge (above/below-headline) قبل headline
  ✗ plain:         frames=225 · ms=1031 · in-loop=225 · IN_LOOP

✗ verify-render-video-all-templates FAILED — 2 فشل · 4 in-loop · 0 بطء
```

**تحليل:** كل قالب سقط بواحد من طريقين:
- **breaking · reel:** `renderVideo` رمى استثناء (`badge قبل headline`) لأنّ headline فارغ لا يُنتج `bounds`، ومع ذلك badge يحاول الاستهلاك.
- **card_centered · card_bottom · card_kicker · plain:** `prepareHeadline` يُستدعى **داخل حلقة الإطارات 225 مرّة** (`in-loop=225`) لأنّ الخطة لم تحمل headline، فيسقط على مسار slow-path لكلّ إطار → البوابة تكشفه.

**الاستنتاج:** الحارس **لا يمرّ صامتاً** على مدخل تافه — البوابتان الاثنتان (رمز الخطأ من `renderVideo` **و** `in-loop=0`) تكشفان الحالة. البوابة الثالثة (`ms ≤ 5000`) لم تظهر لكنّها موجودة في المنطق كطبقة رابعة.

**التقييد الوحيد الذي بقي:** لا يوجد اختبار سلبيّ **موثَّق في رأس السكربت** لهذه الحالة. اليوم أُضفت النتيجة إلى هذا التقرير — إن رأى المالك أن الحقنة تستحقّ توثيقاً دائماً في رأس السكربت (نمط dashboard-not-published)، تُضاف كتعديل تال.

---

## ٥. اكتشاف جانبيّ — `claude/**` كان يُفحَص، فسرَّب مرّتين

**👁‍🗨** أثناء إعداد canary الأوّل، اكتشفتُ أنّ `check:no-brand-leak` **يمرّ على مسارات `claude/reports/*.md`** التي تحوي مصطلح «أناضول» في سياق **وصف الحارس** (تقارير الوكلاء الأخرى تصف ما يحرسه no-brand-leak) لا في سياق تسريب.

**الملفّان اللذان أوقفا السلسلة:**
- `claude/reports/50-CHECK-AUDIT.md:20` — تقرير `mkau` الذي وصف الحارس نفسه
- `claude/reports/_panes.md:11` — سجلّ tmux قبض على أمرَي canary الذي شغّلتُهما

**المعالجة:** أُضيف `"claude/**"` إلى `excludeGlobs` في `scripts/brand-blocklist.json` مع تعليق `$claudeWorkspaceNote` يوثّق السبب: `claude/` مساحة عمل الوكلاء (inbox, reports, panes, .dispatched) لا تُشحن ولا تصل لعميل. نفس منطق استثناء `scripts/check-no-brand-leak.mjs` (السكربت يذكر الاسم في التعليقات ليصفه).

**بديل نظرتُ فيه ورفضتُه:** حذف مصطلح «أناضول» من التقارير — فشل لأنّ التقارير تُنتَج ديناميكيّاً في كل جلسة، والفلترة على المصدر لا الاستهلاك.

**العدد قبل/بعد:** 517 ملفاً → **440 ملفاً** بعد الاستثناء.

---

## ٦. `pnpm test` — قبل وبعد

| | قبل CHECK-FIX | بعد CHECK-FIX |
|---|---:|---:|
| عدد أوامر السلسلة | 25 | **27** (+2: skill-fresh + docs-bundle-fresh) |
| زمن التنفيذ | ~59s (بعد WIRE-7) | **~35s** (👁‍🗨) — التسريع ظاهريّ (تخزين مؤقت وشبكة) لا تعديلاً بنيوياً |
| النتيجة | 25/25 ✓ | **27/27 ✓** |

**👁‍🗨 المخرَج النهائيّ (نهاية pnpm test):**
```
▲ البوابات الكمّية اجتازت. **لم يُعلَن النجاح النهائي بعد (L-17).**
▲ الفيديو الكامل: /Users/mdervis/MediaKit/pf-mediakit/out/timeline-transitions-demo.mp4
```
اجتاز كلّ من: engine-purity · no-brand-leak · doc-paths · lessons-sequence · docker-context · no-git-internals · script-paths · dashboard-not-published · **skill-fresh** · **docs-bundle-fresh** · no-brand-url-fetch · no-paddle-outside-payments · no-ai-provider-outside-ai · brand-kit-patch-coverage · observe-import-scope · template-sync · plan-sync · control-plane-policies · response-envelope · vitest · verify:render-video-all-templates · verify:breaking-video · verify:caption-kashida-stability · verify:audio-gate · verify:media-track-gate · verify:text-tracks-gate · verify:transitions-gate.

---

## ٧. رؤوس الفروع وحكم الرفع

**رأس main قبل الالتزام:**
```
9a299b3  docs: skill:publish بعد WIRE-7
```

**ملفّات مُلتزَمة في CHECK-FIX:**
```
M  package.json                          (سلسلة test: +2 حارس)
M  scripts/brand-blocklist.json          (excludeGlobs: +claude/**)
M  scripts/check-docker-context.mjs      (حذف SKIP، شرط دقيق، L-46)
M  scripts/check-engine-purity.mjs       (توثيق L-46)
M  scripts/check-no-brand-leak.mjs       (توثيق L-46)
A  claude/reports/35-CHECK-FIX.md        (هذا التقرير)
```

**لا لمس:** PHASES.md · CLAUDE.md · docs/LESSONS.md · docs/11 · packages/engine/src/render.ts (IMAGE-FIX).

**skill:publish؟** لا حاجة — SKILL/BUNDLE يعتمدان على docs/ + PHASES.md، ولم أمسّهما. `check:skill-fresh` و `check:docs-bundle-fresh` يمرّان قبل وبعد.

**الدفع:** يُدفع في نهاية التذكرة إلى `origin/main`.

---

## ٨. لا لبس

- **📄 «check-no-brand-leak فحص 449 ملفاً · نظيف» في WIRE-7:** رأيتُ الرقم لكن **لا أعرف بالضبط** لماذا الملفّات القديمة في `claude/reports/` (بعضها من 11:03) لم تُلتقَط حينها. الفرضية الأقرب: `claude/reports/50-CHECK-AUDIT.md` (الذي يحمل «أناضول» في سياق وصف) أُنشئ في 11:51 — **بعد** WIRE-7 pnpm test الأخير. لكن `20-NEG-REAL.md` (11:03) موجود، والفحص كان أخضر عندها. **قد لا يحوي «أناضول».** لم أفحص كلّ ملفّ يدوياً — اكتفيتُ بإصلاح excludeGlobs.
- **❓ لماذا `_panes.md` تُكتب بيديّ (mode 600) بدل تتبّع git:** لا أعرف مصدر الآليّة (خارج نطاق CHECK-FIX).
- **📄 L-71 كمرجع في docker-context:** أشرتُ إليها في رأس السكربت الجديد لكن **لم أضف L-72 جديداً**. التذكرة قالت «هذا نظير L-71 بالضبط» — أخذتُ ذلك حرفيّاً وربطتُ القرار بـL-71 بدل توسيعه.
