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

## S1 — الإطار ✅

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

**اللقطة:** `apps/studio/screenshots/projects.png`,
`apps/studio/screenshots/login.png`.

**ما رأيته في اللقطة (L-17):**
- RTL يعمل — الشريط الجانبي على اليمين، المحتوى على اليسار.
- الشريط الجانبي يعرض خمسة عناصر (مشاريع/هويات/قوالب/أصول/تصديرات)
  مع أيقونات نصية بسيطة، البند النشط (`nav.projects`) مظلَّل بلون
  `--surface-2`.
- رأس علوي بارتفاع 56px يحوي `nav.workspace` و `nav.user.placeholder`.
- بطاقة "empty state" في المنتصف بحدود متقطعة على `--surface/40`.
- الطباعة تظهر مفاتيح i18n خام (`pages.projects.title` …) — متوقّع
  قبل S3، الذي يملأ القواميس.
- الألوان: خلفية `#0b0d10`، سطح `#12151a`، حدود شفافة 8%، لهجة
  زيتية `#d4a017` (ستظهر مع الأزرار في S2).

**تحقّق مطلوب:** `pnpm typecheck` أخضر. `curl` ثلاث شاشات: `/` (307)،
`/projects` (200)، `/login` (200).

**غير مطلوب في S1:** استدعاء أيّ endpoint من أيّ صفحة (تنتظر SYNC-α
حسب `docs/17 §5`).

## S2 — نظام التصميم ✅

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

**اللقطات:** `design-{ar,mixed,en}.png` في `apps/studio/screenshots/`.

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

## S3 — i18n ✅

**التسليم:** ar/mixed/en على نمط `apps/dashboard/src/i18n/` (L-24 يحكم
الخلط). المخزن `pfmk.studio.locale` (ADR-011 · L-49 — لغة الموظف
لا الوكالة). `?locale=X` يتخطى المخزَّن للقطات.

**ما بُني:**
- `LocaleProvider.tsx` — dir/lang على `<html>`، Locale سياق React،
  `t()` مع fallback إلى العربية.
- `LocaleSwitcher.tsx` — ثلاثة أزرار مدمج في `AppShell` header و
  `AuthShell` header.
- `Ltr.tsx` — يوفَّر مبكراً؛ يستعمَل في S4 وما بعد.
- ثلاث قواميس مع مفاتيح: `brand`, `locale`, `nav`, `pages.{projects,
  brandKits, templates, assets, renders}`, `auth.{login, signup, forgot,
  reset, field, hint}`, `actions`, `table`, `errors` (مفاتيح L-22).

**قاعدة L-24 مطبَّقة في `mixed`:**
- عناوين ووحدات مستقلّة بالإنجليزية: `Projects`, `Brand Kits`,
  `Templates`, `Assets`, `Renders`, `Workspace`, `Account`, `No … yet`.
- جمل الوصف والتلميحات بالعربية كاملةً.
- شاشات المصادقة (auth.*) عربية كاملة في mixed لأن الجملة الطويلة
  للتوجيه لا تحتمل الخلط داخل الجملة.

**اللقطات (L-17):** ست شاشات في `apps/studio/screenshots/`:
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

## S4 — الأرقام والاتجاه ✅

**التسليم:** `apps/studio/src/format/` مع أربع أدوات موحّدة تعالج
درسَي L-23 (المركّبات الرقمية تحت RTL) و [[digit-preference-per-user]]
(خيار الأرقام لكل مستخدم — CLAUDE.md §بنود إلزامية للعميل الأول).

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
- `Ltr` (من S3) يُعاد تصديره من `format/index.ts` للاكتمال.

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
