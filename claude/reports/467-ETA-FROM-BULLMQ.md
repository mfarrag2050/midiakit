# حكم 01:30Z — الاستعادة نجحت؛ قياس أ لم يحقق المعيار

**البند 7 ◐.** ج مسحوب نهائياً، و1500ms مقبول وفق حكم Opus. لم يُعَد قياس ج. لا تعديل مصدر، لا PHASES، لا commit.

## تشخيص السقوط قبل الاستعادة
الأثر المتاح يثبت أن نافذة API القديمة في tmux خرجت بسبب Redis غير المتاح (exit=1)، لا SIGINT؛ لكن إقلاع 01:15 جرى خارج tmux في جلستي الأداة 18413/51298 اللتين لم تعودا موجودتين، ولا أثر متاح يحدد سبب إنهائهما بدقة. لذلك لا أنسب سقوط 01:15 إلى Redis أو خطأ برمجي أو SIGINT بلا دليل.

أوامر القراءة:
```sh
tmux list-panes -t mk-dev-api -a -F '#{session_name}:#{window_index}.#{pane_index} dead=#{pane_dead} exit=#{pane_dead_status} command=#{pane_current_command}'
tmux capture-pane -p -t mk-dev-api:0 -S -35
tmux capture-pane -p -t mk-dev-api:1 -S -35
tmux list-windows -t mk-dev-api -F '#{window_index} #{window_name} panes=#{window_panes}'
redis-cli -h 127.0.0.1 -p 19045 PING
```
دليل التشخيص من النتائج:
```text
mk-dev-api:0.0 dead=1 exit=1 command=read
DEV_REDIS_UNAVAILABLE: REDIS_URL; no fallback
Pane is dead (status 1, Fri Sep 25 03:10:44 2026)
can't find window: 1
0 api panes=1
PONG
write_stdin failed: Unknown process id 18413
write_stdin failed: Unknown process id 51298
```
Redis كان حياً؛ لم يحتج إعادة تشغيل ولم يثبت تكرار خروجه في هذه الدورة.

## الاستعادة في tmux
```sh
tmux set-option -w -t mk-dev-api:0 remain-on-exit on
tmux respawn-pane -t mk-dev-api:0 -c /Users/mdervis/MediaKit/pf-mediakit-api 'exec env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node apps/api/scripts/dev-launch.mjs api'
tmux new-window -d -t mk-dev-api:1 -n worker -c /Users/mdervis/MediaKit/pf-mediakit-api 'exec env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node apps/api/scripts/dev-launch.mjs worker'
tmux set-option -w -t mk-dev-api:1 remain-on-exit on
```
stdout فارغ؛ exit=0. أبقيت النافذتين حيّتين.

## ثبات الصحة
سبع قراءات بفاصل خمس ثوانٍ خلال 31.058 ثانية؛ HTTP 200 وworkers.edit=1 في جميعها، ولا pane ميتة في أي قراءة. هذا أخذ عينات دوري، لا ادعاء مراقبة كل لحظة بين العينات.

الأمر:
```sh
python3 - <<'PY'
import json, subprocess, time, urllib.request
start=time.monotonic()
for i in range(7):
    with urllib.request.urlopen('http://127.0.0.1:19040/v1/health', timeout=5) as r:
        health=json.load(r)
        assert r.status == 200 and health['workers']['edit'] >= 1
        panes=subprocess.check_output(['tmux','list-panes','-s','-t','mk-dev-api','-F','#{window_index}: dead=#{pane_dead} exit=#{pane_dead_status}'],text=True).strip()
        assert len(panes.splitlines()) == 2 and 'dead=1' not in panes
        print(json.dumps({'elapsedSeconds':round(time.monotonic()-start,3),'http':r.status,'health':health,'panes':panes}), flush=True)
    if i < 6: time.sleep(5)
PY
```
stdout الكامل:
```json
{"elapsedSeconds": 0.059, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:12.994Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 5.236, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:18.187Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 10.404, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:23.356Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 15.57, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:28.521Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 20.739, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:33.695Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 25.915, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:38.866Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}
{"elapsedSeconds": 31.058, "http": 200, "health": {"status": "ok", "ts": "2026-09-25T01:30:44.012Z", "commit": "e79819dc3aa2393cea9ea0ad1669c78ab160cd82", "cwd": "/Users/mdervis/MediaKit/pf-mediakit-api/apps/api", "workers": {"urgent": 1, "normal": 1, "edit": 1, "batch": 1}}, "panes": "0: dead=0 exit=\n1: dead=0 exit="}

```
exit=0.

## أ — فرق ETA يساوي صفراً
أُعيد تنفيذ أمر أ الحرفي المحفوظ في التقرير دون تغيير. قيمه: priority=5، averageSeconds=8، فاصل 100ms. يتضمن التنظيف في finally.

stdout الكامل:
```json
{"health":{"status":"ok","ts":"2026-09-25T01:30:52.757Z","commit":"e79819dc3aa2393cea9ea0ad1669c78ab160cd82","cwd":"/Users/mdervis/MediaKit/pf-mediakit-api/apps/api","workers":{"urgent":1,"normal":1,"edit":1,"batch":1}}}
{"before":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0}}
{"measurement":"467-a","firstJobId":"1","secondJobId":"2","firstState":"failed","secondState":"failed","first":{"eta_seconds":1.5,"saturated":false},"second":{"eta_seconds":1.5,"saturated":false},"averageSeconds":8,"queuedAheadObservedAfterEta":0,"deltaSeconds":0,"minimumDeltaSeconds":6,"pass":false}
{"cleanup":"normal waiting/prioritized/delayed","removed":0,"counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0}}

```
exit=1.

الملاحظة: etaFirst=1.5s، etaSecond=1.5s، delta=0s؛ المطلوب delta≥6s. كلا الجوبين في failed عند رصد الحالة، وqueuedAheadObservedAfterEta=0. العامل الحي استهلك المهمتين ولم يبقَ الأول منتظراً أمام الثاني؛ الحمولة كما أمر الحكم تحتوي renderId فقط. هذه النتيجة لا تثبت عيباً في render-eta.ts: شرط إبقاء الأول أمام الثاني لم يتحقق. لم أوقف العامل أو أغيّر الحمولة أو أتلاعب بالقياس لإنتاج فرق.

التنظيف في finally نُفّذ: أُزيلت **0** مهام منتظرة؛ waiting/prioritized/delayed/active كلها صفر بعده. المهمتان الفاشلتان ليستا ضمن حالات الحذف المأذونة في الأمر، فلم أحذفهما.

## التصعيد
توقّفت عند فشل أ وفق الحكم؛ ب لم يُنفّذ. المطلوب حكم Opus بشأن طريقة ضمان أن الأولى تظل منتظرة عند قياس الثانية مع العامل الحي؛ الأرقام الحالية لا تفصل خلل الحساب عن عدم تحقق إعداد القياس. لا نجاح للبند 7، ولا إصلاح إنتاجي أو التزام.

## ملحق — الأمر الحرفي لأ ثم السجل التاريخي

```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { cleanDevEnvironment, readLocalEnvironment } from './apps/api/scripts/dev-environment.mjs';
Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, closeQueues } = await import('./apps/api/src/queues/index.ts');
const { getRenderEta } = await import('./apps/api/src/queues/render-eta.ts');
const queue = getQueue('normal');
const log = { warn: (data, message) => console.log(JSON.stringify({ warning: data, message })) };
let ownsWaitingQueue = false;
try {
  const health = await fetch('http://127.0.0.1:19040/v1/health').then(r => r.json());
  console.log(JSON.stringify({ health }));
  assert.ok(health.workers.edit >= 1);
  const before = await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active');
  console.log(JSON.stringify({ before }));
  assert.ok(Object.values(before).every(n => n === 0), 'normal must start empty');
  ownsWaitingQueue = true;
  const first = await queue.add('render', { renderId: randomUUID() }, { priority: 5 });
  const etaFirst = await getRenderEta({ queueName: 'normal', priority: 5, renderId: first.id, averageSeconds: 8 }, log);
  await setTimeout(100);
  const second = await queue.add('render', { renderId: randomUUID() }, { priority: 5 });
  const etaSecond = await getRenderEta({ queueName: 'normal', priority: 5, renderId: second.id, averageSeconds: 8 }, log);
  const waiting = await queue.getJobs(['waiting', 'prioritized', 'delayed']);
  const deltaSeconds = etaSecond.eta_seconds - etaFirst.eta_seconds;
  console.log(JSON.stringify({ measurement: '467-a', firstJobId: first.id, secondJobId: second.id,
    firstState: await first.getState(), secondState: await second.getState(),
    first: etaFirst, second: etaSecond, averageSeconds: 8,
    queuedAheadObservedAfterEta: waiting.filter(j => j.id !== second.id && j.priority <= 5).length,
    deltaSeconds, minimumDeltaSeconds: 6, pass: deltaSeconds >= 6 }));
  if (deltaSeconds < 6) process.exitCode = 1;
} finally {
  if (ownsWaitingQueue) {
    let removed = 0;
    for (const j of await queue.getJobs(['waiting', 'prioritized', 'delayed'])) { await j.remove(); removed++; }
    console.log(JSON.stringify({ cleanup: 'normal waiting/prioritized/delayed', removed,
      counts: await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active') }));
  }
  await closeQueues();
}
JS
```

# تحديث حكم Opus بعد 01:17Z — معيار ج مسحوب؛ أ وب غير مقيسين

**الحالة الحالية: البند 7 ◐ — توقّف قبل قياس أ بسبب عدم إتاحة API.**

حكم Opus سحب معيار ج صراحةً: 1500ms للطابور الفارغ الخامل مقبولة كتقدير بدء. لذلك الحكم السابق بأن ج فشل لم يعد نافذاً، ويُحفظ أدناه كتاريخ فقط.

نُفّذ الأمر أدناه لقياس أ، مع فحص صحة قبل إضافة أي مهمة. فشل الاتصال بـ127.0.0.1:19040 بـECONNREFUSED (errno=-61)، خلاف فرضية بقاء API حيّة من الجلسة 18413. لم أصل إلى queue.add؛ لا مهمة أُضيفت، ولا تنظيف طابور نُفّذ. لم يُنفّذ ب. لم أفحص حياة العامل مستقلاً، فلا أزعم أنه مات أو بقي حياً.

هذا **عائق بيئة قبل القياس**، وليس فشل معيار فرق ETA؛ لا أرقام ETA جديدة. توقّفت عند اختلاف حالة البيئة عن فرضية الحكم وفق L-33، ولم أعد الإقلاع أو أعدّل المصدر أو PHASES أو أنشئ commit. يلزم حكم استعادة API قبل متابعة أ وب.

## الأمر الحرفي لمحاولة أ
```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { cleanDevEnvironment, readLocalEnvironment } from './apps/api/scripts/dev-environment.mjs';
Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, closeQueues } = await import('./apps/api/src/queues/index.ts');
const { getRenderEta } = await import('./apps/api/src/queues/render-eta.ts');
const queue = getQueue('normal');
const log = { warn: (data, message) => console.log(JSON.stringify({ warning: data, message })) };
let ownsWaitingQueue = false;
try {
  const health = await fetch('http://127.0.0.1:19040/v1/health').then(r => r.json());
  console.log(JSON.stringify({ health }));
  assert.ok(health.workers.edit >= 1);
  const before = await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active');
  console.log(JSON.stringify({ before }));
  assert.ok(Object.values(before).every(n => n === 0), 'normal must start empty');
  ownsWaitingQueue = true;
  const first = await queue.add('render', { renderId: randomUUID() }, { priority: 5 });
  const etaFirst = await getRenderEta({ queueName: 'normal', priority: 5, renderId: first.id, averageSeconds: 8 }, log);
  await setTimeout(100);
  const second = await queue.add('render', { renderId: randomUUID() }, { priority: 5 });
  const etaSecond = await getRenderEta({ queueName: 'normal', priority: 5, renderId: second.id, averageSeconds: 8 }, log);
  const waiting = await queue.getJobs(['waiting', 'prioritized', 'delayed']);
  const deltaSeconds = etaSecond.eta_seconds - etaFirst.eta_seconds;
  console.log(JSON.stringify({ measurement: '467-a', firstJobId: first.id, secondJobId: second.id,
    firstState: await first.getState(), secondState: await second.getState(),
    first: etaFirst, second: etaSecond, averageSeconds: 8,
    queuedAheadObservedAfterEta: waiting.filter(j => j.id !== second.id && j.priority <= 5).length,
    deltaSeconds, minimumDeltaSeconds: 6, pass: deltaSeconds >= 6 }));
  if (deltaSeconds < 6) process.exitCode = 1;
} finally {
  if (ownsWaitingQueue) {
    let removed = 0;
    for (const j of await queue.getJobs(['waiting', 'prioritized', 'delayed'])) { await j.remove(); removed++; }
    console.log(JSON.stringify({ cleanup: 'normal waiting/prioritized/delayed', removed,
      counts: await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active') }));
  }
  await closeQueues();
}
JS
```

stdout فارغ. الأثر الكامل المعاد من الأمر (stderr):
```text
node:internal/deps/undici/undici:13392
      Error.captureStackTrace(err);
            ^

TypeError: fetch failed
    at node:internal/deps/undici/undici:13392:13
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async file:///Users/mdervis/MediaKit/pf-mediakit-api/[eval1]:12:18 {
  [cause]: Error: connect ECONNREFUSED 127.0.0.1:19040
      at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16) {
    errno: -61,
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '127.0.0.1',
    port: 19040
  }
}

Node.js v20.18.1

```
exit code = 1.

## السجل التاريخي السابق — أحكامه منسوخة بالتحديث أعلاه حيث تعارضت

# تقرير 467 — التحقّق من ETA الموجود

الحالة الحالية: **فشل المعيار ج؛ البند 7 غير مستوفٍ.** لا تعديل إنتاج، لا commit، ولا تحديث PHASES-api.md لأن شرط نجاح القياسات لم يتحقق.

## الحكم النافذ
حكم Opus 2026-09-25 بعد 00:14Z حلّ L-33 وحوّل المهمة إلى تحقق وقياس للتنفيذ الموجود. مصدر تعديل dev-launch.mjs معروف من 466؛ بقي خارج المهمة بلا تعديل أو staging. سجل التوقفات السابق محفوظ في الملحق.

## استعادة dev
نُفّذت أوامر Docker المباشرة التي سمّاها الحكم صراحةً للحاوية المحدّدة.

```sh
docker context show
```
stdout:
```text
colima-mediakit
```
```sh
docker start pf-mediakit-dev-redis-460b
```
stdout:
```text
pf-mediakit-dev-redis-460b
```
```sh
docker inspect -f '{{.State.Status}} · started={{.State.StartedAt}}' pf-mediakit-dev-redis-460b
```
stdout:
```text
running · started=2026-09-25T01:15:18.362234559Z
```
```sh
redis-cli -h 127.0.0.1 -p 19045 PING
```
stdout:
```text
PONG
```

محاولتا `node apps/api/scripts/dev-launch.mjs api` و`node apps/api/scripts/dev-launch.mjs worker` خرجتا 1 قبل إطلاق الطفل، ولكل منهما stderr:
```text
DEV_ENV_CONFLICT: inherited PORT differs from dev-env.json; refusing launch
```
قُرئ أمر التشغيل المحفوظ في تقرير 466 وقارئ البيئة، ثم عُزلت متغيرات البيئة الموروثة دون تغيير الحارس أو الإعداد المعتمد:

```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node apps/api/scripts/dev-launch.mjs api
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node apps/api/scripts/dev-launch.mjs worker
```

نجح الإقلاع؛ جلستا التنفيذ API=18413 وworker=51298. لم أوقفهما بعد القياس.

```sh
curl -sS --max-time 5 http://127.0.0.1:19040/v1/health
```
stdout كامل:
```json
{"status":"ok","ts":"2026-09-25T01:16:08.981Z","commit":"e79819dc3aa2393cea9ea0ad1669c78ab160cd82","cwd":"/Users/mdervis/MediaKit/pf-mediakit-api/apps/api","workers":{"urgent":1,"normal":1,"edit":1,"batch":1}}
```

## قراءة التنفيذ
قُرئ `apps/api/src/queues/render-eta.ts` كاملاً. التوقيع:
```ts
getQueuedRenderEta(renderId: string, db: PoolClient, log: FastifyBaseLogger): Promise<RenderEta>
```
- لا p50 في التنفيذ؛ `averageRenderSeconds` يقرأ **المتوسط الحسابي** لـduration_ms لآخر 20 رندر ناجح من PostgreSQL تحت RLS وبحسب هوية القالب. ليس BullMQ metrics ولا عدّاداً داخل العامل.
- عند غياب المتوسط يرجع 8 ثوانٍ لـpng أو 45 ثانية لـmp4. لا شرط خمس عينات ولا fallback قدره 5000ms.
- يحسب `getRenderEta` المهام waiting/prioritized/delayed في **الطابور المحدّد وحده**، باستثناء المهمة نفسها وبشرط أولوية رقمية ≤ أولوية الطلب. لا يجمع عبء الطوابير الأعلى أولوية. المهام النشطة تُقرأ للتحذير عن التأخر، ولا تدخل زمن الانتظار.
- الصيغة: `queuedAhead * averageSeconds + 1.5`، بسقوف urgent=30، normal=90، edit=180، batch=300 ثانية.
- السطر الموجود في كلا ردّي create.ts:
```ts
estimatedStartAt: new Date(Date.now() + eta.eta_seconds * 1000).toISOString(),
```
مسار الطلب الجديد يستدعي helper مباشرةً؛ إعادة الطلب تستدعيه حين status=queued، وإلا تستخدم eta_seconds=0.

## القياس ج — فشل مثبت
قدّمت الحالة الفارغة لأنها موجودة فعلاً ولا تحتاج إنشاء بيانات أو تعطيل عامل. هذا **قياس helper الإنتاجي مباشرة على Redis وPostgreSQL الحقيقيين**؛ ليس POST /renders ولا شهادة لرحلة HTTP كاملة. estimatedStartAt في الناتج مركّب من قيمة helper بنفس صيغة create.ts. لا ادعاء بقياس p50: عند صفر عينات استُخدم حد fallback المطلوب في 467 للمقارنة.

الأمر الحرفي:
```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cleanDevEnvironment, readLocalEnvironment } from './apps/api/scripts/dev-environment.mjs';
Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, closeQueues } = await import('./apps/api/src/queues/index.ts');
const { averageRenderSeconds, getRenderEta } = await import('./apps/api/src/queues/render-eta.ts');
const { getPool, closePool } = await import('./apps/api/src/db.ts');
let db;
try {
  const queue = getQueue('normal');
  const before = await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active');
  assert.ok(Object.values(before).every(n => n === 0), 'queue must be empty and idle');
  db = await getPool().connect();
  const templateId = 'eta-467-' + randomUUID();
  const history = await db.query("SELECT count(*)::int AS n FROM renders WHERE status = 'succeeded' AND template_snapshot->>'id' = $1", [templateId]);
  const averageSeconds = await averageRenderSeconds(db, templateId, 'png');
  const now = Date.now();
  const eta = await getRenderEta({ queueName: 'normal', priority: 1, renderId: randomUUID(), averageSeconds }, { warn: () => assert.fail('unexpected warning') });
  const after = await queue.getJobCounts('waiting', 'prioritized', 'delayed', 'active');
  assert.ok(Object.values(after).every(n => n === 0), 'queue must remain empty and idle');
  const requiredFallbackMs = 5000;
  const observedEtaMs = eta.eta_seconds * 1000;
  console.log(JSON.stringify({ measurement: '467-c-empty-idle-helper', before, after,
    completedSampleCount: history.rows[0].n, actualAverageSeconds: averageSeconds,
    now: new Date(now).toISOString(), estimatedStartAt: new Date(now + observedEtaMs).toISOString(),
    requiredEarliestStartAt: new Date(now + requiredFallbackMs).toISOString(),
    observedEtaMs, requiredFallbackMs, shortfallMs: requiredFallbackMs - observedEtaMs,
    response: eta, pass: observedEtaMs >= requiredFallbackMs }));
  if (observedEtaMs < requiredFallbackMs) process.exitCode = 1;
} finally { db?.release(); await closeQueues(); await closePool(); }
JS
```

stdout كامل:
```json
{"measurement":"467-c-empty-idle-helper","before":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"after":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"completedSampleCount":0,"actualAverageSeconds":8,"now":"2026-09-25T01:16:32.696Z","estimatedStartAt":"2026-09-25T01:16:34.196Z","requiredEarliestStartAt":"2026-09-25T01:16:37.696Z","observedEtaMs":1500,"requiredFallbackMs":5000,"shortfallMs":3500,"response":{"eta_seconds":1.5,"saturated":false},"pass":false}
```
stderr فارغ؛ exit code = 1.

الطابور normal خالٍ من المهام المنتظرة والنشطة قبل القياس وبعده. صفر عينات للتعريف الجديد. ETA الفعلي 1500ms، الحد المطلوب 5000ms، النقص 3500ms. حتى متوسط التنفيذ الافتراضي نفسه (8000ms) لا يستخدم كحد للحالة الفارغة.

## ما لم يُنفّذ والقرار التالي
- أ: لم يُنفّذ طلبان متتاليان.
- ب: لم تُضف 20 مهمة batch ولم يُقس الفرق مع urgent.
- ج: فشل قياس helper المباشر كما أعلاه؛ لم تُجرَ رحلة POST للحالة نفسها.
- سكربت 462 الموجود غير مناسب كما هو: يشترط غياب العمال ويؤكد أن ETA الفارغ 1.5 ثانية، بينما الحكم الحالي يشترط تشغيل العامل واختبار معيار مختلف.
- توقّفت عند أول فشل وفق الحكم «قياسٌ يفشل ⇒ ... لا تعدّل الكود». لا يُعلَن البند 7 مستوفياً.
- المطلوب لتذكرة تالية من Opus: حسم وتصحيح مصدر إحصاء زمن الخدمة، fallback للحالة قليلة البيانات، وحد الحالة الفارغة، ثم إعادة ج وبقية القياسات. ملاحظات الأولوية والسقف أعلاه قراءة مصدر وليست نتائج قياس أ أو ب.
- لم أُنشئ سكربتاً في الشجرة أو fixture أو مهمة BullMQ؛ القياس قراءة فقط. لم ألمس شوروم أو ملفات الإنتاج أو PHASES.

## ملحق تاريخي — سجل البوابات السابقة

# تقرير 467 — ETA FROM BULLMQ

الحالة: متوقّف عند بوّابة تعديل مجهول، قبل التنفيذ.

قرأت الدستور ثم التذكرة، وفحصت حالة الشجرة وقواعد AGENTS.md والعمل المتوازي. الفرع الحالي `feat/api`.

## دليل البوّابة

الأمر المنفّذ في `/Users/mdervis/MediaKit/pf-mediakit-api`:

```bash
git status --short
```

stdout كامل:

```text
 M apps/api/scripts/dev-launch.mjs
```

الأمر:

```bash
git branch --show-current
```

stdout كامل:

```text
feat/api
```

التعديل موجود قبل بدء تنفيذ المهمة، ولا أعرف مصدره، وليس من الاستثناءات التي سمّاها المستخدم (`node_modules` · `.pnpm-store` · `opencode.json` · `AGENTS.md` غير المتتبّع).

الدستور، §١ «التعديل المجهول»: «إن وجدتَ في شجرةِ عملِك تغييراً لا تعرفُ من أين جاء: قفْ واذكرْه، ولا تُدخِلْه في commit.»

امتثالاً للبوّابة ولتعليمات العمل بلا إنسان يجيب، توقّفت وأنهيت. لم ألمس التعديل الموجود، ولم أعدّل كود ETA، ولم أشغّل أو أُحيِ أي بيئة، ولم أنفّذ قياسات dev@19040 الثلاث. لا نتائج قياس ولا سطر «بعد» للتغيير؛ التنفيذ لم يبدأ. لم أنشئ commit.

استئناف العمل يحتاج حكماً مسجّلاً يوضّح مصدر التعديل القائم أو يسمح صراحةً بمتابعة المهمة مع إبقائه خارج تغييراتها.


## تحديث بعد جواب 1/4 — زوال بوّابة المصدر وظهور تعارض التوجيه

بوّابة المصدر المجهول زالت بقول المالك المسجّل: تعديل `apps/api/scripts/dev-launch.mjs` من مهمة 466 لتسجيل PID طفل worker، وثمانية أسطره خارج نطاق 467. أُبقي الملف كما هو؛ لم أحذفه أو أسترجعه أو أعمل staging له.

حالة الشجرة عند الاستئناف، من `git status --short`:

```text
 M apps/api/scripts/dev-launch.mjs
```

عائق البيئة باقٍ بحسب جواب المالك: Redis@19045 رفض الاتصال وAPI@19040 غير متاحة. لم أحاول إعادة الإقلاع أو إشعال بنية أو تغيير منفذ، ولم أُعِد فتح 466 أو 551d.

### بوّابة L-33: وصف التذكرة لا يطابق المصدر الحالي

قرأت `apps/api/src/routes/renders/create.ts` بالأمر:

```bash
cat apps/api/src/routes/renders/create.ts
```

المصدر الحالي يستورد:

```ts
import { getQueuedRenderEta } from '../../queues/render-eta.js';
```

مسار إعادة الطلب بالمفتاح نفسه يحسب:

```ts
const eta = r.status === 'queued'
  ? await getQueuedRenderEta(r.id, req.dbClient!, req.log)
  : { eta_seconds: 0, saturated: false };
```

ومسار الطلب الجديد يحسب:

```ts
const eta = await getQueuedRenderEta(r.id, req.dbClient!, req.log);
```

وفي كلا الردّين السطر الموجود بالفعل هو:

```ts
estimatedStartAt: new Date(Date.now() + eta.eta_seconds * 1000).toISOString(),
```

إذن الحساب `r.created_at.getTime() + 5000` المذكور في التذكرة ليس هو الموجود في الملف الحالي. كذلك كشف أمر `rg --files apps/api/src/queue` أن مسار `queue/` المذكور غير موجود؛ الاستيراد الحالي من `queues/`.

هذه أدلّة على اختلاف نقطة البداية، وليست شهادة بأن التنفيذ الموجود يحقق معايير 467: لم أراجع helper أو أقس دقته. لم أستبدل المطلوب بتدقيق أو إعادة كتابة من عندي.

AGENTS.md، بوّابات التوقّف، L-33: «اكتشفتَ أن التوجيه مبنيّ على معلومة خاطئة — توقّف، لا تكمّل ولا تعدّل، أَبلغ.» بناءً عليه انتهى العمل عند هذه البوّابة. يلزم حكم مسجّل بشأن تطبيق معايير 467 على التنفيذ الموجود قبل مواصلة التنفيذ. قياسات dev الثلاث لا تزال غير منفّذة، ولا commit قبل حكم Opus.

لا تغييرات إنتاجية في هذه الجلسة؛ التحديث الوحيد هو هذا التقرير. لم أعدّل PHASES.md أو الوثائق المقفولة.


## القياس المُعاد بعد 01:35Z

**أ وب ناجحان وفق الحكم المعدّل؛ تصعيد إلى Opus لختم البند 7، ولم أضع ✅ بنفسي.** ج=1500ms مقبول بحكمه السابق ولم يُعَد قياسه.

القياسان يستدعيان getRenderEta مباشرةً على BullMQ الحقيقي بمتوسط مُدخل 8s؛ لا يدّعيان اختبار POST /renders أو getQueuedRenderEta أو تقدير المتوسط من التاريخ. استُخدم tenantId اصطناعي ثابت داخل كل قياس وحمولة renderId جديدة لكل مهمة. الحالة الفعلية للمهام الموقوفة ذات الأولوية هي prioritized، لا waiting؛ قائمة getJobs المطلوبة رصدتها بالكامل.

### أ — الأمر الحرفي

```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { cleanDevEnvironment, readLocalEnvironment } from './apps/api/scripts/dev-environment.mjs';
Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, closeQueues } = await import('./apps/api/src/queues/index.ts');
const { getRenderEta } = await import('./apps/api/src/queues/render-eta.ts');
const queue = getQueue('normal');
const jobs = [];
const tenantId = randomUUID();
let pausedByMeasurement = false;
const counts = () => queue.getJobCounts('waiting','prioritized','delayed','active','paused');
const listed = () => queue.getJobs(['waiting','prioritized','delayed']).then(j => j.map(x => x.id));
try {
  const response = await fetch('http://127.0.0.1:19040/v1/health');
  const health = await response.json();
  console.log(JSON.stringify({http:response.status,health}));
  assert.equal(response.status,200);
  assert.ok(health.workers.edit >= 1);
  const before = await counts();
  console.log(JSON.stringify({phase:'before',counts:before,paused:await queue.isPaused()}));
  assert.ok(Object.values(before).every(n => n === 0));
  assert.equal(await queue.isPaused(),false);
  await queue.pause();
  pausedByMeasurement = true;
  console.log(JSON.stringify({phase:'paused-before-add',counts:await counts()}));
  const first = await queue.add('render',{renderId:randomUUID(),tenantId},{priority:5});
  jobs.push(first);
  console.log(JSON.stringify({phase:'first-added',id:first.id,state:await first.getState(),ids:await listed(),counts:await counts()}));
  const etaFirst = await getRenderEta({queueName:'normal',priority:5,renderId:first.id,averageSeconds:8},{warn:console.log});
  await setTimeout(100);
  const second = await queue.add('render',{renderId:randomUUID(),tenantId},{priority:5});
  jobs.push(second);
  const ids = await listed();
  console.log(JSON.stringify({phase:'second-added',id:second.id,state:await second.getState(),ids,counts:await counts()}));
  const etaSecond = await getRenderEta({queueName:'normal',priority:5,renderId:second.id,averageSeconds:8},{warn:console.log});
  const delta = etaSecond.eta_seconds - etaFirst.eta_seconds;
  const pass = ids.includes(first.id) && ids.includes(second.id) && delta >= 4;
  console.log(JSON.stringify({measurement:'467-a-paused',etaFirst,etaSecond,delta,minimumDelta:4,pass}));
  if (!pass) process.exitCode = 1;
} finally {
  if (pausedByMeasurement) {
    try { await queue.resume(); } catch (e) { console.log(JSON.stringify({resumeError:e.message})); process.exitCode=1; }
    let removed=0;
    for (const job of jobs) {
      for (let attempt=0;attempt<20;attempt++) {
        try { await job.remove(); removed++; break; }
        catch (e) { if(attempt===19) {console.log(JSON.stringify({cleanupError:e.message,jobId:job.id}));process.exitCode=1;} else await setTimeout(100); }
      }
    }
    console.log(JSON.stringify({phase:'cleanup',removed,counts:await counts(),paused:await queue.isPaused()}));
  }
  await closeQueues();
}
JS
```

stdout كامل (stderr فارغ):
```json
{"http":200,"health":{"status":"ok","ts":"2026-09-25T01:41:09.863Z","commit":"e79819dc3aa2393cea9ea0ad1669c78ab160cd82","cwd":"/Users/mdervis/MediaKit/pf-mediakit-api/apps/api","workers":{"urgent":1,"normal":1,"edit":1,"batch":1}}}
{"phase":"before","counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"paused":false}
{"phase":"paused-before-add","counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0}}
{"phase":"first-added","id":"3","state":"prioritized","ids":["3"],"counts":{"waiting":0,"prioritized":1,"delayed":0,"active":0,"paused":0}}
{"phase":"second-added","id":"4","state":"prioritized","ids":["4","3"],"counts":{"waiting":0,"prioritized":2,"delayed":0,"active":0,"paused":0}}
{"measurement":"467-a-paused","etaFirst":{"eta_seconds":1.5,"saturated":false},"etaSecond":{"eta_seconds":9.5,"saturated":false},"delta":8,"minimumDelta":4,"pass":true}
{"phase":"cleanup","removed":2,"counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"paused":false}

```
exit=0.

### ب — الأمر الحرفي

```sh
env -u PORT -u REDIS_URL -u DATABASE_URL_APP -u DATABASE_URL_PLATFORM -u S3_ENDPOINT -u S3_PUBLIC_ENDPOINT -u S3_BUCKET -u BULLMQ_PREFIX -u CORS_ORIGIN node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { cleanDevEnvironment, readLocalEnvironment } from './apps/api/scripts/dev-environment.mjs';
Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, closeQueues } = await import('./apps/api/src/queues/index.ts');
const { getRenderEta } = await import('./apps/api/src/queues/render-eta.ts');
const batch=getQueue('batch'), urgent=getQueue('urgent');
const jobs=[];
const tenantId=randomUUID();
let urgentJob, pausedByMeasurement=false;
const counts=q=>q.getJobCounts('waiting','prioritized','delayed','active','paused');
const listed=q=>q.getJobs(['waiting','prioritized','delayed']).then(j=>j.map(x=>x.id));
async function remove(job) {
  for(let attempt=0;attempt<20;attempt++) {
    try { await job.remove(); return 1; }
    catch(e) { if(attempt===19) {console.log(JSON.stringify({cleanupError:e.message,jobId:job.id}));process.exitCode=1;return 0;} await setTimeout(100); }
  }
}
try {
  const response=await fetch('http://127.0.0.1:19040/v1/health');
  const health=await response.json();
  console.log(JSON.stringify({http:response.status,health}));
  assert.equal(response.status,200);
  assert.ok(health.workers.edit>=1);
  for(const q of [batch,urgent]) {
    const before=await counts(q);
    console.log(JSON.stringify({phase:'before',queue:q.name,counts:before,paused:await q.isPaused()}));
    assert.ok(Object.values(before).every(n=>n===0));
    assert.equal(await q.isPaused(),false);
  }
  await batch.pause(); pausedByMeasurement=true;
  console.log(JSON.stringify({phase:'paused-before-add',queue:batch.name,counts:await counts(batch)}));
  for(let i=0;i<20;i++) {
    const job=await batch.add('render',{renderId:randomUUID(),tenantId},{priority:10});
    jobs.push(job);
    console.log(JSON.stringify({phase:'batch-added',index:i+1,id:job.id,ids:await listed(batch)}));
  }
  urgentJob=await urgent.add('render',{renderId:randomUUID(),tenantId},{priority:1});
  console.log(JSON.stringify({phase:'urgent-added',id:urgentJob.id,ids:await listed(urgent),state:await urgentJob.getState()}));
  const eta=await getRenderEta({queueName:'urgent',priority:1,renderId:urgentJob.id,averageSeconds:8},{warn:console.log});
  const batchIds=await listed(batch);
  const pass=batchIds.length===20 && eta.eta_seconds<=3;
  console.log(JSON.stringify({measurement:'467-b-paused',batchDepth:batchIds.length,batchCounts:await counts(batch),eta,maximumSeconds:3,pass}));
  if(!pass) process.exitCode=1;
} finally {
  const urgentRemoved=urgentJob?await remove(urgentJob):0;
  let batchRemoved=0;
  if(pausedByMeasurement) {
    try { await batch.resume(); } catch(e) {console.log(JSON.stringify({resumeError:e.message}));process.exitCode=1;}
    for(const job of jobs) batchRemoved+=await remove(job);
  }
  console.log(JSON.stringify({phase:'cleanup',urgentRemoved,batchRemoved,batchCounts:await counts(batch),urgentCounts:await counts(urgent),batchPaused:await batch.isPaused(),urgentPaused:await urgent.isPaused()}));
  await closeQueues();
}
JS
```

stdout كامل (stderr فارغ):
```json
{"http":200,"health":{"status":"ok","ts":"2026-09-25T01:41:39.476Z","commit":"e79819dc3aa2393cea9ea0ad1669c78ab160cd82","cwd":"/Users/mdervis/MediaKit/pf-mediakit-api/apps/api","workers":{"urgent":1,"normal":1,"edit":1,"batch":1}}}
{"phase":"before","queue":"render-batch","counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"paused":false}
{"phase":"before","queue":"render-urgent","counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"paused":false}
{"phase":"paused-before-add","queue":"render-batch","counts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0}}
{"phase":"batch-added","index":1,"id":"1","ids":["1"]}
{"phase":"batch-added","index":2,"id":"2","ids":["2","1"]}
{"phase":"batch-added","index":3,"id":"3","ids":["3","2","1"]}
{"phase":"batch-added","index":4,"id":"4","ids":["4","3","2","1"]}
{"phase":"batch-added","index":5,"id":"5","ids":["5","4","3","2","1"]}
{"phase":"batch-added","index":6,"id":"6","ids":["6","5","4","3","2","1"]}
{"phase":"batch-added","index":7,"id":"7","ids":["7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":8,"id":"8","ids":["8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":9,"id":"9","ids":["9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":10,"id":"10","ids":["10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":11,"id":"11","ids":["11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":12,"id":"12","ids":["12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":13,"id":"13","ids":["13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":14,"id":"14","ids":["14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":15,"id":"15","ids":["15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":16,"id":"16","ids":["16","15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":17,"id":"17","ids":["17","16","15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":18,"id":"18","ids":["18","17","16","15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":19,"id":"19","ids":["19","18","17","16","15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"batch-added","index":20,"id":"20","ids":["20","19","18","17","16","15","14","13","12","11","10","9","8","7","6","5","4","3","2","1"]}
{"phase":"urgent-added","id":"1","ids":["1"],"state":"active"}
{"measurement":"467-b-paused","batchDepth":20,"batchCounts":{"waiting":0,"prioritized":20,"delayed":0,"active":0,"paused":0},"eta":{"eta_seconds":1.5,"saturated":false},"maximumSeconds":3,"pass":true}
{"phase":"cleanup","urgentRemoved":1,"batchRemoved":20,"batchCounts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"urgentCounts":{"waiting":0,"prioritized":0,"delayed":0,"active":0,"paused":0},"batchPaused":false,"urgentPaused":false}

```
exit=0.

### النتيجة والتصعيد

- أ: etaFirst=1.5s، etaSecond=9.5s، delta=8s ≥ 4s. رُصدت المهمة الأولى ثم المهمتان في prioritized أثناء pause. التنظيف في finally بعد resume أزال 2.
- ب: عمق batch المرصود=20، urgent ETA=1.5s ≤ 3s. لم يُوقف urgent؛ ظهر معرّفه في القائمة ثم كانت حالته active عند قراءة الحالة اللاحقة، فلا ندّعي بقاءه منتظراً. التنظيف في finally حذف urgent أولاً (1)، ثم استأنف batch وحذف 20.
- مجموع ما أُزيل في الإعادة: 23 مهمة قياس. العدادات waiting/prioritized/delayed/active/paused عادت صفراً، وnormal وbatch غير موقوفين. احتوى التنظيف إعادة محاولة محدودة لحذف المهام عند احتمال التقاط العامل لها بعد resume.
- ج: القيمة التاريخية 1500ms مقبولة بأمر Opus؛ لم تُعَد التجربة.
- أطلب حكم Opus لختم البند 7 بناءً على الأرقام أعلاه. لا مصدر تغيّر، لا PHASES، ولا commit. بقي تعديل dev-launch.mjs السابق من 466 كما هو.

التحقق الختامي:
```sh
git status --short
curl -sS --max-time 5 http://127.0.0.1:19040/v1/health
```
stdout كامل:
```text
 M apps/api/scripts/dev-launch.mjs
{"status":"ok","ts":"2026-09-25T01:41:51.449Z","commit":"e79819dc3aa2393cea9ea0ad1669c78ab160cd82","cwd":"/Users/mdervis/MediaKit/pf-mediakit-api/apps/api","workers":{"urgent":1,"normal":1,"edit":1,"batch":1}}
```


## الإغلاق — حكم Opus 01:50Z

حكم Opus 01:50Z: أ+ب مقبولان + مصدر `renders/create.ts:87,92,218,223` مقروء ⇒ الشقّ الخلفيّ من البند 7 ✅. الشقّ الأماميّ يخصّ mkst بعد 551. لا مصدرَ تغيّر في هذه التذكرة.

رُوجع فرق dev-launch.mjs ومراجع تشغيل 461 و463: امتداد 466 يكتب PID العامل وينظّفه عند الخروج، ولا يقرأه للإقلاع أو respawn. أُعيد الملف بأمر `git checkout HEAD -- apps/api/scripts/dev-launch.mjs` المأذون. نجح `node --check apps/api/scripts/dev-launch.mjs` و`git diff --exit-code -- apps/api/scripts/dev-launch.mjs` (exit=0).

التقرير الأصلي محفوظ هنا بالمسار المطلق المأذون؛ نُسخت محتوياته إلى المسار النسبي نفسه في شجرة feat/api لغرض الالتزام المأذون للتقرير وحده. لم يُعدّل main أو PHASES.
