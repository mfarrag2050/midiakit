# CDP flows — أداة إنتاج لقطات المعرض

**الغاية:** كل ملف `scripts/cdp-*.mjs` يستهلك واجهة `apps/studio` عبر
Chrome (Puppeteer CDP)، يمرّ بتدفّق تسليم بعينه، ويُنتج مجموعة PNGs
تُودَع في `demo/studio/`. هذه اللقطات = **مادة مراجعة بشرية للمالك**،
لا مرجع تحقّق آلي.

## السكربتات القائمة

| السكربت | يغطّي | مخرجات في `demo/studio/` |
|---|---|---|
| `cdp-s12.mjs` | S12 كامل — قائمة/إنشاء/محرّر/سير عمل/مراجعات/استعادة/تصدير/حاجز أصول خارجية | `s12-*.png` (١٣ لقطة) |
| `cdp-s14-s15-s16.mjs` | S14 (workflow editor) + S15 (رفض ثلاثيّ + history) + S16 (annotations) — على mock | `s14-*.png` · `s15-*.png` · `s16-*.png` (١٠ لقطات) |
| `cdp-s14-real.mjs` | G-S14-3 على mk-api الحقيقي 19040 (تسليم workflow ضدّ خادم فعلي) | `s14-list-populated-real.png` |

عند إضافة سكربت لتذكرة جديدة: **حدِّث هذا الجدول في التزام السكربت
نفسه**. أداة قائمة بلا توثيق تُنسى — راجع L-54.

## متطلبات التشغيل

**١. Node + pnpm:**
```bash
source ~/.nvm/nvm.sh && nvm use   # v20.18.1 من .nvmrc
```

**٢. Chrome-for-Testing:** يستخدم Puppeteer نسخة معزولة تحت
`~/.cache/puppeteer/chrome/mac_arm-<ver>/`. السكربتات تشير إلى
المسار الحرفي فيها. حين تُحدَّث النسخة، عدِّل `CHROME` في كل ملف
`cdp-*.mjs`. **لا `puppeteer` الكامل** — `puppeteer-core@23` فقط
كـdevDep على مستوى workspace (لا في bundle الإنتاج).

**٣. `apps/studio` يعمل على `http://127.0.0.1:19050`:**
```bash
pnpm --filter @pf-mediakit/studio dev
```

**٤. مصدر البيانات — مبدِّل واحد في `apps/studio/.env.local`:**

```bash
# على mocks (لا يحتاج mk-api أصلاً):
NEXT_PUBLIC_API_MOCK=true

# أو ضدّ mk-api حقيقي:
NEXT_PUBLIC_API_URL=http://127.0.0.1:19040
NEXT_PUBLIC_API_MOCK=false
```

**متى `true` ومتى `false`؟**
- **`true`** حين لا تكون endpoints العقد مبنيّة في mk-api بعد
  (مثال: S12 على mocks لأن §7/§8/§10/§11 خلف SYNC-δ). المرآة في
  `apps/studio/src/api/mock.ts` تطابق شكل `docs/16` حرفياً، فتنفتح
  SYNC لاحقاً وقلب المبدِّل كافٍ.
- **`false`** حين تريد لقطة **على مسار الإنتاج** (S6/S6-FIX/S8/
  S9-S11 التقطت لقطاتها ضدّ mk-api حقيقي على 19040).

## نمط التنقّل: `click`، لا `goto`

**القاعدة:** داخل تدفّق CDP على تطبيق Next.js SPA، **لا تستخدم
`page.goto()` بين مسارات التطبيق**. استعمل نقرة على `<Link>`:

```js
// ❌ يفقد حالة الـmock
await page.goto(`${BASE}/projects/${id}`, ...);

// ✓ SPA client-side navigation — الحالة تبقى
await page.click('a[href^="/projects/prj_"]');
await page.waitForSelector('#fld-title', { timeout: 8000 });
```

**السبب:** `page.goto()` = full page reload = إعادة تحميل JS chunks
= إعادة تهيئة كل modules = **`MOCK_PROJECTS` (وأخواتها) تُصفَّر**.
كل ما أُنشئ خلال التدفّق يختفي. أوّل GET على مسار بعد goto يعود
`NOT_FOUND` — لا لأن الكود مكسور، بل لأن الحالة اختفت.

`page.click('a[href=...]')` يستدعي Next Link (client-side routing)،
JS module الخاص بـmock يبقى محمَّلاً، الحالة سليمة.

**الاستثناء الوحيد:** أوّل انتقال بعد `browser.newPage()` — استخدم
`page.goto()` كي تصل إلى `/login` أوّل مرّة. بعدها كله عبر click.

## أين تُحفظ اللقطات ولماذا

**المسار:** `demo/studio/` (ملتزَم في git).

**لماذا `demo/` وليس `snapshots/`؟** الفرق حاسم — راجع
`CLAUDE.md §مجلدات المخرجات`:

- **`snapshots/` · `snapshots-semantic/` · `snapshots-video/`** =
  **مرجع بايتي**. يُقارن بـmd5. أيّ اختلاف بايت = فشل.
- **`demo/`** = **مادة عرض بشرية**. تُقرأ بالعين، لا بالبايت.

اللقطات هذه **يجب** أن تكون في `demo/`. السبب في L-55: واجهة تتغيّر
تصميمياً باستمرار (لون، مسافة، فونت، ترتيب)، فمقارنة بايتية عليها
تعني **فشلاً دائماً**. الفحص الذي يفشل دائماً يُعطَّل بعد أسبوع،
والفريق يتعوّد تجاهل تنبيهاته. النتيجة: صفر حماية.

الحماية الحقيقية عليها = **عين المالك عند التسليم** (L-17). هذه
اللقطات تُتيح تلك المراجعة.

## نمط Mock: النسخة السطحية عند polling

في `apps/studio/src/api/mock.ts` تجد أنماطاً كهذه:

```js
// عند GET /v1/renders/:id في mock:
return ok(200, { ...r });  // نسخة سطحية، ليس r مباشرة
```

**لماذا؟** React 18 يستخدم `Object.is` للمقارنة قبل إعادة الرسم.
`setState(x)` مع `Object.is(x, prev) === true` = **لا re-render**.
mock يخزّن كائناً واحداً في `Map`، يحدّثه بالتحوّل، ثم يعيده. Polling
يستلم **نفس المرجع** كل مرّة → React يهمل → الواجهة تعلق على
حالة قديمة.

**النسخة السطحية `{ ...r }` = مرجع جديد كل نداء = React يرى تغيير
= إعادة رسم.**

**هذا للـmock وحده.** mk-api الحقيقي يعيد JSON مُفكَّكاً عبر الشبكة،
فكل استجابة تُنشئ كائن جديد فعلاً — لا حاجة لهذا الالتفاف. لا
تُعمِّم القاعدة إلى كود الخادم.

نمط مماثل قد يظهر عند polling لكيانات mock أخرى (renders هنا هو
الأبرز لأن حالته تتحوّل زمنياً). القاعدة: **إن كان الحقل يتحوّل
عبر الوقت داخل mock وتستهلكه واجهة تنتظر تحوّله، أعِد نسخة سطحية.**

## علاقة السكربت بالمرآة L-63

`cdp-*.mjs` لا يعرف شيئاً عن أكواد الأخطاء مباشرة. لكن حين يتغيّر
سلوك mk-api، `pnpm test` يفشل في `check:error-code-coverage` **قبل**
أن تكتشف السكربت الانحراف. الترتيب:

1. mk-api يضيف رمزاً → `origin/feat/api:apps/api/src/errors.ts` يتغيّر.
2. `pnpm test` يفشل → المرآة `scripts/mk-api-error-codes.json` +
   قواميس `packages/i18n/src/{ar,mixed,en}.json` تُحدَّث.
3. بعد اتّزان الحلقتين، `cdp-*.mjs` يعمل على مسار حقيقي بلا مفاجآت.

السكربت لا يستبدل هذا الحرس — يعمل بعده.
