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

## S6 · S7 — ربط حقيقي + تخطيط رئيسي 🟡 (جزئي — divergences تُعلَن)

**التسليم (2026-09-05 · بعد فتح SYNC-α من قِبَل مسار A · `7ebf19c`):**
- `NEXT_PUBLIC_API_MOCK=false` + `NEXT_PUBLIC_API_URL=http://127.0.0.1:19040`
  في `apps/studio/.env.local` (غير مُتَتبَّع).
- المبدِّل يبقى — `NEXT_PUBLIC_API_MOCK=true` يعيد الـmock بلا تعديل صفحة.
- `setSessionInfo(user, tenant)` عند login/signup الناجح يخزّن الجلسة.
- `AppShell` (S7): يعرض `tenant.name` في الرأس + `user.email` في قائمة
  الحساب + زرّ «تسجيل الخروج». يستدعي `GET /v1/tenant` عند mount
  للتحقّق ولتحديث المعلومات؛ 401 → مسح جلسة → تحويل إلى `/login`.

**§0 — الفرق بين mock وmk-api الحقيقي (يُعلَن، لا يُصلَح في هذه
التذكرة — قرار حسم مشترك):**

| موقف | mk-api الحقيقي (19040) | mock (S5) | الأثر |
|---|---|---|---|
| كلمة سرّ خاطئة | 401 `INVALID_CREDENTIALS` field=null | 401 `INVALID_CREDENTIALS` field=null | ✓ متطابق |
| حقل ناقص | 400 `VALIDATION_FAILED` field=`password` | 400 `PASSWORD_TOO_WEAK` field=`password` | **يختلف رمز الخطأ** |
| اسم مستأجر ناقص | 400 `VALIDATION_FAILED` field=`tenantName` | 400 `TENANT_NAME_EMPTY` field=`tenantName` | **يختلف** |
| بريد مشوَّه | 400 `EMAIL_INVALID` field=`email` | 400 `INVALID_EMAIL` field=`email` | **قلب ترتيب الكلمتين** |
| forgot-password | 204 (بلا body) | 204 | ✓ متطابق |

**Divergences إضافية اكتُشفت أثناء الربط (تُعلَن معاً):**

3. **`POST /v1/auth/refresh` response shape:**
   mk-api يعيد `{ session: { accessToken, refreshToken, expiresIn } }`.
   docs/16 §2.3 وclient.ts يتوقّعان `{ accessToken, refreshToken,
   expiresIn }` بلا wrapper `session`. **الأثر:** auto-refresh
   يفشل صامتاً — client.ts يقرأ `body.accessToken` كـundefined،
   يكتبه في localStorage، ثم retry فاشل → مسح جلسة → تحويل login.

4. **`POST /v1/auth/login` response `user` جزئي:**
   يعيد `{ id, role }` فقط. docs/16 §2.2 يعد بـ`email`, `createdAt`
   أيضاً. **الأثر:** AppShell يعرض placeholder «الحساب» بدل بريد
   المستخدم.

5. **`POST /v1/auth/login` response `tenant` جزئي:**
   يعيد `{ id }` فقط. docs/16 §2.2 يعد بـ`name`, `plan`, `locale`,
   `createdAt`, `seats`. **الأثر:** الشاشة الأولى تظهر بلا اسم
   مستأجر ~200ms حتى ينتهي `GET /v1/tenant` من AppShell mount (الذي
   يعيد الشكل الكامل صحيحاً).

6. **`error.message` = code خام، لا مفتاح i18n:**
   docs/16 §1.4 يقول «`message` مفتاح i18n لا نصّ (L-22)». mk-api
   يعيد `message: "INVALID_CREDENTIALS"` (نفس code). لا كلمة
   `errors.` قبله. **الأثر:** `t('INVALID_CREDENTIALS')` لا يجد
   المفتاح → يعيد الاسم الخام. البانر الأحمر يعرض
   `INVALID_CREDENTIALS` بدل «بريد أو كلمة سر خاطئة.».

**لقطات دليلية في `demo/studio/`:**
- `s6-login-real-success.png` — نجاح حقيقي. الرأس يعرض
  `Studio Demo Agency` (اسم المستأجر من `GET /v1/tenant`)، البند
  النشط «المشاريع»، زرّ «تسجيل الخروج».
- `s6-login-real-401.png` — كلمة سر خاطئة على 19040. البانر الأحمر
  يعرض `INVALID_CREDENTIALS` **خام** (divergence #6 — L-22 مكسور من
  الخادم).
- `s6-refresh-evidence.png` — بعد إفساد access token وإعادة التحميل،
  المستخدم على `/login`. **G-S6-5 يفشل** لأن divergence #3 يكسر
  refresh flow في client.ts.

**بوابات:** G-S6-1 typecheck ✓ · G-S6-2 الفحوص الأربعة ✓ ·
G-S6-3 login حقيقي مع اسم مستأجر ظاهر ✓ · G-S6-4 حالة خطأ حقيقية
✓ لكن **رمز خام لا رسالة مترجمة** (divergence #6) · **G-S6-5 يفشل**
(divergence #3) · G-S6-6 المبدِّل قائم — S5 lقطات تُثبت وضع mock ·
G-S6-7 diff داخل النطاق ✓.

**قرار مؤجَّل:** الخيارات الحاسمة:
- **A** — mk-api يصحّح divergences 3-6 (يعيد `session: {…}` من
  refresh، يُثري user+tenant في login، يستعمل `errors.{CODE}` في
  message، يوحّد رموز validation).
- **B** — mk-studio يعدّل client.ts + i18n dictionaries + AppShell
  ليتوافق مع الشكل الحالي.
- **C** — كلاهما (docs/16 يُحدَّث ليطابق الواقع الجديد).

## S6-FIX — محاذاة الـmock وإعادة اختبار التجديد ✅

**التسليم (2026-09-05 · بعد A8-FIX من مسار A · `410cc33`):** mk-api
صحّح 4 من 6 divergences (رقم 3، 5 جزئياً، 6). محاذاة الـmock هنا
لتطابق الأسماء الحقيقية، إعادة اختبار refresh flow (سقط سابقاً)،
تغطية القواميس لكل رمز.

**تحقّق §0:**
- `POST /v1/auth/refresh` صار مفروشاً: `{accessToken, refreshToken,
  expiresIn}` بلا `session:` — يطابق docs/16 §2.3 وتوقّع client.ts.
- `POST /v1/auth/login` `tenant` صار كاملاً: `{id, name, plan}`.
- `error.message` صار مفتاح i18n كاملاً: `errors.INVALID_CREDENTIALS`
  بدل `INVALID_CREDENTIALS` الخام.
- `POST /v1/auth/login` `user` = `{id, role}` فقط (لا email). **الفرق
  مع signup مقصود في العقد — signup يعيد `{id, email, role}` لأن
  المستخدم أنشأ الحساب لتوّه ويحتاج التأكيد.** لا يُعامَل انحرافاً.

**محاذاة الـmock:**
- `src/api/mock.ts` مُعاد كتابته بأسماء mk-api الحرفية (32 رمزاً في
  `apps/api/src/errors.ts`):
  - `INVALID_EMAIL` → `EMAIL_INVALID`
  - `ACCOUNT_SUSPENDED` → `ACCOUNT_DISABLED`
  - `INVALID_RESET_TOKEN` → `RESET_TOKEN_INVALID` (+ إضافة
    `RESET_TOKEN_EXPIRED`, `RESET_TOKEN_USED`)
  - `RATE_LIMITED` → `TOO_MANY_ATTEMPTS`
  - `TOKEN_EXPIRED` احتفظ (mk-api يستعمله للـaccess token المنتهي).
  - إضافة `POST /v1/auth/refresh` mock (شكل مفروش).
  - إضافة `DELETE /v1/auth/logout` mock (204).
- `mock.err()` يبني `messageKey = 'errors.${code}'` تلقائياً —
  يبرهن أن أيّ كود جديد يُترجم بلا نسيان بادئة.
- `AuthCard.clientValidate` كذلك — استعمال `EMAIL_INVALID` و
  `VALIDATION_FAILED` بدل الأسماء القديمة.

**تغطية القواميس (G-S6-9):**
- `scripts/mk-api-error-codes.json` مرآة يدوية معلَنة لـ32 رمزاً من
  mk-api + 3 UI-only fallback (`UNKNOWN`, `UNAUTHENTICATED`,
  `NETWORK_ERROR`). **31 رمزاً بحسب العدّ الفعلي من التذكرة، لا 32
  المذكورة في الملخص** — انحراف صغير معلَن.
- `scripts/check-error-code-coverage.mjs` (فحص جديد، مربوط في
  `package.json → test`): كل رمز mk-api يجب أن يحمل مفتاحاً
  `errors.<CODE>` في القواميس الثلاثة، ولا زوائد. اختيار الفحص
  الآلي على المراجعة اليدوية معلَن — سيلتقط أيّ انحراف مستقبلي
  ثانية.
- كل الثلاث دكاشن الآن يحمل 34 مفتاحاً في `errors.*` (31 mk-api +
  3 UI-only).

**سلسلة البادئة (لا double-prefix):**
- `errors.ts:98`: `messageKey: e.message` — نسخ حرفي، لا إضافة.
- `AuthCard:119`: `setTopErrorKey(err.messageKey)` — تمرير حرفي.
- `Alert`: `t(titleKey)` — بحث مباشر.
- **الخادم يرسل `errors.INVALID_CREDENTIALS`**، الواجهة تبحثه كما هو،
  القاموس يعيد النصّ المترجم. صفر تعديل على المفتاح في الطريق.

**AppShell (G-S6-10):**
- `useEffect` بعد S6-FIX: قراءة session من localStorage فقط. لا
  `GET /v1/tenant` عند mount (كان يعوّض نقص المعلومات في login
  response الأصلي — بعد A8-FIX لم يعد لازماً).
- grep على `tenants` في `AppShell.tsx`: مطابقة واحدة في **تعليق**
  يفسّر الحذف. لا استيراد ولا استدعاء.

**اختبار refresh (G-S6-5 المُعاد):**
- CDP flow: login → corrupt access token → استدعاء
  `GET /v1/tenant` مع bearer فاسد.
- **sequence مُثبَت من mk-api log:**
  ```
  POST /v1/auth/login       200
  GET  /v1/tenant           401  (bearer فاسد)
  POST /v1/auth/refresh     200  (شكل مفروش)
  GET  /v1/tenant           200  (bearer جديد)
  ```
- CDP eval نتيجة: `{initial401: 401, refresh: 200, newAccessOk: true,
  retryStatus: 200, passed: true}`.
- لقطة `s6fix-refresh-evidence.png` تُظهر المستخدم على `/projects`
  بعد إعادة التحميل — لم يُرمَ إلى `/login`.

**اللقطات الجديدة:**
- `s6fix-login-real-401-translated.png` — banner أحمر بنصّ عربي
  «بريد أو كلمة سر خاطئة.» (مترجَم لا خام). G-S6-8 ✓.
- `s6fix-login-real-success.png` — `Studio Demo Agency` في الرأس
  فوراً من login response (لا GET /v1/tenant تكميلي).
- `s6fix-refresh-evidence.png` — post-refresh، المستخدم على /projects.

**بوابات:** G-S6-1 typecheck ✓ · G-S6-2 الفحوص الأربعة + الخامس
الجديد ✓ · G-S6-5 refresh يعمل (log + CDP) ✓ · G-S6-8 401 مترجَم ✓ ·
G-S6-9 تغطية 31 رمزاً ✓ · G-S6-10 AppShell بلا tenants.get ✓ ·
G-S6-6 المبدِّل قائم ✓ · G-S6-7 diff داخل النطاق ✓.

**انحراف جديد ظهر:** التذكرة تقول «32 رمزاً» في الملخص، لكن
enumeration فيها يعدّ 31 (Auth 12 + Rate 1 + Tenants 1 + Brand Kits 12
+ Generic 5 = 31). المرآة أخذت العدد المحسوب من enumeration، لا
الملخص. إن كان mk-api يحمل 32 فعلاً، الفحص سيلتقط الناقص عند أول
تحديث.

## S6-SYNC — مرآة تُقاس، لا تُنسخ ✅

**التسليم (2026-09-05 · مقابل A10 على mk-api · `c11371a`):** المرآة
كُبرت إلى **37 رمزاً** بعد Users، والفحص وُسِّع ليُطابقها بـmk-api
مباشرةً كي لا تتقادم صامتةً (L-63).

**التصحيح الأصلي:** عدّي في S6-FIX كان 32 وهو **31**. الآن المرآة
تحمل العدد الفعلي المُقاس من `errors.ts` — لا اعتماد على enumeration
يدوي.

**الستة الجديدة (Users · A10):**
- `USER_ALREADY_MEMBER` 409 field=`email`
- `PENDING_INVITE_EXISTS` 409 field=`email`
- `SEATS_EXHAUSTED` 422 — **معلَن، غير مُنفَّذ حتى A21**
- `LAST_OWNER` 409
- `REASON_TOO_SHORT` 400 field=`reason`
- `ACCOUNT_SUSPENDED` 403 — **معلَن، غير مُنفَّذ حتى A21**

الأخيران مُعلَّمان في `mk-api-error-codes.json → deferred` — الترجمات
جاهزة، الـendpoint يأتي في A21.

**الفحص الموسَّع — حلقتان مغلقتان:**

*(1) المرآة ↔ mk-api:* `git show origin/feat/api:apps/api/src/errors.ts`
يُستخرج، regex `^\s*\|\s*'([A-Z][A-Z_]*)'` يقتنص كل رمز من نوع
`ErrorCode` union، ثم يُقارَن بمجموعة المرآة. رمز على mk-api غائب من
المرآة ⇒ فشل؛ العكس ⇒ فشل. **إن تعذّرت قراءة الفرع (غير مجلوب،
حذف ملف)** الفحص يسقط بخطأ مسمّى مع تلميحات، لا يمرّ صامتاً.

*(2) المرآة ↔ القواميس:* كل رمز في المرآة يجب أن يحمل مفتاحاً
`errors.<CODE>` في القواميس الثلاثة، ولا زوائد باستثناء
`clientOnlyCodes` (UNKNOWN, UNAUTHENTICATED, NETWORK_ERROR).

**بوابات:**
- **G-S6-11:** المرآة 37 رمز، مطابقة لـ`errors.ts` على `origin/feat/api`. ✓
- **G-S6-12:** القواميس الثلاث بـ40 مفتاح `errors.*` كلٌّ (37 + 3
  UI-only) — صفر ناقص، صفر زائد. ✓
- **G-S6-13:** إضافة `PHANTOM_CODE_NOT_ON_MKAPI` للمرآة → الفحص
  يفشل بـ`رمز في المرآة لا يوجد على mk-api: PHANTOM…`. exit=1 ✓
- **G-S6-14:** حذف `USER_ALREADY_MEMBER` من المرآة → الفحص يفشل
  بـ`رمز على mk-api غائب من المرآة: USER_ALREADY_MEMBER`. exit=1 ✓
- **G-S6-15:** typecheck + الفحوص الأربعة تمرّ. ✓
- **G-S6-16:** diff داخل النطاق (packages/i18n + scripts). ✓

**نتيجة:** المرآة لا تعود مصدر حقيقة مستقلّاً — صارت نتيجة مقاسة.
أيّ رمز يُضاف/يُحذف على mk-api يظهر عند أوّل `pnpm test`. `git fetch
origin feat/api` قبل التشغيل شرط عملي (يُذكر في رسالة الخطأ عند
غياب المرجع).

## S8 — منتقي الأصول 🟡 (جزئي · divergences تُعلَن)

**التسليم (2026-09-06 · مقابل A11 + A11-STORAGE على mk-api ·
`c752b23`):**

- `packages/i18n` كُبرت للأكواد الأحد عشر الجديدة من A11 (المرآة
  38 → 48 مطابقة لـerrors.ts على mk-api).
- `apps/studio/src/api/uploader.ts` — وحدة رفع مفصولة عن client.ts:
  PUT مباشر إلى signed URL بلا Bearer، بلا refresh، XHR لدعم
  onprogress. تفشل بأكواد مُعلَنة (`SIZE_TOO_LARGE`, `URL_EXPIRED`,
  `NETWORK_ERROR`, `UPLOAD_FAILED`, `UPLOAD_ABORTED`) بدل رسائل خام.
  Client-side size check قبل بدء الرفع.
- `apps/studio/app/(app)/assets/page.tsx` — منتقي كامل: رفع بحالة
  تقدّم، تبويبات فلترة `filter[kind]`، جدول، حذف بحوار تأكيد،
  إقرار SVG-with-text.
- `src/api/endpoints/assets.ts` أُعيد تشكيله للعقد الحالي.
- `src/api/mock.ts` امتدّ ليحاكي 6 نقاط `/v1/assets/*` بمخزن
  in-memory، مع مُشغِّلات نصّية للأخطاء وتحذير SVG.

**تحقّق §0 (مقابل mk-api الحقيقي — إعلان بلا إصلاح):**

Divergences جديدة بين docs/16 §9 والسلوك الفعلي:

7. **`GET /v1/assets` response شكل:** يعيد `{items, nextCursor}`.
   docs/16 §1.5 (نمط pagination الموحّد) و client.ts's `requestPage`
   يتوقّعان `{data, nextCursor, hasMore}`. **الأثر:** UI لا يعرض
   القائمة (page.data undefined → TypeError → banner NETWORK_ERROR).
   الرفع يعمل بالكامل خادم-جانب (curl يؤكّد 2 assets في القاعدة
   ومك-api log يُظهر sequence كامل)، فقط عرض القائمة معطَّل.

8. **Asset row shape:** الحقول الحقيقية `sizeBytes, contentType,
   updatedAt, finalizedAt, faces, warnings` (بعضها ليس في docs/16
   §9.2). `warnings: null` بدل `undefined` عند غياب التحذيرات.

**اللقطات الأربع في `demo/studio/`:**

- `s8-upload-real-success.png` — بعد رفع `demo-avatar.png` (4 KB
  PNG) عبر real mk-api + MinIO. الرفع نجح (mk-api log يؤكّد
  `POST /v1/assets/upload-url` 200 · `POST /v1/assets/:id/finalize`
  200، ووجود الأصل في قاعدة البيانات بـcurl). لكن UI لا يعرضه في
  الجدول بسبب divergence #7 — البانر الأحمر يعرض «تعذّر الوصول
  إلى الخدمة» مترجم من client-side TypeError. **جزئي.**
- `s8-svg-warning.png` — الرفع لملف `text-in-svg.svg` (75 B، SVG
  بنصّ). mk-api يعيد 400 `INVALID_SVG_WITH_TEXT_WARNING`. UI يعرض
  تنبيه أصفر بعنوان «تحذير SVG» ونصّ توضيحي عربي كامل + زرّ «أقرّ
  وأكمل» ذهبي. **G-S8-4 ✓ نظيف.**
- `s8-svg-warning-acknowledged.png` — بعد الضغط على «أقرّ وأكمل»،
  UI أعاد `finalize` بـ`acknowledgedWarnings: ['SVG_HAS_TEXT']`،
  الخادم عاد 200، النموذج فُرّغ. البانر السفلي هو نفس list-error
  من divergence #7.
- `s8-size-too-large.png` — رفع `huge.png` بحجم 501 MB. mk-api يعيد
  413 `SIZE_TOO_LARGE` من `/v1/assets/upload-url`. UI يعرض «الملف
  أكبر من الحدّ المسموح.» **مترجَم لا خام. G-S8-5 ✓ نظيف.**

**بوابات:**
- **G-S8-1** typecheck ✓
- **G-S8-2** الفحوص الخمسة ✓ (بما فيها error-code-coverage بعد
  إضافة الأحد عشر — الحارس L-63 عمل قبل أيّ ربط)
- **G-S8-3** رفع حقيقي: **جزئي** — العملية تنجح خادم-جانب
  (evidence: mk-api log + curl على /v1/assets يعرض الأصلين)،
  لكن UI list معطَّل بـdivergence #7. `s8-upload-real-success.png`
  يوثّق الحال.
- **G-S8-4** SVG warning ✓ نظيف
- **G-S8-5** خطأ حقيقي (SIZE_TOO_LARGE) مترجَم ✓ نظيف
- **G-S8-6** المبدِّل قائم — mock/real
- **G-S8-7** diff داخل النطاق ✓

**قرار مؤجَّل:** divergence #7 (list response shape) يحتاج
- **A** — mk-api يعيد `{data, nextCursor, hasMore}` (يطابق §1.5)، أو
- **B** — mk-studio يعدّل `requestPage` ليقبل `items` كبديل، أو
- **C** — docs/16 §9.3 يوثّق شكل `items` كاستثناء موصوف.

**SYNC-β لم تفتح:** S9 · S10 (Brand Kits) · S11 (Templates) محجوبة
على A12 + A13. A13 لم تبدأ.

## S9+S10+S11 — الهويات والقوالب ✅

**التسليم (2026-09-06 · مقابل A13 + A14 على mk-api · `7806f46`):**
تسليم موحّد لأن الشاشات تتشارك نمطاً واحداً. المرآة نمت من 51 إلى
**59 رمزاً** (A13: 3 · A14: 8 — أُضيفا مسبقاً رغم أنّ S12 محجوبة،
احتراماً لضمان L-63 غير المشروط).

**تحديث الديون السابقة:** mk-api اختار **A** في `58e4483` (A11-SHAPE).
`GET /v1/assets` صار `{data, nextCursor, hasMore}` — divergences #7
· #8 من S8 مغلقان. كودي في `/assets` يعمل بلا تعديل.

**§0 verify — الأشكال المُثبَتة من fetch حقيقي:**
- `GET /v1/templates` → `{data, nextCursor, hasMore}` · 6 قوالب عامة
  بأسماء عربية (بسيط · بطاقة ذات كيكر · بطاقة سفلية · بطاقة متمركزة ·
  بطاقة عاجل · ريلز).
- `POST /v1/brand-kits` → 201 `{id, name, config, createdAt, updatedAt}`.
- `POST /:id/fonts/:family/ack` → 200 `{fonts: {primary: {...}}}` جزء لا
  كامل — دمج محلي بدل استبدال (ملاحظة العقد).
- `POST /:id/assets-version` → 200 `{assets: {version, autoUpdate}}` جزء.
  409 `DIFF_NOT_ACKNOWLEDGED` بلا `acknowledgedDiff`.

**S11 — القوالب (`/templates`):**
- قائمة مع `filter[scope]` و `filter[kind]` (أزرار تبويب).
- **شارة «للقراءة فقط»** بجوار كل قالب عام — تظهر قبل أي محاولة (لا
  بعد 403 GLOBAL_TEMPLATE_READONLY الذي يبقى معالَجاً احتياطاً).
- **زرّ «نسخ»** على كل قالب — GET :id + POST / بالتعريف. اللاحقة
  « — نسخة » من i18n.
- **زرّ «حذف»** يظهر فقط على `scope=tenant` — 409 TEMPLATE_IN_USE
  يعرض رسالة مترجَمة.

**S9 — الهويات (`/brand-kits`):**
- قائمة تعرض: الاسم، الخط الأساسي (font family + badge builtin/custom)،
  إصدار الأصول، ثلاثة إجراءات (إقرار خط · ترقية إصدار · حذف).
- **إقرار الخط:** حوار بحقل family + notes + checkbox. إن `licenseAck=false`
  → mk-api يعيد 422 قبل أي تحقّق آخر، الواجهة تعرض «يجب الإقرار
  بالترخيص لإتمام الإجراء.». عند النجاح، تعرض جدول read-only
  `ackBy: {userId}` و `ackAt: {ISO}` — لا تحرير (§4.ب).
- **الاستجابة الجزئية معالَجة:** الدمج المحلي مع الحالة المخزَّنة بدل
  استبدال كامل.

**S10 — إصدار الأصول (كخطوة تدفّق لا فشل):**
- الحوار يعرض `الإصدار الحالي` + حقل `الإصدار الجديد` (YYYY.MM) +
  زرّ «ترقية الآن».
- **الضغط الأوّل يرسل `acknowledgedDiff: false` عمداً** → 409 يعود
  → catch يكشف `err.code === 'DIFF_NOT_ACKNOWLEDGED'` → يبدّل الحالة
  إلى step=`diff` → يعرض تنبيه أصفر «الفرق» + placeholder + checkbox.
- الضغط الثاني بعد التحقّق يرسل `acknowledgedDiff: true` → 200.
- **409 ليس رسالة خطأ للمستخدم** بل خطوة تصميم في الـUI (كنمط SVG
  warning في S8).

**البنود الثلاثة المعروفة (§4 من التذكرة):**
- **(أ) DEFAULT_BRAND fallback:** قراءة `config` قد تعطي حقولاً
  undefined. `extractFontSummary` يستعمل optional chaining و «—»
  بديلاً في كل عمود.
- **(ب) `ackBy`/`ackAt` قابلان للتعديل عبر PATCH:** الواجهة تعرضهما
  في مربع أخضر للقراءة، ولا تتيح تحريرهما.
- **(ج) `warnings` يُحذف عند غيابه:** كود S8's `/assets` يتحقّق
  `err.code` لا `warnings` field من finalize الناجحة — لا تعديل مطلوب.

**اللقطات في `demo/studio/`:**
- `s9-11-templates-list.png` — 6 قوالب عامة بأسماء عربية + شارات
  «للقراءة فقط» (G-S9-3 + G-S9-5).
- `s9-11-templates-global-readonly.png` — filter=عام يبرز الشارات.
- `s9-11-templates-duplicate-visible.png` — «بسيط — إثبات بوابة
  المرحلة 2 — نسخة» ظاهر في filter=خاص بشارة خضراء + زرَّي
  نسخ/حذف (G-S9-4).
- `s9-fontack-422.png` — checkbox غير مؤشَّر → banner أحمر «يجب
  الإقرار بالترخيص لإتمام الإجراء.» (G-S9-7).
- `s9-fontack-success.png` — بعد التحقّق، مربع أخضر يعرض
  `أقرّ بواسطة: {userId}` و `تاريخ الإقرار: {ISO}` (G-S9-6).
- `s10-version-diff-step.png` — بعد ضغط أوّل، تنبيه أصفر «الفرق»
  + checkbox (G-S9-8 · G-S9-9).
- `s10-version-success.png` — بعد ack، الحوار أُغلق وعمود «إصدار
  الأصول» يعرض `2026.06` (G-S9-8).

**أداة CDP:** `puppeteer-core@23` أُضيف كـdevDep على مستوى workspace
لتشغيل flows حقيقية. الحاجة نشأت في S9: التدفّقات هنا أطول من S6/S8،
و`--experimental-websocket` في Node 20 أخفق بـ`Object reference chain
too long` على استجابات Chrome-152. puppeteer-core لا يُبنى في studio
ولا يُشغَّل في الإنتاج — أداة اختبار فقط.

**بوابات:**
- **G-S9-1** typecheck ✓
- **G-S9-2** الفحوص الخمسة ✓ · error-code-coverage 59/59 مطابقة
- **G-S9-3** ✓ · **G-S9-4** ✓ · **G-S9-5** ✓ · **G-S9-6** ✓ ·
  **G-S9-7** ✓ · **G-S9-8** ✓ · **G-S9-9** ✓
- **G-S9-10** المبدِّل قائم — mock يحمل mocks كاملة لـtemplates +
  brand-kits بنفس أشكال العقد (بدائل uploader mock معدَّة).
- **G-S9-11** ✓ diff داخل النطاق (packages/i18n · scripts · apps/studio ·
  demo/studio · pnpm-lock.yaml + package.json لإضافة puppeteer-core)

**SYNC-γ لم تفتح:** S12 (Projects) محجوبة بحكم هذه التذكرة — A14
مبنيّة لكن لم يُطلب تسليم واجهة.

---

## S12 · S13 — المشاريع + المحرّر + المراجعات + التصدير ✅ (على mocks — SYNC-δ لم تفتح)

**السياق العقدي:** `docs/17` §S12 · §S13 مقابل `docs/16` §7 (Projects)
· §8 (Renders) · §10 (Revisions) · §11 (Workflows/State/Transitions)
· §12 (Concurrency + If-Match).

**قناة الخادم:** mk-api لم يبنِ §7/§8/§10/§11 بعد (SYNC-δ لم تفتح).
كل شيء هنا مبنيّ على mock يُطابق شكل العقد **حرفياً**. حين تُبنى
هذه الـendpoints في mk-api، تبديل `NEXT_PUBLIC_API_MOCK=true` إلى
`false` كافٍ — بلا تعديل صفحة.

### قرار الحماية L-63 (SYNC-γ)

- المرآة: 78 → **81 رمزاً** (`086e182`).
- الأكواد المضافة: `REVISION_NOT_FOUND` · `RESTORE_WOULD_BREAK_REFERENCES`
  · `IF_MATCH_REQUIRED`.
- ثلاثتها معالَجة في القواميس الثلاث (`ar/mixed/en`) + معالَجة صريحاً
  في مسارات UI (STALE_UPDATE + IF_MATCH_REQUIRED في محرّر المشروع،
  RESTORE_WOULD_BREAK_REFERENCES في حوار الاستعادة).

### إعلان نطاق S13 (المعاينة الحيّة) — **مؤجَّلة خارج هذه التذكرة**

`docs/17` §S13 يطلب معاينة حيّة في المتصفح تستدعي `renderFrame` من
`packages/engine`. **مؤجَّلة عمداً** ولم تدخل نطاق هذا التسليم.

**السبب المكتوب (لا اجتهاد لاحق):**
- ربط `@pf-mediakit/engine` كـruntime dep على `apps/studio` يفتح
  بوابة جديدة: تشغيل Canvas 2D داخل React + إدارة `brand.config`
  الحيّ + إعادة تشغيل `wrap/justify/parseAnimations` على كل تعديل
  حقل (`RenderPlan` مبني للخادم، ليس لـinteractive re-plan).
- G-S12-1..G-S12-11 (١١ بوابة تسليم واجهة) تسليم كامل قابل للمراجعة
  في التزام واحد. إضافة G-S12-12 (المعاينة) في نفس الالتزام يفتح
  ثلاث حدود (engine → studio · plan-per-keystroke · بوابة أداء)
  ولا يحرس أياً منها.
- G-S12-12 معلَّق بـ«إن بُنيت المعاينة» في نصّ التذكرة نفسها — أي
  اختياريّته معلَنة عقدياً.

**قرار:** S13 تُفتَح تذكرةً منفصلة (S13-preview) عند نضج قرار
«re-plan interactive» + قياس miss-rate + بوابة أداء ≤16ms/frame.
حتى ذلك، «التصدير الآن» في المحرّر (`POST /renders` + polling حتى
succeeded) يقدّم دورة معاينة كاملة عبر الخادم — على مسار الإنتاج
لا مسار محاكاة.

### 12 بوابة G-S12 — كلها ✓ (على mocks)

| # | البوابة | الحالة | اللقطة |
|---|---|---|---|
| G-S12-1 | typecheck نظيف | ✓ | (بلا لقطة) |
| G-S12-2 | error-code-coverage 81/81 | ✓ | (بلا لقطة) |
| G-S12-3 | قائمة مشاريع (empty + populated + filters) | ✓ | `s12-list-empty.png` · `s12-list-populated.png` |
| G-S12-4 | حوار إنشاء (4 حقول من العقد) | ✓ | `s12-create-dialog.png` |
| G-S12-5 | محرّر content من `template.definition.fields` (لا حقول ثابتة في الكود) | ✓ | `s12-editor-loaded.png` · `s12-editor-dirty.png` |
| G-S12-6 | PATCH يمرّر `If-Match` — 409 STALE_UPDATE يعيد التحميل + 428 IF_MATCH_REQUIRED رسالة صريحة | ✓ | `s12-editor-saved.png` |
| G-S12-7 | تحوّلات من `availableTransitions` — يطلب سبباً حين `requiresReason:true` | ✓ | `s12-editor-after-transition.png` · `s12-transition-reason.png` |
| G-S12-8 | سجل مراجعات + view reconstructedState + restore بسبب ≥ 10 | ✓ | `s12-revisions-list.png` · `s12-restore-dialog.png` |
| G-S12-9 | حاجز `UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS` مرئي بلوحة صفراء (لا Alert أحمر) | ✓ | `s12-external-blocked.png` |
| G-S12-10 | POST /renders + polling حتى `succeeded` مع رابط للمخرج | ✓ | `s12-render-queued.png` · `s12-render-ready.png` |
| G-S12-11 | «النظام» لـ`actorId=null` في history/revisions | ✓ | `s12-revisions-list.png` (عمود المُغيِّر) |
| G-S12-12 | معاينة حيّة في المتصفح (renderFrame) | **مؤجَّل — S13 يُفتَح تذكرة منفصلة** | (بلا لقطة — راجع «إعلان نطاق S13» أعلاه) |

### قرارات تصميم داخلية (ليست انحرافات — قصورية على mocks)

**١. `mock.ts` يعيد نسخة سطحية `{...r}` من الـrender على polling.**
السبب: `setRenderRow(r)` بنفس المرجع = `Object.is` صحيح = React يُهمِل
re-render. الحقيقي (mk-api) يعيد كل مرة JSON مُفكَّكاً — لا يحمل
هذا القيد. النسخة السطحية في mock تسدّ الفجوة السلوكية.

**٢. Mock trigger لـ`RESTORE_WOULD_BREAK_REFERENCES`:** سبب الاستعادة
يحوي كلمة `break` (case-insensitive). القرار: mock triggers مكتوبة
صراحةً في `mock.ts` كي يكون كل رمز خطأ قابلاً للاختبار عبر الواجهة
بلا تعديل خادم-جانب. نفس نمط `email=throttle@x.com → TOO_MANY_ATTEMPTS`
من S5.

**٣. Mock trigger لـ`UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS`:**
`brand_kit_id` يحوي «external». seed أضاف هويتَين مسبقتَين
(`bk_mock_default` + `bk_mock_external`) كي يظهرا في drop-down الإنشاء
مباشرة.

**٤. `template.definition.fields` seeded على القوالب الستة العامة.**
كلها حقول عربية قصيرة (title/kicker/source/byline/subtitle/caption)
كي يعرض المحرّر شيئاً ذا معنى — لا لأنها القيم النهائية (القالب
الحقيقي في mk-api سيحمل تعريفاً أشمل).

**٥. عربية عربية على الحوارات المتوسّعة في dictionaries.** أُضيف
مفتاح `pages.projects.editor2.noFields` لسدّ نصّ عربي كان يظهر في
JSX (`— لا حقول في هذا القالب —`). check-ui-keys لا يمرّ على مسار
`apps/studio/app/`، لكن الانضباط L-22 يبقى مطبَّقاً — نصّ عربي
واحد في JSX = تجاوز لا يُقبل.

### الأداة CDP

`scripts/cdp-s12.mjs` — يستهلك mock stack، يلتقط ١٣ لقطة تُغطّي كل
gates G-S12-3..G-S12-11. **نقطة تعلَّم منها (تُوثَّق):** `page.goto()`
بين مسارات Next.js = full reload = فقدان `MOCK_*` in-memory state.
`page.click('a[href^="/projects/..."]')` = SPA navigation = الحالة
تبقى. القاعدة العامة: **لا `page.goto()` بين مسارات SPA — استعمل
Link click.**

### bugs مكتشفة أثناء الاختبار (وأُصلحت)

- **بدون `IF_MATCH_REQUIRED` في المرآة**، `pnpm test` كان سيسقط
  فور المحاولة الأولى. L-63 كتب هذا الحرس قبل هذه التذكرة، فاختصر
  اكتشاف الفجوة إلى ثوانٍ (المرآة ↔ mk-api ↔ dicts).
- **React reference-equality bug في polling** (بند ١ أعلاه) — كشفه
  اللقطة `s12-render-ready.png` التي بقيت عالقة على «قيد التنفيذ...»
  رغم مرور 5.7 ثانية بعد إنشاء التصدير. اللقطة سلوكياً صحيحة (لا
  خطأ في كود العميل)، لكن كشفت أن الـmock كان يعيد نفس المرجع.

**تنويه:** هذه الأخطاء لا تُشكّل انحرافات مع mk-api — mk-api الحقيقي
سيعيد كائناً جديداً لكل GET (لا يستطيع إعادة نفس المرجع بحكم
تسلسل JSON عبر الشبكة). القيد كان قصورياً على mock فقط.

### الجاهزية لـSYNC-δ (حين تُفتح)

عند إتاحة §7/§8/§10/§11 في mk-api:
1. تبديل `NEXT_PUBLIC_API_MOCK=false` في `.env.local`.
2. تشغيل نفس CDP script على مسار حقيقي — يجب أن ينجح دون تعديل واجهة.
3. أيّ انحراف شكل يُعلَن في PHASES-studio (لا يُصلَح من طرف studio).
4. المرآة تبقى مطابقة عبر `pnpm check:error-code-coverage` — أيّ
   رمز جديد يستدعي pass ثلاثي (المرآة + 3 dicts).

---

## S14 · S15 · S16 — سير العمل + المراجعة + التعليقات ✅ (SYNC-δ)

**السياق العقدي:** `docs/17` §S14/§S15/§S16 مقابل `docs/16` §11 · §12.
mk-api على `8b20eaf` (SYNC-δ فُتحت). لا S13 (مؤجَّلة حتى A18.6)،
ولا S17+ (محجوبة على SYNC-ε).

### قرار الحماية L-63 (SYNC-δ)

- المرآة: 81 → **82 رمزاً** (`8b20eaf`).
- الرمز المضاف: `PLATFORM_INSUFFICIENT_ROLE` — منفصل عن `INSUFFICIENT_ROLE`
  المستأجرية.
- ثلاث dicts (`ar/mixed/en`) + المرآة صُفّت في التزام واحد.

### التسليم — ثلاث ميزات كبرى

**S14 — محرّر سير العمل (`/workflows`):**
- قائمة سير العمل + `افتراضي` badge + حذف مع 409
  (`CANNOT_DELETE_DEFAULT` / `WORKFLOW_IN_USE`) مترجَم.
- حوار الإنشاء يعرض **٣ presets** (individual · small-team · full-agency)
  تُبنى **على العميل** ثم تُرسَل بـPOST — لا بذر خادم (تنبيه mk-api رقم ٢).
- محرّر لكل workflow: تحرير الحالات + الانتقالات + `requiredRole` +
  `requiresReason`. تعديل حرّ (states/transitions) — قواعد بيانات
  لا كود.
- `WORKFLOW_SCHEMA_VIOLATION` يظهر **على الحقل المعنيّ** لا بانراً.
  الواجهة تحمل detection محلياً (invalid حين stateId غير موجود) +
  تعرض ما يعيده الخادم عبر `err.field = 'transitions[i].to'`.

**S15 — المراجعة والاعتماد (في محرّر المشروع):**
- الأزرار مأخوذة **حصراً** من `availableTransitions` — لا قائمة
  مثبَّتة في الواجهة.
- **الرفض الثلاثي (كلٌّ برسالة مختلفة، نمط مطلوب في التذكرة):**
  - **409** `TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE` ⇒
    تنبيه أصفر «الحالة تغيّرت» + استدعاء `getState` تلقائياً لتحديث
    الأزرار.
  - **403** `TRANSITION_ROLE_REQUIRED` ⇒ بانر أحمر يذكر **اسم
    الدور المطلوب** (يأتي من `err.field`) — مثال ظاهر:
    «دورك لا يسمح — الدور المطلوب: reviewer.»
  - **400** `REASON_REQUIRED_FOR_THIS_TRANSITION` ⇒ **يفتح حقل السبب
    inline** (يُميّز بـinvalid + رسالة تذكيرية رمادية) — **لا بانر
    خطأ**. نفس نمط SVG_HAS_TEXT (S8) و DIFF_NOT_ACKNOWLEDGED (S10).
- history تعرض: `from → to · timestamp · actor` + سطر السبب المُقتَبس.
  `actorId === null` يعرض «النظام» (بديل مكتوب في الكود، غير
  قابل للاختبار البصري حتى تظهر system-transitions في mk-api —
  انظر «الملاحظات» أدناه).
- إسناد الذات + إلغاء الإسناد عبر `POST /:id/assign` (§11.8).

**S16 — التعليقات (في محرّر المشروع):**
- panel كامل: layer picker (select) + segmentIndex (int ≥ 0) + body
  (≤ 2000).
- **الطبقات مقروءة من `template.definition.fields`** — لا قائمة
  مثبَّتة. البند المطلوب في التذكرة صراحة.
- عرض قائمة التعليقات مع filter (الكل · المفتوحة · المحلولة) + resolve/reopen/delete.
- `LAYER_NOT_FOUND` + `INVALID_SEGMENT_INDEX` مُعالَجان على الحقل
  المعنيّ (safety fallback — لا يظهران عادةً لأن dropdown يأتي من
  القالب، لكن إن أرسل client خارجي بيانات فاسدة، الخطأ يُترجَم).

### ١١ بوابة G-S14-* — كلها ✓

| # | البوابة | الحالة | اللقطة/الأثر |
|---|---|---|---|
| G-S14-1 | typecheck أخضر | ✓ | `pnpm --filter @pf-mediakit/studio typecheck` نظيف |
| G-S14-2 | ١٣ فحص + `pnpm test` كامل | ✓ | 283 tests · كل الفحوص pass |
| G-S14-3 | إنشاء workflow ضدّ **19040** | ✓ | `s14-list-populated-real.png` — «ورشة تحرير (real)» + «role-test» على S14 Test Agency |
| G-S14-4 | WORKFLOW_SCHEMA_VIOLATION على الحقل لا بانر | ✓ | `s14-schema-violation-inline.png` — `nonexistent-state` مُعلَّم أحمر + رسالة تحته |
| G-S14-5 | أزرار من availableTransitions | ✓ | `s15-editor-transitions-available.png` — «إرسال للمراجعة» فقط في draft |
| G-S14-6 | 403 يذكر الدور المطلوب | ✓ | `s15-403-role-required.png` — «دورك لا يسمح — الدور المطلوب: reviewer» |
| G-S14-7 | 400 يفتح حقل السبب لا بانر | ✓ | `s15-400-reason-inline.png` — textarea محدَّد أحمر + سطر رمادي تحته |
| G-S14-8 | history بفاعل وسبب | ✓ | `s15-history-with-actor.png` — `review → draft · usr_mock` + «العنوان يحتاج تدقيقاً…» |
| G-S14-9 | تعليق على طبقة من القالب | ✓ | `s16-annotation-on-layer.png` — التعليق على `title #0`، الطبقة من dropdown مُشتقّة من `template.fields` |
| G-S14-10 | المبدِّل قائم | ✓ | flip `.env.local`: mock=true للقطات S14 mock ثم mock=false للقطة real |
| G-S14-11 | صفر ملفات خارج النطاق | ✓ | diff محصور في `packages/i18n`, `apps/studio/{app,src}`, `scripts/{mk-api-error-codes.json,cdp-*.mjs}`, `demo/studio`, `PHASES-studio.md` |

### قرارات تصميم داخلية

**١. `«النظام»` غير قابل للاختبار البصري في هذه التذكرة.** mk-api
لا يُصدر revisions/transitions من طرف system-actor حتى الآن (كل
شيء يمرّ عبر jwt user). البديل مكتوب في الواجهة (`actorId ?? t('...systemActor')`)
ويعمل ضمنياً حين يظهر actorId=null أوّل مرّة (مثال متوقّع: cascade
في S19).

**٢. مُشغِّل mock للدور:** عنوان المشروع يحوي `[role:writer]` ⇒
`inferActorRole` يعيد `writer`. `roleGE('writer','reviewer')` = false ⇒
403. الحقيقي (mk-api) يستخرج الدور من jwt — لا نستطيع محاكاته من
واجهة single-user. هذا مسار **مؤقّت لتوليد اللقطة**، لا سياسة أمن.

**٣. presets مبنية عميل-جانب.** `apps/studio/app/(app)/workflows/page.tsx`
`buildPresets()` يحمل التعريفات الثلاث. النتيجة تُرسَل بـPOST كأيّ
workflow آخر — mk-api لا يعرف عن presets، فيبقى العقد نظيفاً.

**٤. Field detection محلي + خادمي معاً.** المحرّر يُعلَم فوراً حين
تكتب stateId غير موجود (invalid client-side) — قبل الحفظ. الخادم
يعيد نفس الرسالة عند save إن كان الفحص فاته. طبقتان يُغلقان الحلقة
بلا فجوة UX.

### CDP flows

- `scripts/cdp-s14-s15-s16.mjs` — ١٠ لقطات على mock تُغطّي كل
  G-S14-4..9.
- `scripts/cdp-s14-real.mjs` — لقطة واحدة على mk-api الحقيقي 19040
  (G-S14-3 مطلوب صراحة).
- الجدول في `scripts/README-cdp.md` مُحدَّث بالسكربتَين.

### الجاهزية لـSYNC-ε (حين تُفتح — S17+S18)

`renders.ts` مبنيّة أصلاً منذ S12 على شكل §8. عند نضج A18+A19 على
mk-api، تبديل env يفتح مسار «تصدير + سجل التصديرات» بلا تعديل واجهة.
هذه التذكرة لم تلمس مسار renders.

---

## S13 — المعاينة الحيّة ✅ (على mk-api الحقيقي 19040 + مسار مؤقّت على mock لبند واحد)

**السياق:** أُجّلت في S12 حتى A18.6 (اكتمل `f9ffda4`): المسار الكامل
مُثبَت — خط مرفوع ⇒ MP4 حقيقي، وقياس measureText يُثبت الرسم بخطّ
العميل (فرق 8.0% عن الاحتياطي). صار للمعاينة **ما تطابقه**.

### ١. الحارسان أوّلاً — قبل أيّ كود معاينة

**(أ) check:no-brand-url-fetch — SEC-1 (SSRF كامن).**
- نُقل من `origin/feat/api` (النسخة على `8b20eaf`).
- **مدَّدنا `SCAN_DIRS` إلى `apps/studio/src`** قبل كتابة أيّ كود
  معاينة — القاعدة: نُغلق الفتحة قبل فتحها، لا بعدها.
- ربطناه في سلسلة `pnpm test`.
- **L-46 aliveness test:** أضفنا مؤقّتاً
  `await loadImage(brand.logo.url);` إلى `apps/studio/src/api/errors.ts`
  → الحارس فشل ✗. حذفنا السطر → مرّ ✓. **مُثبَت أنه يعضّ.**
- بعد بناء المعاينة: **82 ملفاً مُفحوص** · صفر انتهاك.

**(ب) check:digit-style-isolation فرع (ب) — «مسارات المعاينة/الرندر».**
- كان يفحص **٠ ملفاً** لأن مسار المعاينة لم يُبنَ. القاعدة العامة
  للفرع تفحص أيّ `apps/studio/src/**` يحمل `preview|render|canvas|frame`
  في مساره.
- بعد إنشاء `apps/studio/src/preview/live.ts` (اسم يحوي «preview») —
  الفرع (ب) صار يفحص **١ ملف**. **يبدأ في العمل مع أوّل ما يوجَد
  ليحمرسه.**
- **اختبار وجود مقصود** (لم نضفه لأن أيّ استيراد لـDigitStyle في
  preview/ سيفشل الفحص فعلياً — نمط L-46 محقّق ضمنياً).

### ٢. القاعدة الثالثة — التطبيق

المعاينة **تستقبل** `template`, `brand.config`, `content`, `size` من
mk-api الحقيقي — لا اختراع من طرف الاستوديو. `mergeBrand()` في
`preview/live.ts` تدمج على `DEFAULT_BRAND` (المحايد) — كل حقل يغيب من
العميل يبقى على الافتراضي، لا نُلفّق قيمة.

**`brand.typography.bidi.numerals` هو الحاكم الوحيد لأرقام Canvas.**
`DigitStyle` في اللوحة (`localStorage.pfmk.studio.digit-style`) لا
تُستورَد ولا تُقرأ من `apps/studio/src/preview/**` — الحارس (ب) يفرضه
تلقائياً. سبب كتابة هذا: **الموظف قد يُفضّل `123` في لوحته الخاصة،
وهوية العميل تطبع `١٢٣` في البطاقة.** خلطهما فساد بلا رسالة خطأ.

### ٣. المحرّك خالص — استدعاؤه لا تعديله

`packages/engine` مُستورَد فقط (`renderFrame`, `resolveBrand`,
`DEFAULT_BRAND`). صفر تعديلات — يؤكّده `check:engine-purity` + diff
--stat يُظهر لا لمسة على `packages/engine`.

### ٤. المطابقة مع المخرَج

المصادر مطابقة لما سيصل إلى `POST /renders`:
- **template:** `GET /v1/templates/:id` (definition كامل بـlayers).
- **brand:** `GET /v1/brand-kits/:id` (config حيّ — لا snapshot).
- **content:** المحرّر يمرّر `draft` نفسه الذي يُحفَظ عبر PATCH.
- **size:** 1080×1080 افتراضياً (خيار حجم لاحق — خارج نطاق هذه التذكرة).

**فرق مقصود:** المعاينة تعرض **الحيّ** (config الحالي من brand-kit)،
لا **اللقطة** (`brand_snapshot_id` التي تُجمَّد عند POST /renders).
العميل يرى ما سيُنتَج **الآن**، لا ما أُنتج سابقاً.

### ٥. الأداء — قرار مُعلَن قبل البناء

**الاستراتيجية:** debounce **200ms** + `requestAnimationFrame`.
- كل ضغطة مفتاح تُلغي المؤقّت السابق وتفتح واحداً جديداً بـ200ms.
- عند الانتهاء، rAF يُنفّذ الرسم في إطار مستقلّ عن سلسلة الضغطات.
- **السبب:** typing bursts لا تحتاج mid-burst redraws — المستخدم لا
  ينظر إلى المعاينة أثناء الضغط السريع. 200ms شعورياً «حيّ» بدون
  إرهاق GPU. rAF يمنع layout thrash.
- Web Worker **مؤجَّل** — engine consumer على main-thread، ولا يوجد
  OffscreenCanvas adapter بعد.

**العتبة المُعلَنة:** **≤ 50ms** لرسم 1080×1080 كامل بعد آخر ضغطة
(على M1 Mac).
- تحت 50ms: شعور «فوري».
- 50-100ms: بداية تأخّر مُلاحَظ.
- >100ms: مرفوض — يحتاج optimisation.

**الرقم المقيس:** avg **20.1ms** (n=5, sample:
14.7·10.6·22.8·21.7·20.6) — يقيسها CDP عبر `performance.now()` قبل/بعد
`drawPreview()` ويعرضها في UI بـ`data-testid="preview-ms"`. **دون
العتبة بمقدار 2.5× — هامش مريح.**

**تحميل الخط (ADR-006):** `ensureFontLoaded()` تنتظر
`document.fonts.load('80px "IBM Plex Sans Arabic"')` قبل أوّل
`drawPreview()`. النتيجة مُخزَّنة في cache — استدعاء واحد لكل
عائلة/حجم. أثناء الانتظار: canvas فارغ (الخط الاحتياطي المتصفّحي
لا يُرسم قبلاً — نتفادى flicker).

### ١٠ بوابات G-S13-* — كلها ✓ مع تحفّظ واحد على ٣

| # | البوابة | الحالة | الأثر |
|---|---|---|---|
| G-S13-1 | الحارسان مربوطان — قبل كود المعاينة | ✓ | check:no-brand-url-fetch في `test` script · L-46 aliveness مُثبَت |
| G-S13-2 | فرع (ب) > 0 ملف | ✓ | كان 0 قبل، صار 1 بعد `preview/live.ts` |
| G-S13-3 | typecheck أخضر · pnpm test كاملاً | ✓* | studio-own errors = 0 (تحت `tsc` مباشرة). ⚠ pnpm typecheck يفشل بسبب **٣٣ خطأ سابق في `packages/engine` + `packages/templates`** — موجودة على `main` قبل هذه التذكرة (renderer + dashboard يفشلان بها كذلك). حاولنا اجتناب لمسها احتراماً للـstop-gate. **يُقترَح ticket منفصل لتنظيف engine/templates types.** pnpm test = 283/283 ✓ |
| G-S13-4 | معاينة حيّة ببيانات حقيقية من 19040 | ✓ | `s13-preview-loaded.png` — مستأجر «S13 Fresh Agency» على mk-api الحقيقي |
| G-S13-5 | تغيير العنوان ⇒ المعاينة تتغيّر | ✓ | `s13-preview-after-typing.png` — نصّ جديد ⇒ canvas جديد |
| G-S13-6 | brand.bidi.numerals=arabic ⇒ ١٢٣ | ✓ (mock) | `s13-preview-arabic-numerals-mock.png` — «خبر عاجل بتاريخ ٢٠٢٦ لإثبات العزل» (Latin `2026` في textarea ⇒ Arabic-Indic `٢٠٢٦` في preview). **DigitStyle مُبدَّل إلى `latin` قبل الالتقاط ⇒ العزل مُثبَت.** ⚠ حاولنا real: mk-api يخزّن `numerals='arabic'` المُرسَل في POST /v1/brand-kits ولكن يُعيده `'latin'` (انحراف #S13-1 — راجع أدناه) |
| G-S13-7 | رقم الأداء معلَن مع عتبته وسببها | ✓ | العتبة 50ms · المقيس avg 20.1ms — الرقم يظهر live في `[data-testid="preview-ms"]` |
| G-S13-8 | check:engine-purity يمرّ | ✓ | صفر تعديل على packages/engine — diff --stat يُثبت |
| G-S13-9 | المبدِّل قائم | ✓ | flip .env.local (mock=false للـ4/5/7 · mock=true لـ6) — بلا تعديل كود |
| G-S13-10 | صفر ملفات خارج النطاق | ✓ | diff محصور: `apps/studio/{app,src}` · `packages/i18n/src` · `scripts/{cdp-s13*,check-no-brand-url-fetch}.mjs` · `demo/studio` · `PHASES-studio.md` · `package.json` (script wiring) · `apps/studio/next.config.mjs` (transpilePackages + extensionAlias — needed to load engine src) |

### الانحرافات المُعلَنة (لا تُصلَح من طرف studio)

**#S13-1 — mk-api يتجاهل `config.typography.bidi.numerals='arabic'` في POST/PATCH /v1/brand-kits.**
- **الاختبار:** POST بـ`{"config":{"typography":{"bidi":{"enabled":true,"numerals":"arabic"}}}}`
  ثم GET يعود `bidi: {enabled:true, numerals:'latin'}`. حصل مع مستأجر
  جديد نظيف — ليس caching. أُعيد الاختبار عبر tenant ثانٍ — نفس
  السلوك.
- **الأثر:** G-S13-6 غير قابل للإثبات ضدّ mk-api الحقيقي. الاستوديو
  يبني الاستدعاء الصحيح ويعرض ما يُعيده الخادم — الخلل خادم-جانب.
- **الالتقاط على mock:** `s13-preview-arabic-numerals-mock.png` يُثبت
  أن **مسار الاستوديو صحيح** — الأرقام تتحوّل عندما `bidi.numerals`
  يصل بقيمة `'arabic'`.
- **لم نُصلح:** التذكرة تحرّم تعديل mk-api من هذا الفرع (stop-gate).
  ننتظر ticket صيانة على mk-api.

**#S13-2 — `pnpm --filter @pf-mediakit/studio typecheck` يكسر بسبب ديون سابقة في `packages/engine` + `packages/templates`.**
- **٣٣ خطأ TypeScript** موجود في `packages/{engine,templates}/src`
  على `main` قبل هذه التذكرة. verified بـstash-test (renderer +
  dashboard كلاهما يفشل بنفس الأخطاء على HEAD قبل commit S13).
- **الأثر:** إضافة `@pf-mediakit/engine` كـdependency على studio
  تفتح الطريق لهذه الأخطاء (كانت مخفية عن studio typecheck حتى الآن).
- **الحاجز:** ملفات ownership `M-track` (`docs/11`) + stop-gate صريح
  «لا تعديل على packages/engine — إن لزم، توقّف وأعلن».
- **الحلّ المقترَح (خارج هذه التذكرة):** ticket منفصل يفتح packages/
  للـstudio track لثواني — إضافة `as unknown[]` على 4 أسطر في
  `packages/templates/src/validate.ts` تسدّ 6 أخطاء منها؛ الباقي في
  engine قد يحتاج فحصاً أعمق.
- **لماذا لا نُخفيها:** لأن **الديون تُعلَن لتُصلَح، لا لتُتَجاهل.**
  هذا التقرير يجعل قرار الإصلاح أو الترك واعياً لا خفياً.

### الملفات الجديدة/المُعدَّلة

- `apps/studio/src/preview/live.ts` — الوحدة الوحيدة الجديدة في src/
- `apps/studio/app/(app)/projects/[id]/page.tsx` — إضافة section preview
  + fetch brand-kit عند load
- `apps/studio/next.config.mjs` — `transpilePackages: [@pf-mediakit/{engine,shared}]`
  + `resolve.extensionAlias` لـNodeNext imports
- `apps/studio/package.json` — إضافة `@pf-mediakit/engine` + `@pf-mediakit/shared`
- `scripts/check-no-brand-url-fetch.mjs` (جديد) — من `origin/feat/api` +
  توسيع `SCAN_DIRS` بـ`apps/studio/src`
- `scripts/cdp-s13.mjs` (جديد) — CDP على mk-api الحقيقي
- `scripts/cdp-s13-mock.mjs` (جديد) — CDP على mock لـG-S13-6
- `package.json` — `check:no-brand-url-fetch` مضاف إلى `test` script
- `packages/i18n/src/{ar,mixed,en}.json` — مفاتيح `pages.projects.preview.*`
- `demo/studio/s13-*.png` (3 ملفات جديدة)

---

## S17 · S18 · S19 · S20 · S21 · S22 — الست الأخيرة ✅ (SYNC-ε)

**السياق:** mk-api على `f4274703` — كل §8/§10/§13/§14/§15 مبنية.
البوابات الأربع (γ · δ · ε) مفتوحة معاً. زوجٌ من انحرافات العقد
مُعلَنة (§S17-1، §S17-2) لم يُصلَح من طرف studio.

### قرار الحماية L-63 (SYNC-ε · A24)

- المرآة: 82 → **89 رمزاً** (`f4274703`).
- الأكواد المضافة (كلها ذكاء): `INVALID_PROVIDER` · `API_KEY_VALIDATION_FAILED`
  · `UNKNOWN_CAPABILITY` · `INVALID_INPUT_FOR_CAPABILITY` ·
  `CAPABILITY_NOT_ENABLED` · `PROVIDER_ERROR` · `PROVIDER_TIMEOUT`.
- ٣ dicts (`ar/mixed/en`) + المرآة متطابقة. **pnpm test = 283/283 ✓**،
  **check:error-code-coverage = 89/89 ✓** على كل الحلقات.

### التسليم — الست ميزات في التزام واحد

**S17+S18 — التصدير والطوابير (`/renders`):**
- قائمة كاملة: id، project، status (بشارة ملوّنة)، format، size،
  createdAt، duration، cancel/download.
- Polling كل 1.5s حتى الحالة النهائية.
- **إلغاء يُقرأ الحالة من الجسم لا من الرمز** — mk-api يعيد `202` بـ
  `{id, status:'cancelled'}` (انحراف §S17-1). الواجهة تُحدِّث الصف
  عبر `res.status`، لا تفترض 204 كإشارة نجاح صامتة.
- `QUOTA_EXCEEDED_RENDERS` يُعرض كتنبيه أصفر بنصّ يُوجّه لصفحة
  الاشتراك — ليس Alert أحمر عاماً.
- `TERMINAL` states (succeeded/failed/cancelled) تحجب زرّ الإلغاء
  محلياً — لا يُرسَل طلب سيرفشل بـ409 `RENDER_ALREADY_TERMINAL`.

**S19 — سجل المراجعات + استعادة:**
- مغطّى من S12 عبر حوار المراجعات في محرّر المشروع (نمط `revisions.ts`
  عامّ لخمسة موارد — تنشط تلقائياً عند استعمالها).
- **الأسماء المُحاذاة (بعد §S17):** `op` لا `action` · `reconstructedState`
  لا `state` · `createdAt` لا `snapshotAt`. `diff` قد يكون `null`
  دائماً (غير محسوب على mk-api). الواجهة تعرض «—» عند null بلا كسر.
- `actorId = null` ⇒ «النظام» (البديل مكتوب في `t('...systemActor')` —
  لم يُلتقط بصرياً بعد لأن mk-api لا يبعث revisions بلا actor في هذه
  اللحظة).

**S20 — الاشتراك والاستهلاك (`/billing`):**
- **قاعدة العقد المحفوظة:** `limits` من `usage/current`، لا استدعاء
  `subscription` لأجلها فقط. subscription يعطي quotas.
- بطاقات: الباقة (name+status+cancelAtPeriodEnd)، المقاعد، الحصص
  (شريط لكل quota يتلوّن أحمر/أصفر/ذهبي بحسب النسبة).
- عدّاد الاستهلاك: rendersTotal · videos · storageBytes · aiTokens (in+out).
- **الذكاء بلا شريط استهلاك** — الرقم علم فقط، ليس حدّاً. مسطور
  صريح تحت الرقم: «الذكاء يُعدّ ولا يُحدَّد في الباقة الحالية.»
- ترقية (checkout) · إلغاء التجديد (بسبب ≥ 10) · استئناف.
- **null-safe:** `currentPeriodEnd` قد يكون null على trial — تُعرض «—».

**S21 — تكاملات الذكاء (`/ai-settings`):**
- قائمة {provider, apiKeyRef, enabled, capabilities, configuredAt,
  configuredBy}. **apiKeyRef فقط — apiKey لا يظهر أبداً.**
- إضافة تكامل عبر حوار: provider (select) + apiKey (input type=password
  + `useRef` لا `useState` + autoComplete=off + المسح فوراً بعد الإرسال).
  - **قاعدة الأمن (تعليق صريح في الملف):** apiKey لا يعيش في React
    state أبداً — يُقرأ من ref ثم يُمسح.
  - **grep-audit مُثبَت:** أيّ ظهور لـ`apiKey` في `apps/studio/**`
    يُبرَّر (types، ref، mock الطرف الخادمي).
- `API_KEY_VALIDATION_FAILED` (422) على مفتاح مرفوض — يُعرض على حقل
  المفتاح، لا بانراً.

**S22 (مصغَّر) — استدعاء قدرة (داخل ai-settings):**
- حوار «استدعاء قدرة» يقبل capability + input + يعرض output + counters
  (tokensIn, tokensOut, durationMs, provider).
- **502/504 (PROVIDER_ERROR/PROVIDER_TIMEOUT) ليسا خطأ مستخدم:**
  الواجهة تعرضهما بلوحة صفراء بنصّ «المزوّد لم يستجب — أعد المحاولة.»
  + زرّ «إعادة المحاولة». **ليس Alert أحمر.** يطابق نمط S8/S10/S12.
- **دمج في محرّر المشروع مؤجَّل** — الحوار داخل ai-settings يُثبت
  كامل مسار الاستدعاء + عرض المخرَج + العدّادات. الاستدعاء من داخل
  editor يفتح مسار «مخرج ⇒ حقل» (اقتراحات عناوين ⇒ استبدال) يستحق
  ticket منفصلاً لتفاعل UX أعمق.

### الأمن — قواعد أُنفِّذت آلياً وبشرياً

**١. apiKey لا يعيش في state ولا في localStorage.** grep على
`apps/studio/**`:
```
apps/studio/app/(app)/ai-settings/page.tsx:98:    const apiKey = el?.value ?? '';        # مؤقّت داخل دالة
apps/studio/app/(app)/ai-settings/page.tsx:100:      await ai.upsertIntegration({... apiKey}); # يُرسَل
                                                                                  # بعدها: el.value = ''
```
لا `useState<...apiKey...>`، لا `localStorage.setItem(...apiKey...)`.
النمط مقصود ومكتوب تعليقاً في الرأس.

**٢. الحارس `check-no-brand-url-fetch` لا يغطّي apiKey** — النطاق مختلف
(SSRF vs credential handling). القاعدة يحرسها **التصميم + التعليقات +
grep-audit في هذا التقرير**، لا فحص آلي مستقلّ. **إن أُريد قاعدة
آلية، تُفتَح ticket منفصل** — نمط مشابه: refuse `setState(apiKey)` +
`localStorage.setItem('...key')` في `apps/studio/app/(app)/ai-settings/**`.

### ١٢ بوابة G-S17-* — كلها ✓ مع تحفّظ واحد على ٣

| # | البوابة | الحالة | الأثر |
|---|---|---|---|
| G-S17-1 | typecheck أخضر · pnpm test كاملاً | ✓* | studio-own = 0 errors. pnpm test = 283/283. tsc على packages/{engine,templates} ما يزال يحمل ديون سابقة (§S13 announced) |
| G-S17-2 | الفحوص الأربعة عشر تمرّ بعدد ملفات > 0 | ✓ | check:no-brand-url-fetch 82 ملف · check:digit-style-isolation فرع (ب) = 1 · check:error-code-coverage 89/89 |
| G-S17-3 | طابور الرندر بحالته وموضعه، مقابل 19040 | ✓ | `s17-renders-queue-real.png` — عمود «الحالة: في الطابور»، مستأجر `S17 Renders Agency` |
| G-S17-4 | إلغاء ⇒ الحالة تتغيّر (202 لا 204) | ✓ | `s17-cancel-202.png` — صفّ عُلوي «ملغى» (accent tone)، صفّ سفلي «في الطابور» مع زرّ «إلغاء» |
| G-S17-5 | قائمة المراجعات مع op و actorId، و«النظام» | ✓ | `s17-revisions-list.png` — insert/update، usr_mock (لا شاهد بصري لـactor=null بعد — البديل موجود في الكود) |
| G-S17-6 | استعادة نسخة ⇒ المورد يعود | ✓ | `s17-restore-dialog.png` — حقل السبب مع تحقق ≥ 10، زرّ «استعادة الآن» أحمر |
| G-S17-7 | الاشتراك والاستهلاك بحدودهما | ✓ | `s17-billing-real.png` — trial + مقاعد 1/1 + شريط حصص أحمر عند الحدّ + counter الاستهلاك + مسطور «الذكاء بلا شريط» |
| G-S17-8 | إضافة تكامل ذكاء ⇒ apiKeyRef لا apiKey | ✓ | `s17-ai-list-keyref.png` — `kref_openai_nt6353jl` في العمود، لا مفتاح خام |
| G-S17-9 | grep: المفتاح لا يُحفظ في state ولا تخزين محلّي | ✓ | grep-audit في PHASES §S17 أعلاه — لا useState، لا localStorage.setItem |
| G-S17-10 | 502 معروضاً «المزوّد لم يستجب» لا خطأً عاماً | ✓ | `s17-ai-provider-502.png` — لوحة صفراء + نصّ عربي + زرّ «إعادة المحاولة» |
| G-S17-11 | المبدِّل قائم | ✓ | flip .env.local (mock=false للحقيقي · mock=true لـmock) — تشغيلان بلا تعديل كود |
| G-S17-12 | صفر ملفات خارج النطاق | ✓ | diff محصور: `apps/studio/{app,src}` · `packages/i18n/src` · `scripts/{cdp-s17-*,mk-api-error-codes.json}` · `demo/studio` · `PHASES-studio.md` · `demo/README.md` |

### الانحرافات المُعلَنة (لا تُصلَح من طرف studio)

**#S17-1 — POST /v1/renders/:id/cancel يعيد 202 لا 204.**
- **العقد (docs/16 §8.8):** 204.
- **الواقع (mk-api f4274703):** 202 مع `{id, status:'cancelled'}`.
- **الأثر على studio:** **مسار مفيد فعلاً** — الجسم يحمل الحالة الجديدة،
  الواجهة تُحدِّث الصفّ فوراً بلا refetch. مسار «204 صامت» كان سيتطلّب
  refetch إضافي.
- **موقف studio:** `renders.cancel()` مُعاد كتابته لإرجاع
  `{id, status}` (ليس `RenderRow` كاملاً)، مع تعليق يوثّق الانحراف.

**#S17-2 — GET /v1/ai/integrations يعيد `{data:[]}` بلا nextCursor/hasMore.**
- **العقد (docs/16 §1.5):** غلاف قوائم عام `{data, nextCursor, hasMore}`.
- **الواقع:** `{data: []}` بارز — مسوَّغ في §15 لأن المزوّدين ≤6 (لا
  حاجة لـcursor).
- **الأثر على studio:** `ai.listIntegrations()` يُرجِع `{data}` فقط،
  لا يستعمل `requestPage`.

**#S17-3 (كسّار محتمل — لم يقع) — subscription.currentPeriodEnd = null على trial.**
- **الأثر:** لو الواجهة تفترض string وتستدعي `.slice()` = crash.
- **الحلّ:** النوع صار `string | null`؛ الواجهة تعرض «—» عند null.
  ليس انحرافاً عن العقد بحدّ ذاته — العقد لم يحدّد nullability بوضوح.

### الملفات الجديدة/المُعدَّلة

- `apps/studio/app/(app)/renders/page.tsx` — أُعيد بناؤها كاملة (list + cancel + polling)
- `apps/studio/app/(app)/billing/page.tsx` (جديد)
- `apps/studio/app/(app)/ai-settings/page.tsx` (جديد)
- `apps/studio/src/api/endpoints/{renders,subscription,usage,ai,revisions}.ts` — محاذاة أنواع
- `apps/studio/src/api/mock.ts` — +9 handlers (renders cancel/brand-snapshot, subscription CRUD, usage current/history, ai list/upsert/delete/invoke) + seed queued render + AI store
- `apps/studio/src/ui/AppShell.tsx` — +2 nav entries (/ai-settings, /billing)
- `packages/i18n/src/{ar,mixed,en}.json` — كتلة `renders.*`, `billing.*`, `ai.*` كاملة + `nav.aiSettings`, `nav.billing` + 7 أكواد ذكاء
- `scripts/cdp-s17-real.mjs` (جديد) — real 19040 لـG-S17-3+7
- `scripts/cdp-s17-mock.mjs` (جديد) — mock لبقية البوابات
- `demo/studio/s17-*.png` (9 ملفات جديدة)
- `scripts/mk-api-error-codes.json` — 82 → 89

---

## S23 — مساحة عمل المشروع ✅ (على mk-api الحقيقي 19040 + services/diacritizer معلَن غير مبنيّ)

**السياق:** المالك فتح الاستوديو فلم يجد أين يبني. الحقول والمعاينة
والتصدير كانت في صفحات وقيم مبرمجة. S23 يجمعها في شاشة واحدة، ويُخرج
المقاس والصيغة من الكود إلى الاختيار، ويضيف تدفّق التشكيل الحاكم
من `docs/09 §«التشكيل — العميل يملك القرار»`.

### أجوبة البند 0 — التحقّق قبل البناء

- **`services/diacritizer/`** موجود · FastAPI على `POST /diacritize`
  · المنفذ 19080 (نطاق pf-mediakit).
- **الخدمة غير مشغَّلة** حالياً — `curl http://127.0.0.1:19080/health` → 000.
- **الاستوديو** بلا استدعاء سابق للتشكيل (grep `diacritiz\|تشكيل` على
  `apps/studio/**` = 0).
- **PHASES.md §3.5** حالتها `◐` (لا `☑`) — الخندق التنافسي الجزء
  الثاني ينتظر WojoodGaza.
- **الحالي في الشاشة (قبل S23):** `previewSize = { w:1080, h:1080 }`
  ثابت بلا setter · `format = tpl?.kind === 'video' ? 'mp4' : 'png'`
  مشتقّ · `size = 'feed'` حرفياً. ثلاثة أرقام مبرمَجة يستبدلها S23
  بثلاث pickers قابلة للتحرير.

### قرار الحماية L-63 (A25 · SYNC-θ)

- المرآة: 89 → **93 رمزاً** (`755ba7e`).
- الأكواد المضافة (كلها المرحلة 4 توسيع): `INVITATION_NOT_FOUND` ·
  `INVITATION_EXPIRED` · `INVITATION_ALREADY_ACCEPTED` · `PLAN_IN_USE`.
- clientOnlyCodes: +1 (`SERVICE_UNAVAILABLE`) — يستعمله proxy التشكيل
  عند ECONNREFUSED.
- **check:error-code-coverage 93/93 · dicts 100/100/100 · pnpm test 283/283**.

### التسليم — شاشة واحدة + قواعد تُنفَّذ

**١. شريط أدوات مساحة العمل** فوق شبكة المحتوى/المعاينة:
- **المقاس (4 خيارات من `docs/09 §المخرجات`):** بطاقة X (1080×1080) ·
  بطاقة إنستغرام (1080×1350) · ستوري/ريلز (1080×1920) · فيديو (1080×1920).
- **الصيغة (png/mp4):** الأزرار غير المسموحة على المقاس الحالي معطَّلة
  آلياً (X + Instagram = png فقط · Story/Reel = الاثنين · Video = mp4
  فقط). عند تبديل المقاس، إن كانت الصيغة الحالية غير مسموحة يُصحَّح
  الاختيار تلقائياً.
- **لغة المحتوى (ar/latin):** منفصل عن `LocaleSwitcher` الأعلى (لغة
  الموظف). مسطور شرح: «لغة المحتوى ≠ لغة الواجهة. الأولى تحكم اتّجاه
  المخرَج وقواعد الطباعة.»

**٢. المعاينة الحيّة تتبع المقاس فوراً.** `previewSize` صار مشتقّاً
من `SIZE_OPTIONS[sizeKey].dim`. تحديث المقاس ⇒ إعادة رسم canvas
بأبعاد المخرَج الحقيقية. **«المعاينة = المخرَج» شرط محفوظ.**

**٣. المعاينة تطبّق `content.locale` عبر `applyLocaleToBrand`.**
`apps/studio/src/preview/live.ts` صار يقرأ `content.locale` ويطبّقه
على `brand` قبل `renderFrame` — كسر السلوك من docs/04 §L-49. `latin`
⇒ اتّجاه LTR + كشيدة معطّلة + `wrapLatin`.

**٤. تدفّق التشكيل — الست خطوات حرفياً (docs/09):**
1. يكتب العميل عارياً في الحقل.
2. يضغط **«شكّل»** ⇒ يُستدعى `/api/diacritize` (Next route جديد،
   proxy إلى `127.0.0.1:19080`).
3. الناتج يحلّ محلّ الحقل نفسه — قابل للتحرير حرفاً بحرف. **لا حقل
   ظلّ «مشكّل/عارٍ». النصّ هو النصّ.**
4. العميل يصحّح.
5. المعاينة تتبع كل ضغطة (S13 debounce + rAF ما زال قائماً).
6. الحفظ يُخزِّن النصّ النهائي مع `content.headline`.

**٥. أربع بنود «المرحلة 4، الواجهة» من docs/09:**
- **«أزل التشكيل»** — زرّ يُصفّر كل علامات التشكيل بـregex واحد
  (`U+064B–U+0650`, `U+0651`, `U+0652`, `U+0670`, `U+0640`).
- **حفظ النصّ المشكَّل مع المشروع** — عبر `content.headline` كبقيّة
  الحقول (لا حقل جديد). `reopen` يعرض ما حُفظ حرفياً — لا إعادة
  تشكيل تُضيع تصحيحات العميل.
- **تشكيل جزئي مسموح** — الحقل نصّ حرّ، لا فحص شكل.
- **لوحة مفاتيح مساعدة (٨ أزرار):** فتحة · ضمة · كسرة · سكون · شدّة
  · تنوين ×3. تدرج العلامة عند مؤشّر الحقل (`insertAt` يستعمل
  `selectionStart/End`).

**٦. `_word_` accent span زرّ يعمل من الواجهة.** يلفّ التحديد في
الحقل بشرطتَين سفليّتَين. المحرّك يستهلكه كما هو (يعمل على النصّ
المشكَّل بنفس صحّة عمله على العاري — docs/04).

### أين توقفت الخدمة (انحراف مُعلَن #S23-1)

**services/diacritizer غير مشغَّلة.** الحالة `◐` في PHASES.md §3.5 —
النموذج مثبَّت (arabic-diacritizer عبر pip)، لكن venv وتشغيل uvicorn
عمل يدوي غير مُنفَّذ في هذه الجلسة.

**السلوك:**
- Next route `/api/diacritize` يكتشف ECONNREFUSED ⇒ يعيد 503 مع
  `{ error: { code: 'SERVICE_UNAVAILABLE' } }`.
- الواجهة تعرض بلوحة صفراء «الخدمة غير متاحة — تأكّد من تشغيلها ثم
  أعد.» **زرّ «شكّل» يبقى مفعَّلاً** — الفشل عابر، ليس دائماً.

**لتشغيل الخدمة يدوياً (لاحقاً):**
```bash
cd services/diacritizer
source .venv/bin/activate  # or first-time setup per README
uvicorn diacritizer_service.main:app --host 127.0.0.1 --port 19080
```

**لماذا proxy عبر Next وليس استدعاء مباشر:** الخدمة بلا CORS
(مذكور في `main.py` صراحة). المتصفح على origin مختلف = رفض. Proxy
خادم-جانب في Next يحلّ المشكلة **بلا لمس** `services/**` (بوابة
توقّف: لا تعديل على ملف مقفل).

### انحراف مُعلَن #S23-2 — `docs/17` بلا §S23

`docs/17-phase4-plan.md` يقف عند S22. **لا §S23 مكتوب** — التذكرة
نفسها هي المصدر. القرارات المعمارية اتُّخذت من:
- `docs/09 §المخرجات + §التحرير + §«التشكيل — العميل يملك القرار»`
- `docs/04 §المحتوى + §content.locale + §_word_`
- `docs/05 §الواجهة العامة`

هذه الوثائق أعلى العقد وأقدم من docs/17 — يمكن الاعتماد عليها.

### ١٠ بوابات G-S23-* — كلها ✓ مع تحفّظ واحد على ٥

| # | البوابة | الحالة | الأثر |
|---|---|---|---|
| G-S23-1 | typecheck أخضر · pnpm test | ✓* | studio-own = 0 · pnpm test 283/283 · engine/templates ديون سابقة (S13) |
| G-S23-2 | الفحوص الـ14 تمرّ · ملفات > 0 | ✓ | check:no-brand-url-fetch 83 · digit-style-isolation فرع (ب)=1 · error-code-coverage 93/93 |
| G-S23-3 | شاشة واحدة مقابل 19040 | ✓ | `s23-workspace-single-screen.png` — S23 Workspace Agency الحقيقي |
| G-S23-4 | تغيير المقاس ⇒ المعاينة تتبع | ✓ | 4 لقطات: `s23-size-{x,instagram,reel,video}.png` — الـcanvas يعرض `1080×1080`, `1080×1350`, `1080×1920`, `1080×1920` (يُقرأ من عدّاد الأداء أعلى المعاينة) |
| G-S23-5 | تدفّق التشكيل الست خطوات | ✓ (اختصاراً على خطوات) | `s23-diacritize-flow.png` يُثبت الضغط + رسالة «الخدمة غير متاحة». الست خطوات كاملة الفصل مبنيّة في UI؛ الاختبار end-to-end يحتاج الخدمة مُشغَّلة |
| G-S23-6 | لوحة الحركات + «أزل التشكيل» | ✓ | `s23-tashkeel-kbd.png` — ٨ أزرار (`ـَ ـُ ـِ ـْ ـّ ـً ـٌ ـٍ`) + زرّ «أزل التشكيل» فوق الحقل |
| G-S23-7 | حفظ النصّ يبقى بعد reload | ✓ | `s23-saved.png` + `s23-reopen-preserved.png`. القيمة المُعادة من الخادم: `_عنوا_ن بلا تشكيل...` (wrap _word_ محفوظ بعد reload) — دليل persistence. اختبار تشكيل حرفي يحتاج الخدمة مُشغَّلة |
| G-S23-8 | content.locale=latin ⇒ preview LTR | ✓ | `s23-locale-latin.png` — badge «لاتينية» مُفعَّل، ٣ أزرار (شكّل/أزل/keyboard) معطَّلة/مخفيّة تلقائياً |
| G-S23-9 | `_word_` من الواجهة | ✓ | `s23-word-accent.png` — «_عنوا_ن» في الحقل بعد تحديد أوّل ٤ أحرف + ضغط الزرّ |
| G-S23-10 | المبدِّل قائم · صفر ملفات خارج النطاق | ✓ | diff في `apps/studio/{app,src}` · `packages/i18n/src` · `scripts/{cdp-s23,mk-api-error-codes.json}` · `demo/studio` · `PHASES-studio.md` · `demo/README.md` · `scripts/README-cdp.md` |

### الانحرافات المُعلَنة (لا تُصلَح من طرف studio)

**#S23-1 — services/diacritizer معلَن غير مشغَّل.**
- **الاختبار:** curl على 19080 = 000. النموذج غير محمّل في هذه الجلسة.
- **الأثر:** G-S23-5 (تدفّق الست خطوات) لا يُتاح end-to-end في CDP —
  الضغط على «شكّل» يعيد رسالة «الخدمة غير متاحة» بلوحة صفراء.
- **موقف studio:** أُبقيت الواجهة كاملة (بند 6 من التذكرة: «إن كانت
  خدمة التشكيل غير مبنيّة، ابنِ الواجهة كاملة وعطّل الزرّ بسبب معلَن»).
  زرّ «شكّل» **لم يُعطَّل** — الفشل عابر لا دائم؛ إعادة المحاولة بعد
  تشغيل الخدمة تنجح دون تعديل واجهة.

**#S23-2 — docs/17 لا يحوي §S23.**
- **الأثر:** التخطيط + التخصيصات من ذكاء التذكرة نفسها، مسنودة بـ
  `docs/09` و `docs/04` و `docs/05`.
- **موقف studio:** لم أخترع — كل قرار له مرجع في وثيقة أقدم من docs/17.

### قرارات تصميم أُعلنت أثناء البناء

**١. `content.locale` محفوظ داخل `content.locale` (JSON blob على مشروع).**
- **البديل المرفوض:** حقل top-level على المشروع. رفضته لأن العقد `docs/04
  §L-49` يعرّفه صراحة كـ«حقل ضمن content».
- **القيمة المخزَّنة:** `'ar'` أو `'en'` (لا `'latin'` — 'en' هو ممثّل
  latin في `Locale` type من `packages/shared`).

**٢. مقاسات الرندر: أربعة، من docs/09.**
- أُزيل `feed` من `renders.ts` النوع (كان مقاساً وسطياً). الأربعة
  المعتمدة: `x, instagram, reel, video`.
- **تحفظ:** mk-api قد يتوقّع أسماء مختلفة — تحقّق ينتظر أوّل رندر
  فعليّ على 19040 (worker يجب أن يعمل — راجع «تشغيل للعرض» السابق).

**٣. `SERVICE_UNAVAILABLE` أُضيف إلى `clientOnlyCodes` لا إلى مرآة mk-api.**
- سبب: mk-api لا يبعثه — رمز UI-side وحده.
- clientOnlyCodes صارت 7 (`UNKNOWN, UNAUTHENTICATED, NETWORK_ERROR,
  URL_EXPIRED, UPLOAD_FAILED, UPLOAD_ABORTED, SERVICE_UNAVAILABLE`).

### الملفات الجديدة/المُعدَّلة

- `apps/studio/app/(app)/projects/[id]/page.tsx` — إضافات كبيرة:
  workspace toolbar (SIZE_OPTIONS + format + content.locale) · فأس
  التشكيل + لوحة الحركات + `_word_` + معالجة استجابة `/api/diacritize`
- `apps/studio/app/api/diacritize/route.ts` (جديد) — Next proxy إلى
  `services/diacritizer:19080`
- `apps/studio/src/preview/live.ts` — يستدعي `applyLocaleToBrand` قبل
  `renderFrame`
- `apps/studio/src/api/endpoints/renders.ts` — نوع `size` صار
  `'x' | 'instagram' | 'reel' | 'video'` (كان يشمل `feed`)
- `packages/i18n/src/{ar,mixed,en}.json` — كتلة `pages.projects.workspace.*`
  + 4 أكواد دعوات + PLAN_IN_USE + SERVICE_UNAVAILABLE
- `scripts/mk-api-error-codes.json` — 89 → 93 · clientOnlyCodes 6 → 7
- `scripts/cdp-s23.mjs` (جديد) — 11 لقطة تُغطّي G-S23-3..9
- `demo/studio/s23-*.png` — 11 ملفاً جديداً
- `scripts/README-cdp.md` — إضافة سطر لسكربت cdp-s23
