# GATE-RECIPES — وصفات تحمير البوّابات (L-46 موحَّد)

**السياق (2026-09-11 · 110-RECIPES-FOR-B):** جرد 100-RED-ON-DEMAND وضع 16 بوّابة في صنف (ب) — «تحمرّ حين يُكسر ما تحرسه، لكنّ الوصفة غير مكتوبة». هذا الملفّ يحمل الوصفة لكلّ واحدة: **ما الذي أُغيّره لأراها حمراء، وكيف أُرجعه**، بشكلٍ يُتحقَّق منه من لم يكتب البوّابة بعد شهر.

## القاعدة الآمنة — قبل أيّ كسر مقصود

**تكون شجرتك العاملة نظيفة قبل البدء** (`git status --short` فارغ عدا `.claude/` وشبيهاتها). لأيّ كسر يحتاج **التزاماً** (وليس مجرد تعديل ملفّ):

- **الطريق الأنقى** — `git worktree add /tmp/<اسم> HEAD` — التزم في المؤقّتة بلا مسّ الحيّة. أزل بـ`git worktree remove --force`.
- **إن اضطررت للحيّة** — استخدم `git checkout <ملفّ>` للإرجاع فقط. **لا `git reset --hard` ولا `git clean`.** كلاهما يمحو عملاً غير مدفوع بلا نسخة.

**كلّ وصفة أدناه تُبلَّغ نتائجها في `/tmp/gate-recipes/<n>-<اسم>.log` عند التحقّق.** أرقام التشغيل والسجلّات في `claude/reports/110-RECIPES-FOR-B.md`.

---

## check:*

### 1. `check:doc-paths`

- **الكسر:** أضف `المسار: out/canary-110.png` (خارج code fence) في نهاية `docs/M1-marketing-assets.md`.
- **الفشل المتوقّع:** `✗ 1 إحالة إلى out/ من وثيقة تسويقية: docs/M1-marketing-assets.md:<سطر> — «out/canary-110.png»`.
- **الإرجاع:** `git checkout docs/M1-marketing-assets.md`.

### 2. `check:lessons-sequence`

- **الكسر:** أضف عنواناً `## L-1 — canary duplicate` (أو أيّ رقم مستعمل) في نهاية `docs/LESSONS.md`.
- **الفشل المتوقّع:** `✗ أرقام مكرَّرة (1): L-1`.
- **الإرجاع:** `git checkout docs/LESSONS.md`.

### 3. `check:no-git-internals`

- **الكسر:** أنشئ `scripts/__canary-110.mjs` يحوي:
  ```js
  import { writeFileSync } from 'node:fs';
  writeFileSync('.git/HEAD', 'x');
  ```
- **الفشل المتوقّع:** `✗ 1 مخالفة/مخالفات: scripts/__canary-110.mjs:3 — عملية «writeFileSync»`.
- **الإرجاع:** `rm scripts/__canary-110.mjs`.

### 4. `check:script-paths`

- **الكسر:** في `package.json`، أضف مفتاحاً في `scripts`:
  ```json
  "__canary-110": "node scripts/__nonexistent-canary-110.mjs"
  ```
- **الفشل المتوقّع:** `✗ check-script-paths FAILED — 1 مخالفة/مخالفات · missing: scripts/__nonexistent-canary-110.mjs`.
- **الإرجاع:** `git checkout package.json`.

### 5. `check:skill-fresh`

الفاحص يقارن `git show HEAD:docs/SKILL-mediakit.md` بمولَّد `pnpm skill:build --stdout`. يحتاج **التزاماً** ليختلفا.

- **الكسر (worktree · الطريق الآمن):**
  1. `git worktree add /tmp/wt-skill HEAD`
  2. `cd /tmp/wt-skill && ln -sf $OLDPWD/node_modules .`
  3. `echo "<!-- canary-110 -->" >> docs/SKILL-mediakit.md`
  4. `git -c user.email=canary@local -c user.name=canary commit -am "TEMP canary"`
  5. `pnpm check:skill-fresh` → **red**
- **الفشل المتوقّع:** `✗ السكيل المُلتزَم قديم — شغّل pnpm skill:build والتزم`.
- **الإرجاع:** `cd - && git worktree remove --force /tmp/wt-skill`.

### 6. `check:docs-bundle-fresh`

نفس نمط `check:skill-fresh` — يقارن HEAD المُلتزَم مع مولَّد `pnpm docs:bundle --stdout`.

- **الكسر:** كـرقم 5 لكن على `docs/BUNDLE.md`.
- **الفشل المتوقّع:** `✗ الحزمة المُلتزَمة قديمة — شغّل pnpm docs:bundle والتزم`.
- **الإرجاع:** `git worktree remove --force /tmp/wt-bundle`.

---

## vitest run — الخندق

### 7. `vitest run` — kashida.test.ts

- **الكسر (worktree):** في `/tmp/wt-vitest`، أضف في نهاية `packages/engine/src/text/kashida.test.ts`:
  ```ts
  describe('L46-canary-110', () => {
    it('canary fails intentionally', () => {
      expect(1).toBe(2);
    });
  });
  ```
- **الفشل المتوقّع:** `Test Files 1 failed (1) · Tests 1 failed | 20 passed (21)` + سطر `❯ packages/engine/src/text/kashida.test.ts:<سطر>:<عمود>`.
- **الإرجاع:** `git worktree remove --force /tmp/wt-vitest`.

**البديل:** أيّ ملفّ `*.test.ts` في `packages/engine/src/text/` (bidi · semantic-break · diacritics-interaction · wrap-optimal · …). كسر أيّ توقّع فيه يُنتج فشلاً مسمّى.

---

## verify:* — الرندر والخندق

### 8. `verify:snapshot` (خندق · مرجع Linux)

- **الكسر (على macOS):** لا حاجة لأيّ تعديل — `pnpm verify:snapshot` يفشل ذاتيّاً بـplatform-guard.
- **الفشل المتوقّع:** `✗ verify-snapshot: هذا المرجع لينكس حصراً. المنصّة الحاليّة: darwin · المطلوبة: linux` — يوجّه إلى `./bin/mk-ci`.
- **الإرجاع:** لا شيء — لم يُعدَّل ملفّ.
- **الوصفة على Linux (`./bin/mk-ci`):** أضف بايتاً في نهاية `snapshots/preview-default.png` — الفاحص يفشل على byte-diff.

### 9. `verify:plan-values` (خندق · مرجع Linux)

- **الكسر (على macOS):** `pnpm verify:plan-values` → platform-guard.
- **الفشل المتوقّع:** `✗ verify-plan-values: هذا المرجع لينكس حصراً`.
- **الوصفة على Linux:** غيّر قيمة `fontSize` في أيّ `snapshots-plan/*.json` → deep-equal يفشل.

### 10. `verify:breaking-video` (خندق · مرجع Linux)

- **الكسر (على macOS):** `pnpm verify:breaking-video` → platform-guard.
- **الفشل المتوقّع:** `✗ verify-breaking-video: هذا المرجع لينكس حصراً`.
- **الوصفة على Linux:** غيّر حرفاً في `snapshots-video/breaking.md5` → md5 مرجعيّ ≠ فعليّ.

### 11. `verify:render-video-all-templates`

- **الكسر (worktree):** `sed -i.bak 's/TIME_THRESHOLD_MS = 5000/TIME_THRESHOLD_MS = 1/' scripts/verify-render-video-all-templates.mjs`.
- **الفشل المتوقّع:** `✗ verify-render-video-all-templates FAILED — 0 فشل · 0 in-loop · 6 بطء · بطء: breaking = <ms> (أعلى من 1ms)` (سستّة قوالب).
- **الإرجاع:** `git worktree remove --force /tmp/wt-render-all`.

### 12. `verify:audio-gate`

- **الكسر (worktree):** `sed -i.bak 's/size > 100_000/size > 10_000_000/' scripts/verify-audio-gate.mjs`.
- **الفشل المتوقّع:** جدول البوّابات الثلاث، `MP4 حجم واقعي · > 100KB · 146KB · ✗` + `✗ بوابة كمّية فاشلة`.
- **الإرجاع:** `git worktree remove --force /tmp/wt-audio`.

### 13. `verify:media-track-gate`

- **الكسر (worktree):** `sed -i.bak 's/perfRatio <= 1.5/perfRatio <= 0.01/' scripts/verify-media-track-gate.mjs`.
- **الفشل المتوقّع:** `الأداء (media/breaking) · ≤ 1.5× · 0.86× · ✗` + `✗ بوابة فاشلة`.
- **الإرجاع:** `git worktree remove --force /tmp/wt-media`.

### 14. `verify:text-tracks-gate` (خندق — يحرس ثبات الكشيدة عبر الإطارات)

- **الكسر (worktree):** `sed -i.bak 's/perfRatio <= 1.5/perfRatio <= 0.01/' scripts/verify-text-tracks-gate.mjs`.
- **الفشل المتوقّع:** `الأداء (text/breaking) · ≤ 1.5× · 1.11× · ✗` + `✗ بوابة فاشلة`. **البقيّة تمرّ — بينها «ثبات الكشيدة (md5 إطارَين) · متطابق · ✓» فيبقى موات الخندق مُغطًّى.**
- **الإرجاع:** `git worktree remove --force /tmp/wt-text`.

### 15. `verify:transitions-gate`

- **الكسر (worktree):** `sed -i.bak 's/perfRatio <= 1.5/perfRatio <= 0.01/' scripts/verify-transitions-gate.mjs`.
- **الفشل المتوقّع:** `الأداء (transitions/breaking) · ≤ 1.5× · 1.10× · ✗` + `✗ بوابة فاشلة (كمّياً)`.
- **الإرجاع:** `git worktree remove --force /tmp/wt-transitions`.

### 16. `verify:plan-all-templates`

**قيد:** `@pf-mediakit/templates` يستورد عبر workspace symlink — تعديل `plain.json` في worktree لا يُرى (node_modules يشير إلى المستودع الأصليّ). الكسر يقع على الشجرة الحيّة مع `git checkout` كإرجاع ذرّيّ.

- **قبل البدء:** تحقّق `git status --short` = `?? .claude/` فقط (أو فارغ).
- **الكسر:** `echo "GARBAGE-CANARY-110" >> packages/templates/src/templates/plain.json` — يُنتِج JSON غير صالح.
- **الفشل المتوقّع:** `SyntaxError` من `JSON.parse` عند تحميل `plain.json` (stack يذكر `TEMPLATES` import) + `ELIFECYCLE Command failed with exit code 1`.
- **الإرجاع:** `git checkout packages/templates/src/templates/plain.json`.

---

## القاعدة على الجميع

1. **قبل الكسر:** `git status --short` نظيف (عدا `.claude/`).
2. **بعد الإرجاع:** `git status --short` نظيف كما كان + شغّل البوّابة ثانيةً وتأكّد من `✓ green`.
3. **إن فشلت البوّابة في الاحمرار رغم الكسر:** أوقف واكتب — تلك بوّابة لا تحرس ما يبدو أنّها تحرس (الصنف الثالث الذي طارد `verify:tashkil-collision` 8 ساعات).

**الوصفات مُختبَرة يوم 2026-09-11** — أرقام التشغيل والسطور الحرفيّة في `claude/reports/110-RECIPES-FOR-B.md`.
