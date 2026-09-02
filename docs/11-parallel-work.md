# 11 — إطار العمل المتوازي

> يُقرأ في بداية أي جلسة تعمل على فرع غير `main`.

## المبدأ

التوازي ينجح حيث **لا تتداخل الملفات**. كل مسار يملك مجلده وفرعه وجلسة tmux خاصة به، ولا يلمس ملفات مسار آخر.

**عنق الزجاجة هو المراجعة لا الكتابة.** جلستان بمراجعة نصف منتبهة أسوأ من جلسة بمراجعة كاملة. لا تفتح مساراً ثالثاً قبل أن يستقر الثاني.

---

## المسارات

| المسار | الفرع | المجلد | الملفات المملوكة |
|---|---|---|---|
| **M — الرئيسي** | `main` | `~/MediaKit/pf-mediakit` | `packages/engine` · `packages/templates` · `PHASES.md` |
| **D — اللوحات** | `feat/dashboards` | `~/MediaKit/pf-mediakit-dash` | `apps/dashboard` · طبقة قراءة في `apps/renderer` |
| **T — الخط الزمني** | `feat/timeline-editor` | `~/MediaKit/pf-mediakit-tl` | `packages/engine/src/timeline/` · `apps/studio/timeline` |
| **P — المنصة** | `feat/platform` | `~/MediaKit/pf-mediakit-api` | `apps/api` · `infra/` · المخطط |

**P مؤجَّل** حتى تُحسم قرارات المصادقة والاشتراكات.

---

## ملكية الملفات — القاعدة الحاكمة

كل ملف يملكه **مسار واحد فقط**. من يحتاج تعديل ملف لا يملكه، يطلبه من مالكه لا يعدّله.

### ملفات مقفلة على `main` حصراً

```
packages/engine/src/text/wrap-optimal.ts
packages/engine/src/text/kashida.ts
packages/engine/src/text/semantic-break.ts
packages/engine/src/render.ts
packages/engine/src/render-plan.ts
packages/shared/src/brand-kit.ts
packages/shared/src/default-brand.ts
snapshots/ · snapshots-semantic/
PHASES.md · CLAUDE.md · docs/LESSONS.md
```

**السبب:** هذه أدق كود في المشروع، وتعارض دمج فيها يكلّف أكثر مما يوفّره التوازي.

### استثناء الخط الزمني

مسار **T** يحتاج `render-plan.ts` و`brand-kit.ts`. الحل: يكتب **ملفات جديدة** ويطلب من `main` تعديلاً واحداً في نهاية المسار لربطها.

```
timeline/plan-extension.ts   ← جديد، يمتد لا يعدّل
shared/src/timeline-types.ts ← جديد
```

---

## الإعداد

**[الميني]** مرة واحدة:

```bash
cd ~/MediaKit/pf-mediakit

git worktree add ../pf-mediakit-dash -b feat/dashboards
git worktree add ../pf-mediakit-tl   -b feat/timeline-editor

git worktree list
```

`worktree` يعطي مجلدات مستقلة بفروع مختلفة، تشترك في تاريخ Git واحد — بلا استنساخ مكرر.

### جلسات tmux

```bash
tmux new -d -s mk-main  -c ~/MediaKit/pf-mediakit
tmux new -d -s mk-dash  -c ~/MediaKit/pf-mediakit-dash
tmux new -d -s mk-tl    -c ~/MediaKit/pf-mediakit-tl
```

اختصارات في `~/.zshrc`:
```bash
alias mkm='tmux a -t mk-main -d 2>/dev/null || tmux new -s mk-main -c ~/MediaKit/pf-mediakit'
alias mkd='tmux a -t mk-dash -d 2>/dev/null || tmux new -s mk-dash -c ~/MediaKit/pf-mediakit-dash'
alias mkt='tmux a -t mk-tl -d 2>/dev/null || tmux new -s mk-tl -c ~/MediaKit/pf-mediakit-tl'
```

### تحقق قبل كل جلسة عمل

```bash
tmux display-message -p '#S' && pwd && git branch --show-current
```

ثلاثة أسطر تمنع أكثر خطأ محتمل: العمل في الفرع الخطأ.

---

## التوثيق

`PHASES.md` يملكه `main` وحده. كل مسار فرعي يكتب في ملفه:

```
PHASES-dashboards.md
PHASES-timeline.md
```

يُدمج محتواها في `PHASES.md` عند اندماج الفرع، بواسطة جلسة `main`.

**`LESSONS.md` يملكه `main`.** الدروس من المسارات الفرعية تُبلَّغ في تقرير الجلسة، وتُكتب في `main`.

---

## المزامنة

**من `main` إلى الفروع** — كل يوم أو عند تغيير مهم:

```bash
cd ~/MediaKit/pf-mediakit-dash
git fetch origin
git rebase origin/main
```

`rebase` لا `merge` — يبقي التاريخ خطياً ويقلّل التعارضات.

**من الفرع إلى `main`** — عند اكتمال المسار:

1. الفرع يمرّر كل البوابات: `pnpm test` · `verify:snapshot` · `check:engine-purity`
2. `rebase` أخير على `main`
3. مراجعتك للمخرج البصري
4. دمج في جلسة `main` حصراً

---

## قواعد لكل جلسة فرعية

تُلصق في بداية أي جلسة على فرع غير `main`:

```
أنت على فرع <NAME> في مجلد <PATH>، ضمن عمل متوازي.

اقرأ: CLAUDE.md · docs/11-parallel-work.md · PHASES-<NAME>.md

ممنوع تعديل الملفات المقفلة على main (القائمة في docs/11).
إن احتجت تعديل أحدها — توقّف وأخبرني، لا تعدّله.

اكتب حالتك في PHASES-<NAME>.md لا في PHASES.md.
الدروس أبلغها في تقريرك، لا تكتبها في LESSONS.md.

تحقّق من فرعك قبل أي commit: git branch --show-current
```

---

## العزل عن منهاج — يبقى سارياً

المسارات الثلاثة كلها ضمن نفس قواعد `CLAUDE.md`:
- منافذ 19000–19099 حصراً. **وزّعها:** main 19000–19029 · dash 19030–19059 · tl 19060–19089
- Redis على قاعدة 3 ببادئة `pf-mediakit` — مشتركة بين المسارات، لا تعارض
- ممنوع أي `prune` أو لمس `~/Minhaj` و`~/PrimeMind`
- لا Colima في المسارات الفرعية

---

## متى تتوقف عن التوازي

| المؤشر | الإجراء |
|---|---|
| تعارض دمج في ملف مقفل | أوقف المسار الفرعي، أصلح في `main` |
| مراجعتك تتأخر أكثر من يوم | أغلق مساراً |
| ثلاثة مسارات وأنت وحدك | أغلق الثالث — المراجعة هي القيد |
| اللقطات الذهبية تنكسر في فرع | أوقف كل شيء، شخّص أولاً |

---

## الترتيب المقترح

**الآن:** `main` + `dash`. اختبر النموذج على المسار الأخف.

**بعد استقرار dash:** أضف `tl`.

**`platform` مؤجَّل** — يحتاج قرارات معمارية غير محسومة (مزوّد المصادقة، الاشتراكات، عزل قواعد البيانات). بناؤه متوازياً يعني اتخاذ تلك القرارات بلا نقاش.
