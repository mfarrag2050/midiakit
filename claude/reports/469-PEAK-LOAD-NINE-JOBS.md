# 469 — قياس تسع مهام فعلية على dev

**قياس منفّذ ومعتمد في حكم المالك 04:25Z؛ أُجيز commit+push على feat/api دون دمج. البند 6 ◐.**

> فقرات التوقّف وحالة Git أدناه تسجّل وقت القياس قبل الإذن؛ حكم التسليم الأحدث في نهاية التقرير.

## الحكم

اجتاز العاجلان حدّ البدء: **928ms و927ms** من وقت الإدراج في BullMQ إلى
`renders.started_at`، دون 45000ms لكل منهما. أُنجزت **9/9** مهام فعلياً،
مع **9/9** صفوف DB بحالة `succeeded` و**9/9** مخرجات S3 موجودة.

لكن العيّنة **لم تثبت الحصّة العادلة أو تفعيل سقف المستأجر**: الأولويات
كلها 1 لـnormal/urgent، والترتيب normal هو A,A,B,B,C,C، بلا تأجيل سقف.
لا أساوي ذلك بفشل العدالة العام: أول خمس normal حصلت على الخانات المتاحة،
والسادسة انتظرت. يلزم حمل يتنافس فيه مستأجران على مهام منتظرة فعلاً،
ويصل فيه أحدهم إلى سقفه ثم يحاول تجاوزه. لم أوسّع التجربة بعد هذه النتيجة.

## النطاق ومصدر التنفيذ

- الشجرة: `/Users/mdervis/MediaKit/pf-mediakit-api`؛ الفرع `feat/api`.
- HEAD: `b60e9c97f3bd571e4a459768c1b04557b1ba9dc8`؛ آخر التزام `b60e9c9 feat(api): schedule isolated daily PostgreSQL backups (468b)`.
- الحكم المعتمد: تعديل تصميم القياس من المالك 2026-09-25 · 04:05Z؛ حلّ بوابة الحمولة السابقة صراحةً.
- مصدر `claude/inbox/_answers/cx-mkapi.txt` معروف بحكم المالك: جواب تخطيط 468b عند 02:20Z. بقي كما هو، ولم أُعد تنفيذ تعليماته.
- PostgreSQL: `127.0.0.1:19041/mediakit` بدور `app_user` تحت RLS؛ Redis: `127.0.0.1:19045/0` وبادئة `pf-mediakit`؛ S3 dev: `19043`.
- العامل القائم في `mk-dev-api:worker`؛ لم يُشغّل أو يُطفأ. شهادة إقلاعه تطابق وجهة القياس. عدد المعالجات 10؛ إعلانه: urgent=2، normal=5، edit=1، batch=1، perTenantCap=4.
- `/v1/health` أعاد 200 وحالة `ok` وعاملاً واحداً لكل طابور رندر. يعلن API commit `e79819dc3aa2393cea9ea0ad1669c78ab160cd82`. مقارنة هذا المرجع بـHEAD لا تحمل أي فرق في `api-worker.ts` أو `renderer/queues.ts`؛ فرق API queues يخص إضافة backup وأنواع أسماء الطوابير، لا جسم `computePriority`.
- هذه تجربة dev، وليست قياس VPS أو وعداً لأحمال فيديو أطول.

## ما بُني وطريقة القياس

- `apps/api/scripts/peak-load.mjs`: أداة يدوية بـ`--preflight` أو `--run`، ليست بوابة CI؛ تستورد `enqueueRender` من `apps/api/src/queues/index.ts` فعلياً.
- `apps/api/scripts/peak-load-fixtures.mjs`: مساعد ينشئ ثلاثة مستأجرين اصطناعيين جدداً، وهويات وقوالب ومشاريع وصفوف `renders` حقيقية؛ كل صف يُحفظ قبل الحقن.
- المصدر البصري: `brands/client-demo.json` وقالب `packages/templates/src/templates/plain.json`؛ الخط `Almarai-Regular.ttf` من المشروع، مرخّص **SIL OFL 1.1**. نُسخ الخط إلى S3 لكل مستأجر مع نص الرخصة في metadata. لا شعار ولا اسم مؤسسة قائمة في المخرجات.
- العنوان: «تطوير خدمات المدينة يفتح آفاقاً جديدة لتحسين الحياة اليومية للسكان». PNG بمقاس 1080×1080. تحميل خط فعلي، ورندر skia فعلي، ورفع S3 وتحديث DB؛ لا فشل اصطناعي ولا نوم داخل العامل.
- ست normal (A,A,B,B,C,C)، ثم edit للمستأجر C، ثم urgent للمستأجرين A وB بعد نحو ثانية. normal/urgent عبر `enqueueRender`؛ edit عبر `getQueue('edit').add()` لأن توقيع `enqueueRender` لا يقبل إلا normal أو urgent. لا ادعاء بأنه حسب أولوية edit.
- الحصّة عبر **الأولوية** في API queues، أمّا **سقف المهام النشطة** ففي `api-worker.ts` (`computePerTenantCap` و`processJob`). استدعاء enqueue ليس بحد ذاته تنفيذ السقف؛ العامل الحي هو من ينفّذه.
- القياس يستعمل `job.timestamp` و`processedOn`، ويسجّل أحداث QueueEvents مع Redis stream IDs، ويقرأ `renders.started_at` لتمييز سحب المهمة عن بدء المعالجة بعد السقف.
- نافذة الحقن **1012ms**. أقصى عدد غير منتهٍ **9**؛ أقصى `active` في BullMQ **8**، وأقصى تداخل بين `DB started_at/completed_at` **8**. لا ادعاء بأن تسع مهام كانت ترندر في اللحظة نفسها؛ واحدة تنتظر، بما يوافق سعة الطوابير المستعملة 5+2+1.
- زمن الرندر المقيس `duration_ms` تراوح **1382–2828ms**؛ تقدير 5–15s الوارد في الحكم لم يتحقق لهذه البطاقة، لكن **الازدحام والتداخل تحققا فعلياً** عند دفع العاجل.
- بقيت بيانات التجربة ومخرجاتها للمراجعة؛ لا حذف بلا إذن. جميع المعرفات ومفاتيح المخرجات مثبتة في الأثر الكامل أدناه. لم تتغير بيانات مستأجر قائم.

## القياس 1 — بدء العاجل

| المهمة | queued_at (UTC؛ BullMQ timestamp) | processedOn (UTC) | started_at الفعلي في DB (UTC) | انتظار BullMQ ms | انتظار بدء الرندر ms |
|---|---|---|---|---:|---:|
| 0bc7d469-384c-469b-b5eb-31b6a027e411 | 2026-09-25T04:08:24.551Z | 2026-09-25T04:08:24.817Z | 2026-09-25T04:08:25.479Z | 266 | 928 |
| 18db261b-9369-4c11-bddb-48cc433d03ab | 2026-09-25T04:08:24.553Z | 2026-09-25T04:08:25.043Z | 2026-09-25T04:08:25.480Z | 490 | 927 |

الفرق بين processedOn وDB started_at ظاهر ومقصود؛ الحكم أعلاه يستعمل
الأكبر والأقرب إلى بدء مسار الرندر الفعلي. لا تأجيل cap لأي من المهمتين.

## القياس 2 — ازدحام normal قبل حقن العاجل مباشرة

أُخذت عيّنة normal من `04:08:24.542Z` إلى `04:08:24.545Z`؛ أُدرج أول
urgent عند `04:08:24.551Z`. القراءة متعاقبة وليست لقطة Redis ذرّية؛ حدودها الزمنية محفوظة.

| المستأجر | active | waiting الخام | prioritized | الانتظار الكلي | delayed |
|---|---:|---:|---:|---:|---:|
| A | 2 | 0 | 0 | 0 | 0 |
| B | 2 | 0 | 0 | 0 | 0 |
| C | 1 | 0 | 1 | 1 | 0 |
| المجموع | 5 | 0 | 1 | 1 | 0 |

معرّفات المستأجرين:
- A: `0b38c3d3-9332-48eb-89aa-6d63128f8dec`
- B: `a0ee1170-12cc-4af9-9231-0871a866ea12`
- C: `6a17601e-90b2-4d53-bea4-553e816ac739`

## القياس 3 — الأولوية والترتيب والحصّة

| الترتيب | renderId | tenant_id | priority | started_at (UTC) |
|---:|---|---|---:|---|
| 1 | e66dc778-dfbc-4a51-a6d2-2566cc5bfc16 | 0b38c3d3-9332-48eb-89aa-6d63128f8dec | 1 | 2026-09-25T04:08:23.543Z |
| 2 | 46e50828-99d9-4df4-9e8c-51135e9b691b | 0b38c3d3-9332-48eb-89aa-6d63128f8dec | 1 | 2026-09-25T04:08:23.545Z |
| 3 | 4dd52a24-7cd3-4727-8a01-22a99be71593 | a0ee1170-12cc-4af9-9231-0871a866ea12 | 1 | 2026-09-25T04:08:23.548Z |
| 4 | d2ce096e-7167-4ac8-beee-7409235cfe55 | a0ee1170-12cc-4af9-9231-0871a866ea12 | 1 | 2026-09-25T04:08:23.549Z |
| 5 | 04fb35ff-f3d3-4067-903b-de3d23442106 | 6a17601e-90b2-4d53-bea4-553e816ac739 | 1 | 2026-09-25T04:08:23.555Z |
| 6 | 503ba0f2-c359-4a57-9f85-ed7dce66381c | 6a17601e-90b2-4d53-bea4-553e816ac739 | 1 | 2026-09-25T04:08:26.387Z |

أعادت `enqueueRender` أولوية **1 لكل الثماني normal/urgent**. أولوية edit
الافتراضية **0** لا تدخل في هذا الادعاء. البدء يوافق الأولويات المتساوية
وترتيب الإدراج، لكنه **لا يبرهن تدويراً** بين المستأجرين.

**قيد مصدر يستحق تذكرة متابعة:** `computePriority` في `apps/api/src/queues/index.ts:76–80`
يعدّ `waiting` و`delayed` فقط، ولا يضمّ `prioritized`؛ وقد أثبت القياس
وجود `prioritized=1` فعلياً. لم تُضف العيّنة مهمة جديدة للمستأجر C بعد
ثبوت انتظار مهمته السادسة، لذلك لا أقدّم هذه الجولة كإثبات سلوكي مكتمل
لأثر هذا الإغفال على الأولوية. لقطتا pendingSameTenantBefore في الأثر
ليستا ذريتين مع حساب الأولوية؛ تحوّل المهمة إلى active بين القراءتين
يمنع الاستدلال منهما وحدهما على عطب. **لم يُصلح المصدر ولم يُخفّض شرط العدالة.**

كل `capDelays=0`؛ أعلى تداخل محتمل لكل مستأجر في توزيعنا ثلاثة، دون سقف
الأربع المعلن. عدم تجاوز السقف في هذه العينة لا يثبت أنه يمنع التجاوز.
توقفت عند تسليم هذه الفجوة للمراجعة، ولم أُعلن البند 6 أخضر.

## القياس 4 — edit مستقل

المهمة `9427e44a-f63f-4cbb-9974-8f1b7cb28d25`:
queued `04:08:23.559Z`؛ processedOn `04:08:23.562Z`؛ DB started_at
`04:08:23.570Z`؛ انتظار الطابور **3ms**، والبدء الفعلي **11ms**.
كانت active عند حقن العاجل مع normal=5 active +1 prioritized.
هذا يثبت استهلاك طابور edit المستقل تحت الحمل بهذه الحمولة؛ **لا يثبت أداء
تحرير فيديو أو عزل CPU**، لأن الحمولة بطاقة PNG.

## القياس 5 — الإنجاز

| المهمة | الطابور | المستأجر | priority | بدء فعلي ms | duration_ms | BullMQ / DB | بايت S3 |
|---|---|---|---:|---:|---:|---|---:|
| e66dc778-dfbc-4a51-a6d2-2566cc5bfc16 | normal | A | 1 | 2 | 1938 | completed / succeeded | 53438 |
| 46e50828-99d9-4df4-9e8c-51135e9b691b | normal | A | 1 | 2 | 2386 | completed / succeeded | 53438 |
| 4dd52a24-7cd3-4727-8a01-22a99be71593 | normal | B | 1 | 3 | 2384 | completed / succeeded | 53438 |
| d2ce096e-7167-4ac8-beee-7409235cfe55 | normal | B | 1 | 2 | 2606 | completed / succeeded | 53438 |
| 04fb35ff-f3d3-4067-903b-de3d23442106 | normal | C | 1 | 4 | 2828 | completed / succeeded | 53438 |
| 503ba0f2-c359-4a57-9f85-ed7dce66381c | normal | C | 1 | 2833 | 1382 | completed / succeeded | 53438 |
| 9427e44a-f63f-4cbb-9974-8f1b7cb28d25 | edit | C | 0 | 11 | 2586 | completed / succeeded | 53438 |
| 0bc7d469-384c-469b-b5eb-31b6a027e411 | urgent | A | 1 | 928 | 1841 | completed / succeeded | 53438 |
| 18db261b-9369-4c11-bddb-48cc433d03ab | urgent | B | 1 | 927 | 2066 | completed / succeeded | 53438 |

التسع completed وDB succeeded، وكل مخرج S3 حجمه **53438 بايت**،
بمحاولة واحدة للمهمة. failed=0 في العينة، ولم يُرصد أي حدث stalled.
بدأت مستمعات QueueEvents قبل الحقن؛ لا استنتاج من سجل تاريخي ناقص.

## القياس 6 — بعد الحمل مباشرة

عند `04:08:27.843Z`، جميع الطوابير الأربعة:
`active=0, waiting=0, prioritized=0, delayed=0`.
إذن urgent waiting الكلي=0، ولا مهمة active تجاوزت 60s؛ قائمة الفحص `[]`.

## فحص المخرج والتحقق

- `node --check` للسكربتين و`git diff --check` نجحت (خروج 0، بلا مخرجات).
- `--preflight` نجح (خروج 0)، ثم `--run` نجح (خروج 0). خروج 0 يعني اكتمال أداة القياس، **لا إغلاق كل شروط البند 6**.
- روجعت أداة القياس وفق `test-guard`: بنية حقيقية وبدون mocks داخلية، وفصل بدء BullMQ عن DB، وعدّ prioritized صراحةً. لا اختبارات إنتاج جديدة ولا تشغيل للسلسلة العامة التي قد تمس بيئات أخرى.
- روجعت الأرقام والمسارات وتحديث `PHASES-api.md` وفق `docs-guard` مقابل الأثر والمصدر. `PHASES.md` وM1 ملك مسار M ولم يُعدّلا؛ لا ميزة إنتاجية أو أصل تسويقي معتمد هنا.
- نُزّلت عيّنة urgent من S3 وفُتحت بالعين: ثلاث سطور عربية كريمية على خلفية كحلية، بلا قص ظاهر أو تراكب أو شعار؛ النص يطابق العنوان الاصطناعي. **اعتمد المالك هذه العيّنة بصرياً للحمل الاصطناعي في حكم 04:25Z**.
- العيّنة: `/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-urgent-sample.png`؛ 53438 بايت؛ SHA256 `2c61fdca177221f9b0498b7ba290785e706055183c3b5cbd8ee9bf37ca9dc2ec`.

## أوامر القياس الحرفية ومخرجاتها

كل الأوامر من `/Users/mdervis/MediaKit/pf-mediakit-api`. البيئة المحايدة
تمنع وراثة إعدادات جلسة أخرى، ثم `cleanDevEnvironment` يقرأ الأسرار إلى
الذاكرة فقط. لا قيمة سر في الأمر أو argv أو التقرير.

### الفحص بلا حقن

```sh
source ~/.nvm/nvm.sh
nvm use --silent
node --check apps/api/scripts/peak-load.mjs
node --check apps/api/scripts/peak-load-fixtures.mjs
git diff --check
env -i HOME="$HOME" PATH="$PATH" node --import tsx apps/api/scripts/peak-load.mjs --preflight
```

خروج 0. المخرجات كاملة:

```jsonl
{"event":"target","observedAt":"2026-09-25T04:07:58.193Z","runId":"20260925T040758169Z-fbdf2897","evidencePath":"/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-20260925T040758169Z-fbdf2897.jsonl","PORT":"19040","S3_ENDPOINT":"http://127.0.0.1:19043","S3_PUBLIC_ENDPOINT":"http://127.0.0.1:19043","BULLMQ_PREFIX":"pf-mediakit","DATABASE_URL_host":"127.0.0.1:19041","DATABASE_URL_source":"DATABASE_URL_APP","DATABASE_URL_PLATFORM_host":"127.0.0.1:19041","REDIS_URL_host":"127.0.0.1:19045","cpus":10,"database":{"database":"mediakit","role":"app_user"}}
{"event":"worker","observedAt":"2026-09-25T04:07:58.197Z","queue":"normal","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:07:58.199Z","queue":"urgent","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:07:58.200Z","queue":"edit","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:07:58.201Z","queue":"batch","count":1,"paused":false}
{"event":"before","observedAt":"2026-09-25T04:07:58.208Z","queues":{"normal":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309278201,"sampleEndedMs":1790309278203},"urgent":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309278203,"sampleEndedMs":1790309278205},"edit":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309278205,"sampleEndedMs":1790309278207},"batch":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309278207,"sampleEndedMs":1790309278208}}}
```

### التشغيل الحي

```sh
source ~/.nvm/nvm.sh
nvm use --silent
env -i HOME="$HOME" PATH="$PATH" node --import tsx apps/api/scripts/peak-load.mjs --run
```

خروج 0. المخرجات كاملة بلا قصّ:

```jsonl
{"event":"target","observedAt":"2026-09-25T04:08:23.468Z","runId":"20260925T040823444Z-bc50859a","evidencePath":"/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-20260925T040823444Z-bc50859a.jsonl","PORT":"19040","S3_ENDPOINT":"http://127.0.0.1:19043","S3_PUBLIC_ENDPOINT":"http://127.0.0.1:19043","BULLMQ_PREFIX":"pf-mediakit","DATABASE_URL_host":"127.0.0.1:19041","DATABASE_URL_source":"DATABASE_URL_APP","DATABASE_URL_PLATFORM_host":"127.0.0.1:19041","REDIS_URL_host":"127.0.0.1:19045","cpus":10,"database":{"database":"mediakit","role":"app_user"}}
{"event":"worker","observedAt":"2026-09-25T04:08:23.472Z","queue":"normal","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:08:23.474Z","queue":"urgent","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:08:23.475Z","queue":"edit","count":1,"paused":false}
{"event":"worker","observedAt":"2026-09-25T04:08:23.477Z","queue":"batch","count":1,"paused":false}
{"event":"before","observedAt":"2026-09-25T04:08:23.483Z","queues":{"normal":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309303477,"sampleEndedMs":1790309303479},"urgent":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309303479,"sampleEndedMs":1790309303480},"edit":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309303480,"sampleEndedMs":1790309303482},"batch":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309303482,"sampleEndedMs":1790309303483}}}
{"event":"fixture","observedAt":"2026-09-25T04:08:23.505Z","label":"A","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","projectId":"f4579b4b-6e4c-41b5-b0d7-a58aa30608c7","assetId":"684c2a20-0aaf-4c33-963c-b611d7f9e0e0","fontKey":"0b38c3d3-9332-48eb-89aa-6d63128f8dec/peak-20260925T040823444Z-bc50859a/684c2a20-0aaf-4c33-963c-b611d7f9e0e0.ttf","license":"SIL OFL 1.1"}
{"event":"fixture","observedAt":"2026-09-25T04:08:23.513Z","label":"B","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","projectId":"0da2e88b-088f-4a73-bc44-fb24adec8ef6","assetId":"f84e2481-98a3-46d2-80a1-88ecf66ef3e6","fontKey":"a0ee1170-12cc-4af9-9231-0871a866ea12/peak-20260925T040823444Z-bc50859a/f84e2481-98a3-46d2-80a1-88ecf66ef3e6.ttf","license":"SIL OFL 1.1"}
{"event":"fixture","observedAt":"2026-09-25T04:08:23.521Z","label":"C","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","projectId":"980dd7f7-c946-493f-9833-291ae4544d36","assetId":"0535f4e9-4449-4b91-9a2a-9ebb3c91e18b","fontKey":"6a17601e-90b2-4d53-bea4-553e816ac739/peak-20260925T040823444Z-bc50859a/0535f4e9-4449-4b91-9a2a-9ebb3c91e18b.ttf","license":"SIL OFL 1.1"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.542Z","id":"e66dc778-dfbc-4a51-a6d2-2566cc5bfc16","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"normal","priority":1,"calledAt":1790309303540,"returnedAt":1790309303542,"queuedAt":1790309303541,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.543Z","kind":"active","queue":"normal","id":"e66dc778-dfbc-4a51-a6d2-2566cc5bfc16","streamId":"1790309303543-0"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.544Z","id":"46e50828-99d9-4df4-9e8c-51135e9b691b","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"normal","priority":1,"calledAt":1790309303543,"returnedAt":1790309303544,"queuedAt":1790309303543,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.545Z","kind":"active","queue":"normal","id":"46e50828-99d9-4df4-9e8c-51135e9b691b","streamId":"1790309303545-0"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.546Z","id":"4dd52a24-7cd3-4727-8a01-22a99be71593","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"normal","priority":1,"calledAt":1790309303545,"returnedAt":1790309303546,"queuedAt":1790309303545,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.547Z","kind":"active","queue":"normal","id":"4dd52a24-7cd3-4727-8a01-22a99be71593","streamId":"1790309303548-0"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.548Z","id":"d2ce096e-7167-4ac8-beee-7409235cfe55","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"normal","priority":1,"calledAt":1790309303547,"returnedAt":1790309303548,"queuedAt":1790309303547,"pendingSameTenantBefore":["4dd52a24-7cd3-4727-8a01-22a99be71593"]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.549Z","kind":"active","queue":"normal","id":"d2ce096e-7167-4ac8-beee-7409235cfe55","streamId":"1790309303549-0"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.552Z","id":"04fb35ff-f3d3-4067-903b-de3d23442106","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"normal","priority":1,"calledAt":1790309303549,"returnedAt":1790309303552,"queuedAt":1790309303551,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.553Z","kind":"active","queue":"normal","id":"04fb35ff-f3d3-4067-903b-de3d23442106","streamId":"1790309303553-0"}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.558Z","id":"503ba0f2-c359-4a57-9f85-ed7dce66381c","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"normal","priority":1,"calledAt":1790309303554,"returnedAt":1790309303558,"queuedAt":1790309303554,"pendingSameTenantBefore":["04fb35ff-f3d3-4067-903b-de3d23442106"]}
{"event":"enqueued","observedAt":"2026-09-25T04:08:23.561Z","id":"9427e44a-f63f-4cbb-9974-8f1b7cb28d25","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"edit","priority":0,"calledAt":1790309303559,"returnedAt":1790309303561,"queuedAt":1790309303559,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:23.563Z","kind":"active","queue":"edit","id":"9427e44a-f63f-4cbb-9974-8f1b7cb28d25","streamId":"1790309303563-0"}
{"event":"atUrgent","observedAt":"2026-09-25T04:08:24.550Z","waveStart":1790309303540,"queues":{"normal":{"counts":{"active":5,"waiting":0,"prioritized":1,"delayed":0,"paused":0},"pending":1,"byTenant":{"6a17601e-90b2-4d53-bea4-553e816ac739":{"label":"C","active":1,"waiting":0,"prioritized":1,"delayed":0},"a0ee1170-12cc-4af9-9231-0871a866ea12":{"label":"B","active":2,"waiting":0,"prioritized":0,"delayed":0},"0b38c3d3-9332-48eb-89aa-6d63128f8dec":{"label":"A","active":2,"waiting":0,"prioritized":0,"delayed":0}},"sampleStartedMs":1790309304542,"sampleEndedMs":1790309304545},"urgent":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309304545,"sampleEndedMs":1790309304547},"edit":{"counts":{"active":1,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{"6a17601e-90b2-4d53-bea4-553e816ac739":{"label":"C","active":1,"waiting":0,"prioritized":0,"delayed":0}},"sampleStartedMs":1790309304547,"sampleEndedMs":1790309304549},"batch":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309304549,"sampleEndedMs":1790309304550}}}
{"event":"enqueued","observedAt":"2026-09-25T04:08:24.552Z","id":"0bc7d469-384c-469b-b5eb-31b6a027e411","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"urgent","priority":1,"calledAt":1790309304551,"returnedAt":1790309304552,"queuedAt":1790309304551,"pendingSameTenantBefore":[]}
{"event":"enqueued","observedAt":"2026-09-25T04:08:24.554Z","id":"18db261b-9369-4c11-bddb-48cc433d03ab","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"urgent","priority":1,"calledAt":1790309304553,"returnedAt":1790309304554,"queuedAt":1790309304553,"pendingSameTenantBefore":[]}
{"event":"transition","observedAt":"2026-09-25T04:08:24.818Z","kind":"active","queue":"urgent","id":"0bc7d469-384c-469b-b5eb-31b6a027e411","streamId":"1790309304818-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:25.044Z","kind":"active","queue":"urgent","id":"18db261b-9369-4c11-bddb-48cc433d03ab","streamId":"1790309305044-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.385Z","kind":"completed","queue":"normal","id":"4dd52a24-7cd3-4727-8a01-22a99be71593","streamId":"1790309306385-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.385Z","kind":"active","queue":"normal","id":"503ba0f2-c359-4a57-9f85-ed7dce66381c","streamId":"1790309306385-1"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.385Z","kind":"completed","queue":"normal","id":"46e50828-99d9-4df4-9e8c-51135e9b691b","streamId":"1790309306385-2"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.387Z","kind":"completed","queue":"normal","id":"d2ce096e-7167-4ac8-beee-7409235cfe55","streamId":"1790309306388-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.388Z","kind":"completed","queue":"normal","id":"e66dc778-dfbc-4a51-a6d2-2566cc5bfc16","streamId":"1790309306388-1"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.388Z","kind":"completed","queue":"edit","id":"9427e44a-f63f-4cbb-9974-8f1b7cb28d25","streamId":"1790309306389-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:26.866Z","kind":"completed","queue":"normal","id":"04fb35ff-f3d3-4067-903b-de3d23442106","streamId":"1790309306866-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:27.767Z","kind":"completed","queue":"urgent","id":"0bc7d469-384c-469b-b5eb-31b6a027e411","streamId":"1790309307768-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:27.769Z","kind":"completed","queue":"urgent","id":"18db261b-9369-4c11-bddb-48cc433d03ab","streamId":"1790309307770-0"}
{"event":"transition","observedAt":"2026-09-25T04:08:27.772Z","kind":"completed","queue":"normal","id":"503ba0f2-c359-4a57-9f85-ed7dce66381c","streamId":"1790309307772-0"}
{"event":"results","observedAt":"2026-09-25T04:08:27.835Z","rows":[{"id":"e66dc778-dfbc-4a51-a6d2-2566cc5bfc16","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"normal","priority":1,"queuedAtMs":1790309303541,"processedOnMs":1790309303542,"dbStartedAt":"2026-09-25T04:08:23.543Z","dbCompletedAt":"2026-09-25T04:08:25.481Z","queueStartMs":1,"renderStartMs":2,"finishedOnMs":1790309306387,"state":"completed","dbStatus":"succeeded","durationMs":1938,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"0b38c3d3-9332-48eb-89aa-6d63128f8dec/renders/e66dc778-dfbc-4a51-a6d2-2566cc5bfc16/output.png"},{"id":"46e50828-99d9-4df4-9e8c-51135e9b691b","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"normal","priority":1,"queuedAtMs":1790309303543,"processedOnMs":1790309303544,"dbStartedAt":"2026-09-25T04:08:23.545Z","dbCompletedAt":"2026-09-25T04:08:25.931Z","queueStartMs":1,"renderStartMs":2,"finishedOnMs":1790309306384,"state":"completed","dbStatus":"succeeded","durationMs":2386,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"0b38c3d3-9332-48eb-89aa-6d63128f8dec/renders/46e50828-99d9-4df4-9e8c-51135e9b691b/output.png"},{"id":"4dd52a24-7cd3-4727-8a01-22a99be71593","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"normal","priority":1,"queuedAtMs":1790309303545,"processedOnMs":1790309303547,"dbStartedAt":"2026-09-25T04:08:23.548Z","dbCompletedAt":"2026-09-25T04:08:25.932Z","queueStartMs":2,"renderStartMs":3,"finishedOnMs":1790309306384,"state":"completed","dbStatus":"succeeded","durationMs":2384,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"a0ee1170-12cc-4af9-9231-0871a866ea12/renders/4dd52a24-7cd3-4727-8a01-22a99be71593/output.png"},{"id":"d2ce096e-7167-4ac8-beee-7409235cfe55","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"normal","priority":1,"queuedAtMs":1790309303547,"processedOnMs":1790309303549,"dbStartedAt":"2026-09-25T04:08:23.549Z","dbCompletedAt":"2026-09-25T04:08:26.155Z","queueStartMs":2,"renderStartMs":2,"finishedOnMs":1790309306387,"state":"completed","dbStatus":"succeeded","durationMs":2606,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"a0ee1170-12cc-4af9-9231-0871a866ea12/renders/d2ce096e-7167-4ac8-beee-7409235cfe55/output.png"},{"id":"04fb35ff-f3d3-4067-903b-de3d23442106","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"normal","priority":1,"queuedAtMs":1790309303551,"processedOnMs":1790309303552,"dbStartedAt":"2026-09-25T04:08:23.555Z","dbCompletedAt":"2026-09-25T04:08:26.383Z","queueStartMs":1,"renderStartMs":4,"finishedOnMs":1790309306865,"state":"completed","dbStatus":"succeeded","durationMs":2828,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"6a17601e-90b2-4d53-bea4-553e816ac739/renders/04fb35ff-f3d3-4067-903b-de3d23442106/output.png"},{"id":"503ba0f2-c359-4a57-9f85-ed7dce66381c","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"normal","priority":1,"queuedAtMs":1790309303554,"processedOnMs":1790309306384,"dbStartedAt":"2026-09-25T04:08:26.387Z","dbCompletedAt":"2026-09-25T04:08:27.769Z","queueStartMs":2830,"renderStartMs":2833,"finishedOnMs":1790309307771,"state":"completed","dbStatus":"succeeded","durationMs":1382,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"6a17601e-90b2-4d53-bea4-553e816ac739/renders/503ba0f2-c359-4a57-9f85-ed7dce66381c/output.png"},{"id":"9427e44a-f63f-4cbb-9974-8f1b7cb28d25","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","label":"C","queue":"edit","priority":0,"queuedAtMs":1790309303559,"processedOnMs":1790309303562,"dbStartedAt":"2026-09-25T04:08:23.570Z","dbCompletedAt":"2026-09-25T04:08:26.156Z","queueStartMs":3,"renderStartMs":11,"finishedOnMs":1790309306388,"state":"completed","dbStatus":"succeeded","durationMs":2586,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"6a17601e-90b2-4d53-bea4-553e816ac739/renders/9427e44a-f63f-4cbb-9974-8f1b7cb28d25/output.png"},{"id":"0bc7d469-384c-469b-b5eb-31b6a027e411","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","label":"A","queue":"urgent","priority":1,"queuedAtMs":1790309304551,"processedOnMs":1790309304817,"dbStartedAt":"2026-09-25T04:08:25.479Z","dbCompletedAt":"2026-09-25T04:08:27.320Z","queueStartMs":266,"renderStartMs":928,"finishedOnMs":1790309307767,"state":"completed","dbStatus":"succeeded","durationMs":1841,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"0b38c3d3-9332-48eb-89aa-6d63128f8dec/renders/0bc7d469-384c-469b-b5eb-31b6a027e411/output.png"},{"id":"18db261b-9369-4c11-bddb-48cc433d03ab","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","label":"B","queue":"urgent","priority":1,"queuedAtMs":1790309304553,"processedOnMs":1790309305043,"dbStartedAt":"2026-09-25T04:08:25.480Z","dbCompletedAt":"2026-09-25T04:08:27.546Z","queueStartMs":490,"renderStartMs":927,"finishedOnMs":1790309307769,"state":"completed","dbStatus":"succeeded","durationMs":2066,"attemptsMade":1,"capDelays":0,"errorCode":null,"outputBytes":53438,"outputKey":"a0ee1170-12cc-4af9-9231-0871a866ea12/renders/18db261b-9369-4c11-bddb-48cc433d03ab/output.png"}]}
{"event":"summary","observedAt":"2026-09-25T04:08:27.836Z","gate":null,"injected":9,"enqueueWindowMs":1012,"peakOutstanding":9,"peakBullmqActive":8,"peakRendering":8,"urgentWithin45s":true,"allCompleted":true,"normalStartOrder":[{"id":"e66dc778-dfbc-4a51-a6d2-2566cc5bfc16","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","priority":1,"startedAt":"2026-09-25T04:08:23.543Z"},{"id":"46e50828-99d9-4df4-9e8c-51135e9b691b","tenantId":"0b38c3d3-9332-48eb-89aa-6d63128f8dec","priority":1,"startedAt":"2026-09-25T04:08:23.545Z"},{"id":"4dd52a24-7cd3-4727-8a01-22a99be71593","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","priority":1,"startedAt":"2026-09-25T04:08:23.548Z"},{"id":"d2ce096e-7167-4ac8-beee-7409235cfe55","tenantId":"a0ee1170-12cc-4af9-9231-0871a866ea12","priority":1,"startedAt":"2026-09-25T04:08:23.549Z"},{"id":"04fb35ff-f3d3-4067-903b-de3d23442106","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","priority":1,"startedAt":"2026-09-25T04:08:23.555Z"},{"id":"503ba0f2-c359-4a57-9f85-ed7dce66381c","tenantId":"6a17601e-90b2-4d53-bea4-553e816ac739","priority":1,"startedAt":"2026-09-25T04:08:26.387Z"}],"stalled":[]}
{"event":"after","observedAt":"2026-09-25T04:08:27.843Z","queues":{"normal":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309307836,"sampleEndedMs":1790309307837},"urgent":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309307837,"sampleEndedMs":1790309307839},"edit":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309307839,"sampleEndedMs":1790309307841},"batch":{"counts":{"active":0,"waiting":0,"prioritized":0,"delayed":0,"paused":0},"pending":0,"byTenant":{},"sampleStartedMs":1790309307841,"sampleEndedMs":1790309307842}},"activeOver60s":[]}
```

نسخة الأثر المستقلة:
`/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-20260925T040823444Z-bc50859a.jsonl`.

## حالة Git وبوابة التسليم

```sh
git log -1 --format='%h %s'
git branch --show-current
git status --short --untracked-files=all
git diff --check
```

```text
b60e9c9 feat(api): schedule isolated daily PostgreSQL backups (468b)
feat/api
 M PHASES-api.md
?? apps/api/scripts/peak-load-fixtures.mjs
?? apps/api/scripts/peak-load.mjs
?? claude/inbox/_answers/cx-mkapi.txt
```

`git diff --check`: خروج 0 بلا مخرجات. لا التزام جديد، ولا دفع أو دمج؛
السكربتان غير متتبّعين لحين المراجعة، وملف الأجوبة خارج التغيير المقصود.
`PHASES-api.md` وحده يحمل تحديث حالة المسار. لم تُمسّ ملفات الإنتاج
أو العامل أو show أو طابور backup. بيانات القياس باقية؛ لا تنظيف حذف.

**بوابة التسليم:** شرط زمن البدء محقق في العينة، وإثبات العدالة غير مكتمل.
التوقّف قبل الالتزام نافذ؛ لا إصلاح ذاتي للإغفال المرصود في حساب الأولوية.

## ملحوظة 468b

بحسب حكم المالك 03:45Z: النسختان بحجم 2290521B لكل منهما لكن SHA256
مختلفتان؛ وصف «متطابقتان بايتياً» مسحوب. أبقى المالك البند 11 ✅ مع فصل
اختبار الاستعادة في 465 عن الجدولة والإبقاء في 468b. لم أعد قياس النسخ،
ولا أستدل بتساوي الحجم وحده على تطابق المحتوى.

**البند 6 ◐**.

## حكم التسليم 04:25Z — إذن الالتزام والدفع

اعتمد المالك زمنَي البدء 928/927ms، وإنجاز 9/9، وراجع العيّنة بصرياً
وقبلها للحمل الاصطناعي. أذن commit+push على feat/api دون دمج للملفات الخمسة:
التقرير، العيّنة، peak-load.mjs، peak-load-fixtures.mjs، وPHASES-api.md.
تُنسخ نسختا التقرير والعيّنة من المسار المطلق المعتمد إلى شجرة feat/api
لإدراجهما في الالتزام المأذون؛ يبقى التقرير الأصلي في المسار المطلوب.

البند 6 يبقى ◐ لثلاث حدود: PNG فقط دون تحرير فيديو؛ سقف 4 لم يُستفزّ
لأن أقصى تداخل/مستأجر 3؛ وأثر إغفال prioritized من computePriority
معلّق سلوكياً، إذ لم تُدرج مهمة لاحقة للمستأجر C. المتابعة المأذونة بعد
الدفع: قراءة وتنفيذ 469b، دون إصلاح مصدر عند اكتشاف عيب.

**البند 6 ◐**.
