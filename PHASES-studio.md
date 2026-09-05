# PHASES-studio.md — مسار الواجهة (feat/studio)

> **الفرع:** `feat/studio` · **المجلد:** `~/MediaKit/pf-mediakit-studio` ·
> **الجلسة:** `mk-studio` · **المنفذ:** 19050.
>
> يُدمج محتواه في `PHASES.md` عند اندماج الفرع (بواسطة جلسة `main`).

## مرجع

- `docs/17-phase4-plan.md §4` — ترتيب البناء S1–S22.
- `docs/16-api-contract.md` — عقد endpoints.
- `docs/11-parallel-work.md` — قواعد المسارات المتوازية.
- `docs/02 §ADR-011` — عزل المستأجرين.

## تنبيه ترقيم (2026-09-05)

التسميات في رسائل الالتزام `cadbb28` · `fe44d4f` · `93fa429` ·
`ef98a25` **لا تطابق ترقيم `docs/17 §4`**. الانزياح: ما سُمّي هناك
`S3` هو في الحقيقة `S4`، وطبقة API (`S3` في `docs/17`) بُنيت ضمن
الالتزام المسمّى `S1`. التسمية بدأت في المحادثة قبل مراجعة
`docs/17`.

**التاريخ المدفوع لا يُعاد كتابته.** رسائل الالتزام تبقى سجلاً كما
صدرت. هذه الوثيقة (حالة، لا سجلّ) تُصحَّح: **كل إشارة من هنا
فصاعداً تستعمل ترقيم `docs/17` وحده.**

**الخريطة:**

| رسالة الالتزام | التسمية | ترقيم `docs/17` |
|---|---|---|
| `cadbb28` | «S1: scaffold + API client» | **S1** (إطار) + **S3** (طبقة API) |
| `fe44d4f` | «S2: design system» | **S2** — بتحفّظ (البند أدناه) |
| `93fa429` | «S3: i18n» | **S4** (طبقة i18n) |
| `ef98a25` | «S4: digits + direction» | **خارج ترقيم `docs/17`** — امتداد (L-23) |
| `7b54351` | «S4.5: enforce UI rules» | خارج ترقيم `docs/17` — امتداد |

**الحالة:** `S1` · `S2` (بتحفّظ) · `S3` · `S4` **مبنيّة**. `S5` لم
تبدأ — وهي غير محجوزة: `docs/17` يبنيها على mocks حتى `A6-A8`،
و`A8` مكتملة (خارج فرعنا).

## S1 — الإطار ✅  ·  يشمل S3 (طبقة API)

**التسليم:** Next.js 14 في `apps/studio` بـTypeScript صارم، متكامل مع
pnpm workspace. المنفذ 19050. طبقة عميل mk-api مكتوبة بعقدها من
`docs/16 §2-§16`، **بلا استدعاء من أيّ صفحة** (SYNC-α لم يفتح).

**ما بُني:**
- التكوين: `package.json`, `tsconfig.json`, `next.config.mjs`,
  `tailwind.config.ts`, `postcss.config.mjs`.
- تخطيط الجذر (`app/layout.tsx`) يفعّل `LocaleProvider` ويضبط
  `dir="rtl"` افتراضياً.
- مجموعتا مسارات: `(app)/{projects,brand-kits,templates,assets,renders}`
  و `(auth)/{login,signup,forgot-password,reset-password}`.
- تخطيط `AppShell` (شريط جانبي + رأس + مضمون) و `AuthShell` (عمود مركزي).
- `PageHeader` و `EmptyState` كصفحات ما قبل الربط.
- طبقة API كاملة تحت `src/api/`:
  - `client.ts` — Bearer, auto-refresh (401)، احترام Retry-After (429)،
    Idempotency-Key، cursor pagination، `filter[field]`.
  - `errors.ts` — `ApiError` + قائمة `ApiErrorCode` من §1.4.
  - `tokens.ts` — access/refresh في localStorage.
  - `endpoints/*.ts` — 13 موردًا: auth, tenants, users, brand-kits,
    templates, projects, assets, renders, workflows, annotations,
    revisions, subscription, usage, ai.
  - `types.ts` — `Role`, `Locale`, `Plan`, `Tenant`, `User`.

**اللقطة:** `demo/studio/projects.png`,
`demo/studio/login.png`.

**ما رأيته في اللقطة (L-17):**
- RTL يعمل — الشريط الجانبي على اليمين، المحتوى على اليسار.
- الشريط الجانبي يعرض خمسة عناصر (مشاريع/هويات/قوالب/أصول/تصديرات)
  مع أيقونات نصية بسيطة، البند النشط (`nav.projects`) مظلَّل بلون
  `--surface-2`.
- رأس علوي بارتفاع 56px يحوي `nav.workspace` و `nav.user.placeholder`.
- بطاقة "empty state" في المنتصف بحدود متقطعة على `--surface/40`.
- الطباعة تظهر مفاتيح i18n خام (`pages.projects.title` …) — متوقّع
  قبل **S4** (i18n)، الذي يملأ القواميس.
- الألوان: خلفية `#0b0d10`، سطح `#12151a`، حدود شفافة 8%، لهجة
  زيتية `#d4a017` (ستظهر مع الأزرار في S2).

**تحقّق مطلوب:** `pnpm typecheck` أخضر. `curl` ثلاث شاشات: `/` (307)،
`/projects` (200)، `/login` (200).

**غير مطلوب في S1:** استدعاء أيّ endpoint من أيّ صفحة (تنتظر SYNC-α
حسب `docs/17 §5`).

## S2 — نظام التصميم ✅  ·  عُولج التحفّظ في S2-X

**التحفّظ الأصلي (يُسجَّل للتاريخ):** `docs/17 §4.1` يعرّف **S2**
بأنها `packages/ui` — حزمة مشتركة. المبنيّ في `apps/studio/src/ui/`
كان حبيس تطبيق واحد. قرار معماري اتُّخذ ضمناً بلا مراجعة `docs/17`.
**عُولج في S2-X (2026-09-05)** — راجع القسم الأخير أدناه.

**التسليم:** مكتبة atoms + composites تحت `apps/studio/src/ui/`،
**RTL-first**: استعمال خصائص منطقية (`ms-*`, `pe-*`, `text-start/end`)
حصراً — لا فروع `dir==='rtl'` في المكوّنات. كل مكوّن يستقبل مفاتيح
i18n (`*Key`) لا نصوصاً (L-22 على مستوى الواجهة).

**Atoms:**
- `Button` — 4 variants (primary/secondary/ghost/danger) × 2 sizes +
  `loading` + `leadingIcon`/`trailingIcon` + `fullWidth`.
- `Input`, `Textarea` — حالة `invalid` بصرية.
- `Field` — يلفّ label + input + help/error، يقبل `required`.
- `Card` — سطح مع رأس/عنوان/أفعال/ذيل، `padded` قابل للإيقاف.
- `Table<T>` — أعمدة مُعرَّفة بـ`Column<T>`، محاذاة `text`/`numeric`
  /`center`. النوعية `numeric` تُفعّل `tabular` + `text-end`.
- `Dialog` — قائم على `<dialog>` (focus + Escape + backdrop مجاناً)،
  variant `default`/`danger`.
- `Alert` — أربعة أنماط (info/success/warning/danger) بشريط لون +
  أيقونة.
- `Badge` — علامة صغيرة بخمس لهجات.

**Composites (منقولة إلى الأساس):**
- `AppShell` — يستعمل `LocaleSwitcher`.
- `AuthCard` — أعيد بناؤها لتستعمل `Field` + `Input` + `Button`.

**معرض حي:** `/design` (route جديد، مرتبط في الشريط الجانبي) يعرض كل
atom + composite في مكان واحد. الغاية: مراجعة بصرية في كل جلسة قادمة
تلمس نظام التصميم — L-17 يبقى ساري المفعول.

**اللقطات:** `design-{ar,mixed,en}.png` في `demo/studio/`.

**ما رأيته:**
- **AR**: Layout RTL — الشريط الجانبي على اليمين، بند «النظام» نشط.
  الأزرار تُقرأ من اليمين لليسار بأمر صحيح: حفظ (primary ذهبي)،
  إلغاء (secondary)، إغلاق (ghost)، حذف (danger)، حفظ (loading مع
  سبينر)، حفظ (disabled)، إجراء أساسي (small). كل الحقول تُظهر label
  فوق الإدخال، النجمة الحمراء بعد "الاسم *"، رسالة الخطأ الحمراء
  تحت "bad-value". Textarea يعرض help text. أربعة تنبيهات مكدَّسة
  بألوان مميزة. الجدول: رؤوس بعرض العمود، صفوف بترتيب صحيح، عمود
  «العدد» يظهر رقمياً بمحاذاة نهاية السطر.
- **EN**: Layout LTR — الشريط الجانبي على اليسار، نفس البنية معكوسة.
  الأزرار تفتح بـSave (ذهبي) على اليسار، تتوالى يميناً. عمود COUNT
  يظهر بمحاذاة right-end.
- **Mixed**: RTL، الوحدات المستقلّة (Design System, Buttons, Fields,
  Alerts, Table, Info, Warning…) بالإنجليزية؛ جمل الوصف والمساعدة
  بالعربية — L-24 محفوظ.

**تحقّق:** `pnpm typecheck` أخضر.

## S4 — i18n ✅

**التسليم:** ar/mixed/en على نمط `apps/dashboard/src/i18n/` (L-24 يحكم
الخلط). المخزن `pfmk.studio.locale` (ADR-011 · L-49 — لغة الموظف
لا الوكالة). `?locale=X` يتخطى المخزَّن للقطات.

**ما بُني:**
- `LocaleProvider.tsx` — dir/lang على `<html>`، Locale سياق React،
  `t()` مع fallback إلى العربية.
- `LocaleSwitcher.tsx` — ثلاثة أزرار مدمج في `AppShell` header و
  `AuthShell` header.
- `Ltr.tsx` — يوفَّر مبكراً؛ يستعمَل في الامتداد التالي وما بعد.
- ثلاث قواميس مع مفاتيح: `brand`, `locale`, `nav`, `pages.{projects,
  brandKits, templates, assets, renders}`, `auth.{login, signup, forgot,
  reset, field, hint}`, `actions`, `table`, `errors` (مفاتيح L-22).

**قاعدة L-24 مطبَّقة في `mixed`:**
- عناوين ووحدات مستقلّة بالإنجليزية: `Projects`, `Brand Kits`,
  `Templates`, `Assets`, `Renders`, `Workspace`, `Account`, `No … yet`.
- جمل الوصف والتلميحات بالعربية كاملةً.
- شاشات المصادقة (auth.*) عربية كاملة في mixed لأن الجملة الطويلة
  للتوجيه لا تحتمل الخلط داخل الجملة.

**اللقطات (L-17):** ست شاشات في `demo/studio/`:
`projects-{ar,mixed,en}.png` و `login-{ar,mixed,en}.png`.

**ما رأيته:**
- **AR/projects**: RTL كامل — الشريط على اليمين، مبدّل اللغة إلى
  اليسار، النصوص العربية تُقرأ صحيحة. البند النشط مظلَّل.
- **EN/projects**: LTR — الشريط على اليسار، النصوص الإنجليزية
  بحروف صحيحة الطباعة، مبدّل اللغة إلى اليمين.
- **Mixed/projects**: RTL محفوظ، الأسماء (Projects, Brand Kits…)
  بالإنجليزية كوحدات مستقلّة، الجمل التوصيفية عربية. قراءة صوتية:
  «Projects — بطاقاتك…» تنساب طبيعية بلا خلط داخل الجملة.
- **AR/login**: بطاقة مركزية، شارة MEDIA KIT ذهبية، حقول dir=ltr
  للبريد وكلمة السر، زر ذهبي بارز، روابط بلغة الحساب.

**تحقّق:** `pnpm typecheck` أخضر.

## امتداد — DigitStyle + Ltr (خارج ترقيم `docs/17`) ✅

**ليس في `docs/17`** — أُضيف لحاجة مقاسة (L-23: المركّبات الرقمية
تحت RTL تحتاج `dir="ltr"` صريحاً) وقاعدة تفضيل الأرقام لكل مستخدم
(CLAUDE.md §بنود إلزامية للعميل الأول). عُومل عند بنائه كـ«S4»
خطأً — التصحيح في تنبيه الترقيم أعلاه.

**التسليم:** `apps/studio/src/format/` مع أربع أدوات موحّدة تعالج
درسَي L-23 و تفضيل الأرقام لكل مستخدم.

**ما بُني:**
- `digits.ts` — `formatNumber` · `formatPercent` · `formatBytes` ·
  `transliterateDigits` — كلها تقبل `DigitStyle` (`latin` |
  `arabic-indic`) وتعتمد `Intl.NumberFormat` مع locale `ar-EG-u-nu-arab`
  للهندي.
- `datetime.ts` — `formatDate` · `formatDateTime` (ثابت YYYY-MM-DD،
  UTC) · `formatRelative` (منذ 7 دقيقة … · مع مفاتيح `time.minAgo`
  إلخ). كلاهما يحترم DigitStyle.
- `bidi.ts` — ثابتَي `LRM`/`RLM` + مساعدات `isolateLatinNumbersInArabic`
  للحالات النادرة التي لا يمكن فيها لفّ عنصر.
- `settings.ts` — `useDigitStyle()` + `readDigitStyle` (localStorage
  `pfmk.studio.digits`، `?digits=` override للاختبار). ينتقل إلى
  endpoint المستخدم في A9.
- `DigitStyleSwitcher.tsx` — مبدّل يماثل `LocaleSwitcher`.
- `Ltr` (من **S4** i18n) يُعاد تصديره من `format/index.ts` للاكتمال.

**دمج في `/design`:**
- بطاقة «Numbers & Direction» مع `DigitStyleSwitcher` في headerAction.
- أربع بطاقات مقياس: التخزين (Ltr على `460.4 GB / 108.0 GB`)،
  التصديرات (`12,345` أو `١٢٫٣٤٥`)، آخر تصدير (تاريخ + نسبي)،
  الاستهلاك (`42 / 100` **بلا Ltr** — عيّنة L-23 counter-example
  المرئية).

**اللقطات (L-17):** `design-ar-latin.png` · `design-ar-arab.png` ·
`design-en-latin.png`.

**ما رأيته:**
- **AR + latin**: التخزين «460.4 GB / 108.0 GB» صحيح، آخر تصدير
  «2026-09-04, 14:23» صحيح، الاستهلاك «100 / 42» **معكوس** (كما
  يجب — عيّنة L-23 counter-example).
- **AR + arabic-indic**: نفس البنية — «٤٦٠٫٤ GB / ١٠٨٫٠ GB»،
  «١٢٫٣٤٥»، «٢٠٢٦-٠٩-٠٤, ١٤:٢٣»، «منذ ٧ دقيقة». المبدّل يعمل من
  URL و localStorage. الوحدة (GB) تبقى لاتينية دائماً — قرار مقصود
  (SI standard مقروء عالمياً).
- **EN + latin**: كل شيء LTR طبيعي — «42 / 100» بلا حاجة Ltr.
  فواصل الألوف بالفاصلة (en-US).

**تحقّق:** `pnpm typecheck` أخضر.

## امتداد — S4.5: فرض قواعد الواجهة (خارج ترقيم `docs/17`) ✅

**التسليم:** أربعة فحوص آلية تفرض ما أعلنته تقارير المجموعات
السابقة (S1 · S2 · S4 · امتداد الأرقام) — رغم اختلاف تسميتها
حينها. نقل اللقطات من `apps/studio/screenshots/` إلى `demo/studio/`
(L-48 سابقة، L-55 حالياً) وتوثيق قرار عزل `DigitStyle` عن مسار
المخرَج.

**الفحوص الأربعة (scripts/):**

- `check-logical-props.mjs` — منع `ml/mr/pl/pr/left/right/text-left/
  text-right` في `apps/studio/src/ui/`. **يفرض RTL-first حسب S2.**
- `check-ui-keys.mjs` — منع نصوص عربية أو كلمات لاتينية ≥ 3 أحرف
  في JSX text تحت `apps/studio/src/ui/`. الاستثناء الوحيد:
  `/design/` بسبب طبيعته كمعرض عرض. الاستثناء مكتوب داخل السكربت
  بسببه، لا استثناء صامت. **يفرض L-22 على مستوى الواجهة.**
- `check-locale-parity.mjs` — مقارنة مجموعات المفاتيح في ar/mixed/en
  بالاتجاهين، مع تجاهل مفاتيح `_*` كتوثيق داخلي. **يمنع سقوط صامت
  إلى العربية.**
- `check-digit-style-isolation.mjs` — منع استيراد `useDigitStyle`
  و`DigitStyle` وباقي `format/` في `apps/studio/src/api/` وأي مسار
  preview/render/canvas/frame داخل studio. الفرع (ب) استباقي — يعلَن
  أنه بلا ملفات اليوم.

**كلها مربوطة في `package.json → test` بنفس نمط الفحوص القائمة.**
لا آلية جديدة. `pnpm check:logical-props` `pnpm check:ui-keys`
`pnpm check:locale-parity` `pnpm check:digit-style-isolation` — كلها
`node scripts/*.mjs`.

**مخالفات ظهرت وأُصلحت:**
- `apps/studio/src/ui/AppShell.tsx:39` و `AuthCard.tsx:49` كلاهما
  يحمل حرفية `"Media Kit"` كنصّ JSX. **الادعاء في تقرير S2 (L-22
  على الواجهة) كان أوسع من الواقع** — بلا هذا الفحص كانت ستُنسى.
  الحلّ: إضافة مفتاح `brand.name = "Media Kit"` في القواميس الثلاثة
  واستبدال الحرفيتين بـ`{t('brand.name')}`.

**قرار عزل الأرقام (§4 من التذكرة):**
- `DigitStyle` = زينة واجهة (جداول · أحجام · تواريخ · لوحة). تفضيل
  الموظف، لا هوية العميل.
- `brand.bidi.numerals` وحده يحكم كل ما يُرسم على Canvas.
- **السبب (القاعدة الثالثة):** صفر قيم مثبتة للهوية. الهوية مصدر
  الحقيقة الوحيد للمخرَج. قيمة تصل من `localStorage` إلى Canvas
  تكسر مبدأ المحرك.
- **الخطر:** لا يظهر كخطأ — المعاينة تبدو سليمة عند الموظف وتختلف
  عن مخرَج الخادم. مصري يفضّل 123 يرى هويّة خليج تطبع ١٢٣.

**نقل اللقطات:** 14 ملفاً من `apps/studio/screenshots/` إلى
`demo/studio/`. المجلد القديم غير موجود. `demo/README.md` يحمل قسماً
جديداً يوثّق كل لقطة وما تُظهره، مع سطر خاص بعيّنة L-23 counter-example
في المعرض — العيب معروضاً بجوار حلّه.

**بوابات:** G-S4.5-1..4 تمرّ · G-S4.5-5 `pnpm --filter=@pf-mediakit/studio
typecheck` أخضر (root `pnpm typecheck` يفشل على `packages/tts` — خارج
النطاق، مقفَل على main).

## S2-X — استخراج packages/ui و packages/i18n ✅

**التسليم (2026-09-05):** التحفّظ المعلَن في S2 عُولج. الذرّات الإحدى
عشرة (Alert · Badge · Button · Card · Dialog · EmptyState · Field ·
Input · PageHeader · Table · Textarea) في `packages/ui/`. الـi18n
(LocaleProvider · LocaleSwitcher · Ltr + قواميس ar/mixed/en) في
`packages/i18n/`. القشور الثلاث (AppShell · AuthShell · AuthCard)
تبقى في `apps/studio/src/ui/` لأنها تحمل اعتماد `next/link` و
`usePathname` — لا داعي لحقن تنقّل عبر props.

**§0 divergence check (شرط أساسي قبل النقل):**
- `LocaleProvider.tsx` بين apps/dashboard و apps/studio: تعليقات
  مختلفة + مفتاح تخزين `pfmk.{dashboard|studio}.locale` (متوقّع بـL-49
  — لكل موظف/تطبيق مفتاح).
- `LocaleSwitcher.tsx`: dashboard يستعمل ألواناً hard-coded
  (`text-white/40`)، studio يستعمل tokens (`text-fg-subtle`).
- `Ltr.tsx`: تعليقات فقط، السلوك متطابق.
- **الحكم:** تباعد صغير. سلوك متطابق. تعارض حقيقي واحد فقط
  (LocaleSwitcher الألوان) يُحسم لصالح tokens. dashboard لا يُهاجَر
  هنا (ادعاء ثابت في §5 من التذكرة) — نسخته تبقى بلا تغيير حتى
  تذكرة الهجرة بعد S7.

**التغييرات:**
- إنشاء `packages/i18n` + `packages/ui` بنموذج `packages/engine`
  (`main`/`types` إلى `src/index.ts`، بلا build step).
- `packages/ui` يعتمد `packages/i18n` بـ`workspace:*`.
- `apps/studio` يعتمد الاثنتين، `tsconfig.paths` يوجّه اسم الحزمة
  إلى مصادر الحزم مباشرةً (نمط pnpm workspace TypeScript).
- **Tailwind preset مشترك:** `packages/ui/tailwind-preset.ts` يحمل
  الألوان الاثنتَي عشرة والخطوط والحواف والظلال. `apps/studio/
  tailwind.config.ts` يستورده كـ`presets: [preset]` ويوسّع `content`
  إلى مسارَي الحزمتين (وإلا Tailwind يُقلّم الأصناف — أخطر نقطة).
- **CSS tokens مشتركة:** `packages/ui/styles/tokens.css` يحمل كتلة
  `:root` وحدها؛ `apps/studio/app/globals.css` يستوردها قبل
  `@tailwind base;`.
- **تحديث الاستيرادات:** كل `from '@/src/i18n/...'` صار
  `from '@pf-mediakit/i18n'`، وكل `from '@/src/ui/{atom}'` صار
  `from '@pf-mediakit/ui'`. القشور الباقية (AppShell/AuthCard/
  AuthShell) تستورد `@pf-mediakit/ui` للذرّات التي تحتاجها.

**اللوحة لم تُهاجَر (§5 من التذكرة):**
- `apps/dashboard` يبقى كما هو، لا يعتمد الحزمتين.
- **التباعد البصري بين اللوحة والاستوديو قائم.** اللوحة تحمل نظام
  tokens أقلّ نضجاً (لا `--surface`, `--accent`). الاستخراج **أنشأ
  الحدّ**، ولم يُنهِ التباعد. الهجرة تذكرة مستقلة بعد S7.

**تحديث الفحوص الأربعة:**
- نطاق كل فحص وُسِّع إلى `apps/studio/src` + `packages/ui/src` +
  `packages/i18n/src` — بلا استثناء يُترك بلا حماية بعد النقل (L-46).
- **حراسة الإبطال:** كل فحص يُعلن عدد الملفات لكل نطاق ويفشل إن كان
  نطاق فارغاً (تحت `CHECK_SCOPE=empty` يفشل بوضوح). يمنع مسحاً على
  مجلد غير موجود يمرّ خضراء صامتاً.
- `check-locale-parity` يتبع القواميس إلى `packages/i18n/src`.
- `check-digit-style-isolation` يمسح كل الجذور الثلاثة + يفشل إن
  كان نطاق (أ) API فارغاً (الحارس العامل الفعلي).

**بوابات:** G-X-1 typecheck أخضر · G-X-2 الأربعة تمرّ بعدّ ملفات
> 0 · G-X-3 كلها تفشل على نطاق فارغ · G-X-4 `/design` مرسوم بأنماطه
(`demo/studio/design-ar-post-extract.png` يماثل `demo/studio/design-ar.png`)
· G-X-5 `apps/studio/src/ui/` تحوي القشور الثلاث فقط · G-X-6 `grep
"from 'next/" packages/ui` = 0 · G-X-7 diff داخل النطاق · G-X-8
`'use client'` باقٍ في 12 ملفاً.

## S5 — صفحات المصادقة ✅  ·  على mocks حتى A6-A8

**التسليم (2026-09-05):** الصفحات الأربع (`login` · `signup` ·
`forgot-password` · `reset-password`) مبنيّة على `packages/ui` +
`packages/i18n`، تدير حالة الإدخال محلياً، تتحقّق من المدخلات في
المتصفح قبل الشبكة، وتستدعي طبقة `src/api/endpoints/auth.ts` القائمة
منذ S1. الطبقة تمرّ عبر مُبدِّل `NEXT_PUBLIC_API_MOCK` — إن `=true`
تروي `src/api/mock.ts` بدل `fetch`. عند فتح SYNC-α: احذف المتغيّر،
لا تعديل صفحة.

**AuthCard الآن ذكيّ:**
- `onSubmit` من الصفحة، `successKey` للحالات بلا تحويل (forgot).
- حالات داخلية: `values` (uncontrolled بأي شكل)، `errors` لكل حقل،
  `topErrorKey` للخطأ العام، `loading` يعطّل النموذج والزرّ.
- تحقّق مسبق: `emailFormat` regex بسيط · `minLength` (12 لكلمة السر)
  · `required` بمفاتيح دلالية (`errors.INVALID_EMAIL`, …).
- `ApiError` تُترجم بمفتاح الرسالة. إن كان `field` مطابقاً لحقل معلوم،
  يُعرض تحته؛ وإلا في شريط `Alert kind="danger"` أعلى النموذج.

**طبقة mock (`src/api/mock.ts`):**
- تحاكي docs/16 §1.4 حرفياً — `code`/`field`/`message`/`requestId`.
- كل رمز خطأ من docs/16 §2 مغطّى بمُشغِّل نصّي معلَن (تعليق رأسي في
  الملف): `email=throttle@x.com` → 429، `password!=='letmein12345'`
  → 401، `email مشوَّه` → 400 INVALID_EMAIL، إلخ.
- تأخير 200ms لمحاكاة زمن الشبكة كي تُرى حالة `loading`.

**مفاتيح i18n جديدة (متطابقة عبر ar/mixed/en):**
- `errors.{INVALID_EMAIL, PASSWORD_TOO_WEAK, TENANT_NAME_EMPTY,
  FIELD_REQUIRED, EMAIL_TAKEN, INVALID_CREDENTIALS, ACCOUNT_SUSPENDED,
  INVALID_RESET_TOKEN, TOKEN_EXPIRED, RATE_LIMITED, NOT_FOUND}`.
- `auth.forgot.sent` — الرسالة الوحيدة عند 204 من forgot-password.

**اللقطات في `demo/studio/`:**
- 12 صفحة أساسية: `s5-{login,signup,forgot-password,reset-password}
  -{ar,mixed,en}.png`.
- 1 حالة خطأ: `s5-login-ar-error-401.png` — يُظهر شريط أحمر أعلى
  النموذج بنصّ «بريد أو كلمة سر خاطئة.» مفكوكاً من
  `error.code=INVALID_CREDENTIALS`.

**بوابات:** G-S5-1 typecheck أخضر · G-S5-2 الفحوص الأربعة تمرّ
بعدد ملفات > 0 · G-S5-3 12 لقطة أساسية · G-S5-4 لقطة خطأ مفكوكة
· G-S5-5 صفر استدعاء لأي endpoint حقيقي (كل نداء عبر `auth.*` الذي
يمرّ عبر `handleMock` حين `NEXT_PUBLIC_API_MOCK=true`) · G-S5-6 diff
داخل النطاق.

**SYNC-α لم تُفتح:** يحتاج `curl` فعلياً من مسار A مقابل
19040-19042. S6 و S7 مؤجّلتان حتى حينها.
