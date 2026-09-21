# mk/454 — الفحصُ الذي يهدم، والتطويلُ الذي اختفى

**التاريخ:** 2026-09-21 · **الشجرة:** `main` @ (سيُملأ بعد commit).

---

## §١ · `verify-isolation` لم يعُدْ يهدم ما بعده

### ١.١ · العيبُ ومكانه

الموضع: `packages/db/scripts/verify-isolation.mjs:163` — `TRUNCATE tenants CASCADE`.

`TRUNCATE ... CASCADE` على `tenants` يُفرِغُ كلَّ جدولٍ يشيرُ إليه بمفتاحٍ أجنبيّ (وثيقة PostgreSQL). `templates` تحمل `FK tenant_id REFERENCES tenants(id)` → PostgreSQL يُفرِغها كاملةً بغضّ النظرِ عن قيمِ FK، فيمسحُ حتّى الصفوفَ العالميّة (`scope='global' AND tenant_id IS NULL`) التي بذرتها هجرةُ `20260906120000_templates-a13.ts` مرّةً واحدةً ولا تُعادُ.

### ١.٢ · البديلُ الأضيق (والاختيار)

**الحكم — الأضيق:** بدلَ تفريغِ كلّ الجدول واستعادةِ globals لاحقاً، **نحذفُ فقط مستأجرَي الاختبار Alpha/Beta بمعرِّفَيهما**. FK `tenant_id REFERENCES tenants(id) ON DELETE CASCADE` (متحقّق على الجداول tenant-scoped) يمسحُ صفوفَ الاختبار مع المستأجرَين — بلا لمسِ globals ولا لمسِ حالةِ verifiers أخرى.

**تبرير الاختيار:** إعادةُ بذرِ globals بعد TRUNCATE ممكنة لكنّها تُدخِلُ tests-ownership لبيانات هجرة (repackaging seed logic). الحذفُ الضيّقُ يبقي مسؤوليّةَ globals عند migration وحدَها.

### ١.٣ · مفاجأةٌ في التنفيذ — RLS على tenants يُخفي DELETE بلا SET LOCAL

**الاكتشاف بعد الإصلاح الأوّل:**

```
▶ Reset + seed
✗ Unexpected exception: error: duplicate key value violates unique constraint "tenants_pkey"
    at resetAndSeed (verify-isolation.mjs:179)  ← INSERT INTO tenants
```

قِستُ حالةَ الجدول قبلها: `SELECT count(*) FROM tenants → 0`. الحذفُ ألقى `DELETE 0`. لكنَّ INSERT الفوريّ يصطدمُ بـPK موجود.

**التفسير:** `tenants` تحمل FORCE RLS، وسياسةُ `tenants_delete` تشترط `id = current_setting('app.tenant_id')`. `migration_user` **ليس عنده سياسةُ bypass على `tenants`** (فقط `control_plane_user` يملك واحدة عبر `tenants_control_plane_all`). النتيجة:
- `DELETE FROM tenants WHERE id IN (...)` بلا `SET LOCAL app.tenant_id` → RLS يُخفي الصفوف ⇒ `DELETE 0` صامت.
- `SELECT` أيضاً بلا SET LOCAL → RLS يعيد `0`. الصفوفُ موجودةٌ لكنّها غيرُ مرئيّةٍ لـmigration_user — التمييزُ لا يظهرُ إلّا عند INSERT.

**الإصلاح النهائيّ:** الحذفُ يُصبح مقيّداً بـ`SET LOCAL app.tenant_id` لكلّ tenant قبلَ حذفه:

```js
for (const tid of [TENANT_A, TENANT_B]) {
  await client.query('BEGIN');
  await client.query('SELECT app_set_tenant($1::uuid)', [tid]);
  await client.query(`DELETE FROM tenants WHERE id = $1::uuid`, [tid]);
  await client.query('COMMIT');
}
```

### ١.٤ · مفاجأةٌ ثانيةٌ — `templates` صفوفٌ عالميّةٌ مرئيّةٌ في السلبيّات

بعد إصلاحِ DELETE، سقط فحصان جديدان:
- `templates neg SELECT: expected 0, got 1 rows`
- `no-set-local templates: expected 0, got 6 rows visible`

**السبب:** سياسةُ `templates_select` تسمح: `USING (scope = 'global' OR tenant_id = ...)`. أي أنّ صفوفَ globals **مرئيّةٌ عمداً لأيّ جلسةٍ** — وهذه ميزةٌ لا عيب. `checkTable` كان يختارُ أوّلَ صفٍ من `SELECT * FROM templates` تحت tenant_B (فيقعُ على صفٍ عالميّ)، ثمّ يجرّبُ رؤيتَه من tenant_A — وهو مرئيٌّ فعلاً بحكم السياسة. سلبيّةٌ زائفة.

**الإصلاح:**
- في `checkTable()`: نختار صفَّاً يخصُّ tenant_B فعلاً (`tenant_id === TENANT_B`) لتجربة السلبيّة.
- في `checkWithoutSetLocal()`: للجدول `templates` نستثني globals من العدّ (`WHERE tenant_id IS NOT NULL`).

**لا لمسَ للسياسات، لا إرخاءَ شرطٍ، لا استثناءَ جديد.** الفحصُ صار يقيسُ الشيءَ الصحيح: هل يرى tenant_A **صفوفَ tenant_B الخاصّة**؟

### ١.٥ · إثباتٌ بالتنفيذ

```
== إثباتٌ ١ · verify:tenant-isolation ثمّ SELECT globals ==
  exit=0 · globals=6
✓ G-P4-1 PASSED — كل الفحوص نجحت (1.72s)

== إثباتٌ ٢ · verify:tenant-isolation ثمّ verify:templates ==
  isolation=0  templates=0

== إثباتٌ ٣ · verify:templates وحده ==
  exit=0
```

**ثمّ verify:users** بعد isolation: `exit=0 · ✓ G-P4-5 PASSED`.

globals صمدت (6/6)، القوالبُ تمرّ متتاليةً وبمفردها، users مستقرّ. الحمرةُ المتقلّبةُ في CI ستُغلَقُ عند الدفع.

---

## §٢ · التطويل — تحقيقٌ لا إصلاح

### ٢.١ · العيّنة والأداة

- **العيّنة:** المحتوى الافتراضيّ في `scripts/verify-frame-at.mjs` (نفسُ العنوان والمصدر في المرجع والحاليّ).
- **الأداة:** `drawTimelineAt(ctx, ..., t=2.0)` مباشرةً (لا مرورَ بـffmpeg) — يُنتجُ PNG من الإنجن مباشرةً، فبكسلاته دالّةٌ على الإنجن وحدَه.
- **المقياس:** `md5` + حجم PNG المرندَر عند `t=2.0`.
- **المكان:** `git worktree add --detach /tmp/mk-454-bisect <commit>` — لا لمسَ للشجرة الحيّة. node_modules أُعيد ربطُه ليجعل `@pf-mediakit/*` تُشيرُ إلى حزم الـworktree لا الـmain.

### ٢.٢ · اتّساعُ نطاقِ البحث

مرشّحاتُ التذكرة السبعة (`aa2** · c34b6ef · fd1d8b3 · 6c7f28b · edaa9f2 · bbb67f7 · 6e6519e`) رنّدت **كلُّها بـmd5 متطابق** (`317cbee1…` · 54,337B). قرأتُ diff-stat لها: التغيّراتُ في `src/index.ts · src/locale.ts · src/render.ts · src/timeline/draw-timeline-at.ts` — **لم تلمس `text/wrap-optimal.ts` ولا `text/kashida.ts` ولا `text/semantic-break.ts` ولا `templates/breaking.json`**.

فوسّعتُ إلى **كلّ commit مسّ `packages/engine|templates|shared` بين تاريخ المرجع (2026-09-11) و HEAD**، فحصلتُ على قائمةٍ من 11 commit.

### ٢.٣ · نتيجةُ التنصيف

بترتيب زمنيّ صاعد، عند `t=2.0`:

| Commit | size PNG | md5 (أوّل 8) | subject |
|---|---:|---|---|
| ab11626 | 70270 | 3b588c80 | merge feat/api → main |
| 93ae08f | 70270 | 3b588c80 | IMAGE-FIX · drawImage arg |
| af2acc2 | 70270 | 3b588c80 | BASELINE-A · L-73 lineHeight من font header |
| 941955b | 70270 | 3b588c80 | CARD-COMPLETE · runLogo + demo-live |
| aa6ade2 | 70270 | 3b588c80 | 99-SCRIM-CONTRAST · opacity=0.86 |
| **e3ea574** | **70187** | **16170c2a** | **99G-SOURCE-LEFT · PlacementSpec.align + runSource** |
| **23f1d90** | **54337** | **317cbee1** | **107 · طور تراجع ثالث مخفَّف بدل معطَّل — يمنع orphan-prep** |
| eb8f02e | 54337 | 317cbee1 | مَرافئ display brand |
| a561c16 | 54337 | 317cbee1 | _AMEND-300b |
| 1d45fd4 | 54337 | 317cbee1 | _AMEND-300c |
| 6e6519e | 54337 | 317cbee1 | bidi latin pass-through |

**نقلتان قابلتان للتمييز:**

- **نقلة ١ · `e3ea574`** (`aa6ade2 → e3ea574` · 70270 → 70187): تغيّرٌ صغير. رسالة الـcommit تصفُه صراحةً: «قرار المالك (أسلوب البيت): سطر الوكالة في «عاجل» يُحاذي الحافّة اليسرى لكتلة العنوان، لا اليمنى». **هذا هو انتقالُ سطرِ المصدرِ يميناً ← يساراً** الذي وصفتْه التذكرة.

- **نقلة ٢ · `23f1d90`** (`e3ea574 → 23f1d90` · 70187 → 54337 · فرقُ 15,850 بايت): تغيّرٌ ضخم. الـcommit يعدّل الطورَ الثالث في سلّم التراجع الدلاليّ داخل `wrap-optimal.ts` من `disabled (INF→undefined)` إلى `soft (INF→8000)`. الغايةُ المعلَنة: منع orphan-prep («على» يتيم في نهاية سطر). القياسُ في الـcommit: 4 orphan-prep في 50 عنواناً → 0.

### ٢.٤ · هل إطفاءُ التطويل مقصود؟

**سطر المصدر يسار (نقلة ١):** **مقصود.** «قرار المالك (أسلوب البيت)» — نصٌّ في الرسالة، والتغييرُ في `packages/shared/src/default-brand.ts:241` (`source.align = 'left'`) وليس في `templates/breaking.json`. الهويّةُ تحمل القرار.

**اختفاءُ التطويل (نقلة ٢):** **أثرٌ جانبيٌّ لم يُلحَظ في وقته** — بدرجةٍ عالية. الأدلّة:
1. الرسالةُ لا تذكرُ التطويل إطلاقاً — الغايةُ orphan-prep على 50 عنواناً غير هذا العنوان.
2. الـcommit يقول صراحةً: «الشرط الحاكم (اللقطات لم تُحدَّث): verify:snapshot سيُشغَّل داخل mk-ci — **إن تحرّكت لقطة سأعرض قبل/بعد للمالك · لا تحديث بلا إذن**». أي أنّ المؤلّفَ أدركَ إمكانَ تحريكِ اللقطات، لكن حالةَ هذا العنوان بالذاتِ لم تُعرَض على المالك بقبل/بعد.
3. الفرقُ 15,850 بايت في PNG (على نفس الأبعاد 1080×1350) كبيرٌ جدّاً على تغيير penalty الدلالة الرابعة — يوافقُ فرضيّةَ **تغيّرِ عددِ الأسطر** (3→2) الذي بدورِه يُلغي حاجةَ السطر إلى بلوغِ العرض فيُلغي استدعاءَ الكشيدة.

هذا يوافقُ تحفّظَ التذكرة: «قد يكون غيابُ التطويل نتيجةً لا سبباً — المدُّ يُستدعى حين يحتاج السطرُ بلوغَ العرض؛ فإن تغيّر حسابُ اللفّ أوّلاً فقد لا يُستدعى أصلاً». الكشيدةُ ذاتُها لم تُعطَّل — الأسطرُ صارت لا تحتاجها.

### ٢.٥ · حدودُ ما رأيتُه

- لم أفتحْ اللقطاتِ بالعين لأعدَّ الأسطر رقميّاً — قِستُ md5 وحجمَ الملف. **الفرقُ في md5 وحده لا يُثبت 3→2 أسطر؛ يُثبت اختلافَ محتوى الإطار.** فرضيّةُ اختفاءِ التطويل مبنيّةٌ على (أ) تطابق كتلة PNG قبلَ e3ea574 مع كتلة رأيتَها في المرجع، و(ب) رسالةُ الـcommit التي تصفُ الآليّة.
- كلُّ PNGاتِ التنصيف محفوظةٌ في `/tmp/mk-454-bisect/out/bisect/v3-frame-t2-<sha>.png` — worktree زال، فالملفّاتُ عابرة. **إن أردتَ أن أُعيدَ استخراجَها إلى `claude/reports/454-frames/` قبل حذفِ /tmp، أخبرْني**. لم أفعلْ ذلك تلقائيّاً لأنّ التذكرة قالت «لا تُجمّدْ مرجعاً، ولا تلمسْ snapshots-video/».
- لم أُصلحْ شيئاً في §٢، ولم ألمسْ ملفّاً مقفلاً (`kashida.ts · wrap-optimal.ts · semantic-break.ts`).

---

## §٣ · الدفعة

**الملفّات المعدَّلة:**
- `packages/db/scripts/verify-isolation.mjs` — DELETE-only بدل TRUNCATE · SET LOCAL قبل DELETE على tenants (RLS) · اختيار صفّ tenant_B الخاص في السلبيّة · استثناء globals في `no-set-local` لـtemplates.

**الملفّ الجديد:**
- `claude/reports/454-THE-TRUNCATE-AND-THE-KASHIDA.md` (هذا).

**Push واحد.**

---

## §٤ · حدود ما فعلتُه

- **§١:** بديلٌ أضيق للـTRUNCATE · لا لمس لسياساتِ RLS · لا لمسٍ لـmigrationات · لا استثناءَ في verifier آخر · إثباتٌ ثلاثيّ بالتنفيذ.
- **§٢:** تحقيقٌ فقط · commit المتّهم `23f1d90` مُعيَّن ودورُه موصوفٌ باحتراس · لم أُصلحْ ولم أُجمِّدْ ولم ألمسْ اللقطات · القرار للمالك.
- **لا سرَّ قُرِئ ولا طُبع.** JWT/AI keys محلّية عابرة من openssl لكلّ إثبات.
- **لا لمسَ لملفٍ مقفل.** kashida.ts · wrap-optimal.ts · semantic-break.ts قُرِئت أسماؤها في git log/diff فقط.
- **worktree /tmp/mk-454-bisect** أُنشئ عبر `git worktree add --detach`، أُعيدت الفروع بـ`git worktree remove --force` بعد الاستخدام — الشجرةُ الحيّة لم تُلمَس بـcheckout.

**موقوف. أنتظرُ قرارَك في §٢، وأراقبُ CI بعد الدفع.**
