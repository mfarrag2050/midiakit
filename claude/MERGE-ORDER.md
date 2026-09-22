# ترتيبُ الدمج · طابور main

**قاعدة:** كلُّ سطرٍ حالةُ عملٍ في شجرة main بانتظار دفعٍ · بترتيب الجاهزيّة. بعد الدفع يُحذف السطر.

---

## 2026-09-15 · 411ب + 411ج — سُدَّ فخّ نسخ اللقطات + `align` منطقيّ عبر المرآة

**الحال:** مُلتزَم على main محلّيّاً · **لم يُدفَع** (بأمر المالك).

**ما فيه:**
- 411ب: `bin/mk-ci --regen-refs` صار حقيقيّاً · `scripts/regen-visual-refs.mjs` + `scripts/check-snapshots-not-all-copies.mjs` (موصولٌ في `pnpm test`) · `snapshots/*.png` مجدَّدة (2 · درفت 99G مقبول بعد إصلاح الجذر) · `snapshots-semantic/*.png` مجدَّدة (3 · فخّ النسخ سُدَّ).
- 411ج: `packages/engine/src/locale.ts:82` — `maybeMirror` يعكس `align` مع `anchor` عند `mirrorOnLTR=true`. `scripts/411c-prove-align-mirror.mjs` برهانٌ لفظيّ (Arabic بلا تغيير · Latin `left→right`).
- L-138 في `claude/inbox/README.md`: «رسالةُ الالتزام دعوى لا دليل».
- التقرير في `claude/reports/411b-THE-REFERENCE-ITSELF.md`.

**قبل الدفع:** يراجع المالك `git diff HEAD~1 HEAD` (خصوصاً الملفّات المرجعيّة binary).

**ترتيبه في القافلة:** يسبق دمج `feat/api` و `feat/ci` (BRANCHES.md §١) لأنّ `check:snapshots-not-all-copies` صار جزءاً من `pnpm test` — الفروعُ التي لا تحمل تجديدَ `snapshots-semantic/` ستحمرّ عند الدمج.
