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

## S2 — نظام التصميم ⏳

## S3 — i18n ⏳

## S4 — الأرقام والاتجاه ⏳
