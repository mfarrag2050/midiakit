# PHASES — فرع feat/dashboards

> يُدمج في `PHASES.md` من جلسة `main` عند اكتمال الفرع (docs/11 §التوثيق).
> لا تعدّل `PHASES.md` من هذا الفرع.

## المرحلة 3.2 — لوحات التحكم ☑ (2026-09-02)

**السياق:** عملاء من خلفية الجزيرة يحتاجون رؤية وثقة لا مرونة فعلية
(docs/08 §المبدأ). الشفافية تُشترى؛ الانتظار المعروف مقبول والمجهول مرفوض.

**النطاق:** طبقة قراءة + لوحة عميل + لوحة تشغيل + إجراءات إدارية + بذرة تنبيهات.

### الملفات الجديدة

- `apps/renderer/src/observe.ts` — طبقة قراءة خالصة. لا تعديل على
  `queues.ts` أو `worker.ts` (قيد فرع dash: مقفلان على main).
  - `queueDepth()` — عمق كل طابور مع `paused` و `concurrency`
  - `activeJobs()` — المهام النشطة مع `ageMs` و `progress`
  - `jobPosition(jobId)` — موقع + `expectedStartSec` (الصيغة أدناه)
  - `tenantJobs(tenantId)` — كل مهام مستأجر عبر الطوابير
  - `failureRate(hours)` — نسبة الفشل + تصنيف الأسباب بـregex
  - `resourceUsage()` — معالج/ذاكرة/قرص (df -k -P)
  - `tenantDistribution()` — توزيع بين العملاء (يُقاطع مع عدّاد Redis)
  - `systemStatus()` — normal | degraded | maintenance
- `apps/renderer/src/alerts.ts` — واجهة webhook مع de-dup في Redis
  (SET NX EX). العتبات: قرص>80% · طابور>10 · عامل معلّق>5د · فشل مهمة.
  لا تكامل تيليجرام (webhook تكفي — L-dash-2 أدناه).
- `apps/dashboard/` — Next.js 14 على منفذ 19030
  - `/client` — لوحة عميل. تعرض: «مهمتك رقم N — تبدأ خلال Xث» أو
    «مهمتك تعمل الآن — Y٪». Polling كل 3 ثوانٍ.
  - `/ops` — لوحة تشغيل. أعمدة الطوابير + المهام النشطة + الفشل +
    الموارد + التوزيع + عتبات + إجراءات.
  - `/api/client`, `/api/ops`, `/api/ops/action` — REST خفيف.
- `scripts/dashboard-eta-check.mjs` — بوابة دقة التقدير.
- `scripts/dashboard-screenshot.mjs` — Chrome headless للقطات إثبات.

### صيغة التقدير (docs/08 §لوحة العميل — «الانتظار المعروف»)

مع `c` عمّال متوازيين ومتوسط زمن معالجة `avgMs`:
```
expectedStartSec = floor((position - 1) / c) * avgMs / 1000
```

`avgMs` مُشتق من آخر 20 مهمة مكتملة لكل طابور. عند غياب المكتملات،
افتراضيات محافظة: urgent=3s · normal=5s · edit=60s · batch=30s.

الصيغة الأولى `(position-1) * avgMs / c` كانت خطأ (تعطي pos=2 حين c=2:
1.5s بدل 0). كُشف بالبوابة (L-dash-1 أدناه).

### الإجراءات الإدارية — ما هو ممكن بلا تعديل worker.ts

قيد فرع dash يمنع لمس `worker.ts`، لذا:

| الإجراء | يعمل | ملاحظة |
|---|---|---|
| حذف مهمة (waiting/delayed) | ✅ | `Queue.getJob(id).remove()` |
| حذف مهمة نشطة | ❌ | يتطلب token من العامل — نُرجع 409 |
| إيقاف/استئناف طابور | ✅ | `Queue.pause()/resume()` — يمنع سحب مهام جديدة |
| تفعيل/إنهاء الصيانة | ✅ | علم Redis + pause كل الطوابير |
| تعيين `WORKER_COUNT` | ◐ | يُخزَّن في Redis؛ يتفعّل عند إعادة تشغيل العامل يدوياً |

### البوابة — دقة التقدير (2026-09-02 ✅)

`scripts/dashboard-eta-check.mjs`: 6 مهام urgent قبل تشغيل العمّال،
نقيس expected من `observe.jobPosition` عند الإدخال ونقارنه بـactual
من `QueueEvents.active`.

**النتيجة:**
- الوسيط \|الخطأ\|: **5.5%** (البوابة ≤ 30% — عبرت بهامش ×5.5)
- المتوسط \|الخطأ\|: 3.1%
- كل التقديرات ضمن ±21% من الفعلي (أسوأ حالة)

**اختبار الذروة (`scripts/test-peak-load.mjs`):** 9/9 مكتملة، أقصى wait
12.10s (البوابة ≤45s). round-robin واضح. لم يتأثر بتعديلات observe.

### اللقطات (2026-09-02 ✅)

`apps/dashboard/screenshots/`:
- `ops-in-flight.png` — لوحة تشغيل و2 مهام نشطة (urgent 2/2 عمّال)،
  عتبات معبأة (قرص 23.5%، طابور 0/10، مهمة أقدم 0/300ث)، تصنيف عملاء
  (eta-test-tenant: نشطة 2)، موارد النظام (2.16/2.39 حِمل، 23.4/24 GB
  ذاكرة، 108/460.4 GB قرص).
- `client-in-flight.png` — لوحة عميل بحالة نشطة: «مهمتك تعمل الآن — 0٪»
  ومسرد المهام النشطة.
- `ops-completed.png`, `client-empty.png` — حالة النظام بعد الاكتمال.

### دروس (تُبلَّغ لتُكتب في LESSONS.md من main)

**L-dash-1 — القسمة على المتوازي، لا الضرب بها.**
كتبت `expectedStartSec = (position - 1) * avgMs / concurrency / 1000`.
مع c=2 وavg=3s: pos=2 → 1.5s المتوقعة، والفعلي 0s (لأن ثاني مهمة تبدأ
بالتوازي مع الأولى). الخطأ 100%.

*التطبيق:* حين c عمّال متوازيين، المهمة رقم p تبدأ عند
`floor((p-1)/c) * avg`. لا `(p-1)*avg/c`. الفرق: الأول يتدرج بخطوات
بحجم `c`؛ الثاني يتدرج بلا خطوة. جرِّبها ذهنياً بـp=1,2,3,4,c=2.

**L-dash-2 — BullMQ 5 يفصل «prioritized» عن «waiting».**
كل مهامنا لها priority (الحصة العادلة)، فتدخل مجموعة "prioritized"
لا "waiting". `getState()` يعيد `'prioritized'` لا `'waiting'`،
و`getWaiting()` لا يشملها، و`getJobCounts()` يحتاج المفتاح صراحةً.

*التطبيق:* أي كود يستعمل BullMQ 5 مع priority يجب أن يجمع
`prioritized + waiting` في كل تعداد ويعالج `prioritized` كحالة انتظار.

**L-dash-3 — Next.js + workspace ESM يحتاجان webpack alias يدوي.**
`import './queues.js'` من ملف TS يعمل مع tsx (moduleResolution: bundler)
لكن Next webpack لا يعرف كيف يحلّه. الحل:
```js
config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
```
كذلك skia-canvas (الترانزيتيف عبر renderer→worker) يجب استبعاده من
الحزمة عبر `serverComponentsExternalPackages`.

*التطبيق:* أي app جديد يستهلك حزم TypeScript ESM من workspace: أضف
هذين للـnext.config.mjs.

**L-dash-4 — الصيانة تعني إيقاف الطوابير، لا مجرد علم.**
البداية كانت: علم Redis يقرأه `systemStatus`. لكن العميل الذي يُدخل
مهمة أثناء الصيانة، تدخل الطابور وتُنفَّذ فوراً. الصيانة يجب أن تشمل
`Queue.pause()` لكل الطوابير لتمنع السحب.

*التطبيق:* حين تُصمَّم «حالة نظام»، اسأل: ما الذي يجب أن يتوقف فعلاً؟
لا تكتفِ بعلامة عرض؛ اقفل السلوك المنطقي.

### دَين مقصود (يُنقل لاحقاً)

- **البيانات الخارجية:** «سجل التصديرات 30 يوماً» و«استهلاك الشهر»
  ينتظران PostgreSQL (المرحلة 4). الآن يعرضان placeholder بلا وعد كاذب.
- **إعادة تشغيل العامل تلقائياً من اللوحة:** يتطلب Redis pub/sub
  يستقبله worker.ts — مقفل على main. اللوحة تخزّن `WORKER_COUNT` في
  Redis كإرشاد، والتفعيل يدوي.
- **قتل مهمة نشطة:** يتطلب token من العامل. المسار الحالي: 409 مع
  رسالة توجّه لإيقاف العامل يدوياً.
- **الويب هوك مُهيَّأ لكنه غير مربوط بمصدر تنفيذ.** المستدعي يستدعي
  `runAlertCycle()` من cron/loop. لم يُضف job مجدول بعد.

### التبعيات المضافة

- `next@14.2.15`, `react@18.3.1`, `react-dom@18.3.1`
- `tailwindcss@3.4.14`, `postcss@8.4.47`, `autoprefixer@10.4.20`
- Chrome 152 مطلوب فقط لتشغيل `dashboard-screenshot.mjs`؛ اللوحة نفسها
  تعمل في أي متصفح حديث.

### القيد الحاكم — الملفات المقفلة على main

لم يُلمس أيّ من:
- `apps/renderer/src/queues.ts`
- `apps/renderer/src/worker.ts`
- `apps/renderer/src/validate.ts`
- `apps/renderer/src/index.ts`
- `apps/renderer/src/cli.ts`
- أيّ من `packages/**`

التعديل الوحيد على renderer: `package.json` (إضافة `./observe` و
`./alerts` في `exports`). هذا نمط مقبول (إضافة لا تعديل).

### التالي (يقرّره main عند الدمج)

- تشغيل `runAlertCycle` كل 30 ثانية عبر cron خارجي أو job BullMQ
  مكرر (`repeat`).
- ربط تيليجرام بالويب هوك عبر Vercel webhook أو Cloudflare Worker
  خفيف (docs/08 §المراقبة).
- بعد المرحلة 4 (PostgreSQL): تفعيل «سجل التصديرات» و«الاستهلاك».
