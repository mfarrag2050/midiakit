# docs/RUNBOOK.md — ما الذي يعمل؟ من أيّ شجرة؟

> **صفحة واحدة تُنهي سؤال «ما الذي يعمل؟»** (170-RUNBOOK-WHO-RUNS-WHAT). كلّ خدمة يحتاجها العرض: اسمها · منفذها · الشجرة التي **يجب** أن تعمل منها · وأمر تشغيلها في سطرٍ واحد قابل للّصق. **لا شيء يعمل خارج هذا الجدول شرعياً.**

## §1 · جدول الخدمات — مصدر الحقيقة

| # | الخدمة | المنفذ | الشجرة الصحيحة | أمر التشغيل (سطر واحد قابل للّصق) |
|---|---|---|---|---|
| 1 | **postgres dev** | `127.0.0.1:19041` | حاوية (لا شجرة) — تُدار من `pf-mediakit-dash` | `cd ~/MediaKit/pf-mediakit-dash && ./bin/mk -f infra/docker-compose.yml up -d postgres-dev` |
| 2 | **postgres test** | `127.0.0.1:19042` | حاوية | `cd ~/MediaKit/pf-mediakit-dash && ./bin/mk -f infra/docker-compose.yml up -d postgres-test` |
| 3 | **MinIO dev** (S3) | `127.0.0.1:19043` | حاوية | `cd ~/MediaKit/pf-mediakit-dash && ./bin/mk -f infra/docker-compose.yml up -d minio minio-init` |
| 4 | **MinIO dev** (console) | `127.0.0.1:19044` | حاوية | (يقلع مع الأمر أعلاه) |
| 5 | **Redis (host)** | `127.0.0.1:6379` DB/3 | brew service (لا شجرة) | `brew services start redis` |
| 6 | **mk-api (dev)** | `127.0.0.1:19040` | `~/MediaKit/pf-mediakit-api` على `feat/api` أو `main` | `cd ~/MediaKit/pf-mediakit-api/apps/api && node --import tsx src/server.ts` |
| 7 | **mk-studio (dev)** | `127.0.0.1:19050` | `~/MediaKit/pf-mediakit-studio` على `feat/studio` أو `main` | `cd ~/MediaKit/pf-mediakit-studio/apps/studio && pnpm dev` |
| 8 | **api-worker (dev · عامل الرندَر)** | لا منفذ (BullMQ) | `~/MediaKit/pf-mediakit-api` على `feat/api` أو `main` | `cd ~/MediaKit/pf-mediakit-api/apps/renderer && node --import tsx src/api-worker.ts` |
| 9 | **diacritizer** (Python) | `127.0.0.1:19080` | `~/MediaKit/pf-mediakit-studio/services/diacritizer` | (يقلعه mkst — راجع `services/diacritizer/README`) |
| 10 | **transcriber** (Python) | `127.0.0.1:19081` | `~/MediaKit/pf-mediakit-studio/services/transcriber` | (نفسه) |
| 11 | **face-detector** (Python) | `127.0.0.1:19082` | `~/MediaKit/pf-mediakit-studio/services/face-detector` | (نفسه) |
| 12 | **Showroom stack (postgres/redis/minio/api/studio)** | `19062-19065 · 19070-19071` | `~/MediaKit/pf-mediakit-show` على وسم `show-YYYYMMDD-N` | `cd ~/MediaKit/pf-mediakit-dash && ./bin/mk show up` (راجع `docs/SHOWROOM.md`) |
| 13 | **نفق العرض** (`mkdemo.primeflow.co` · خلف Cloudflare Access) | خارج · 443 (Cloudflare edge) → داخل: `19070/19071/19064` | لا شجرة (خدمة cloudflared) — التهيئة في `~/.cloudflared/mkdemo.yml` | `nohup cloudflared --config ~/.cloudflared/mkdemo.yml tunnel run <معرّف النفق> > /tmp/mkdemo-tunnel/tunnel.log 2>&1 &` — راجع §8 |

**عامل الرندَر (#8) غاب طوال ليلة 490** — إن لم يظهر في `mk-runbook
status`، لن يُنشَأ رندر حيّ لمحمد (BullMQ jobs تُضاف لكن لا مستهلك).
شغّله بالأمر أعلاه.

## §2 · شجرات مسموحة (`git worktree list`)

| الشجرة | الفرع الأصلح | مسؤولها | الغرض |
|---|---|---|---|
| `~/MediaKit/pf-mediakit` | `main` | (أرشيف · نادراً) | نسخة `main` نظيفة للمرجع |
| `~/MediaKit/pf-mediakit-api` | `feat/api` | mkap | تطوير API + عامل الرندَر |
| `~/MediaKit/pf-mediakit-studio` | `feat/studio` | mkst | تطوير Studio + خدمات Python |
| `~/MediaKit/pf-mediakit-dash` | `feat/ci` | mkci (أنا) | CI + بيئة العرض |
| `~/MediaKit/pf-mediakit-show` | detached @ `show-*` | mkci (تشغيل) | بيئة العرض للشريك |
| `~/MediaKit/pf-mediakit-audit` | detached @ SHA | mkau | تدقيق read-only |

**شجرات غير مسموح لها أن تخدم منافذ 190xx:**
- `pf-mediakit-audit/` — للتدقيق فقط، لا خدمة قيد التشغيل.
- `/tmp/*` (أيّ شجرة عابرة) — للاختبار المؤقّت، تُطفَأ بعد الانتهاء.

## §3 · أمر «ما الذي يعمل الآن؟» — سطر واحد

```bash
~/MediaKit/pf-mediakit-dash/bin/mk-runbook status
```

يُطبع جدول حيّ: منفذ · PID · اسم العمليّة · الشجرة · فرع/SHA · هل الشجرة ancestor لـ`origin/main`.

## §4 · أمر «أوقف ما لا يجب أن يعمل» — يسمّي فقط، لا يقتل

```bash
~/MediaKit/pf-mediakit-dash/bin/mk-runbook audit
```

يقارن الحال الفعليّ بجدول §1 ويسمّي كلّ عمليّة على منفذ 190xx تعمل من
شجرة ليست في الجدول. **لا `kill` — محمد يقرّر.**

## §5 · الجدول المرجعيّ الذي يعتمده audit

`bin/mk-runbook expected` — يطبع أزواج `port|worktree_prefix|label`
المُعلَنة في السكربت. هذا مصدر «الصحّة» الآليّ. إن أضفتَ خدمة جديدة
لجدول §1، **حدّث `EXPECTED_TABLE` في `bin/mk-runbook`** — وإلّا audit
سيسمّيها غريبةً.

## §6 · ما لا يفعله هذا الملفّ

- **لا يشرح كيف تُبنى الخدمات** — راجع `docs/SHOWROOM.md` للشوروم،
  README كلّ حزمة للتطوير.
- **لا يوثّق أسراراً** — الأسرار في ملفّات `.env*` (خارج git). لا كلمة
  مرور واحدة هنا.
- **لا يشرح CI** — راجع `.github/workflows/ci.yml`.

## §7 · قواعد صيانة هذا الملفّ

1. **الجدول §1 مصدر الحقيقة الوحيد.** إن ظهرت خدمة جديدة تعمل بلا
   إدخالها هنا → عليك أنت (المسؤول عنها) إضافتها.
2. **audit ينبغي أن يعطي «صفر غرباء» في الحال المستقرّة.** إن لم يعطِ
   ذلك، فإمّا الجدول ناقص، أو ثمّة خدمة يجب أن تُنقَل.
3. **L-103:** أيّ رقم في هذا الملفّ ينبغي أن يُقاس، لا يُذكر من الذاكرة.
   `mk-runbook status` هو المصدر.

## §8 · نفق العرض `mkdemo.primeflow.co` (Cloudflare Tunnel + Access)

> **الغرض:** رابط واحد يفتحه شريك على الشوروم خلف Cloudflare Access.
> نُقل من `claude/infra/mkdemo-tunnel.md` (أرض المالك) إلى هنا (أرض
> `docs/`) كموضعه الدائم — `_AMEND-190-RECORD-IT`.

**لا سرّ في هذا القسم.** الاسم والمعرّف والمسار والمضيف
مُعرِّفات، لا اعتمادات. محتوى `.json` لا يُنسخ ولا يُطبع — يُشار إلى
مساره فقط.

### §8.أ · المُعرِّفات

| المفتاح | القيمة |
|---|---|
| اسم النفق | `mediakit-mini` |
| معرّف النفق | `06be8e42-efd0-43f5-8ab8-25ff74cf3a52` |
| ملفّ الاعتماد (مسار · لا محتوى) | `~/.cloudflared/06be8e42-efd0-43f5-8ab8-25ff74cf3a52.json` |
| ملفّ التهيئة | `~/.cloudflared/mkdemo.yml` |
| المضيف | `mkdemo.primeflow.co` |
| تطبيق Access | `mkdemo` (Self-hosted) |
| سياسة Access | `MediaKit demo — Muhammed + partner` · Include = Emails (اثنان) |
| مدّة الجلسة | ٢٤ ساعة |

**قاعدة الاستدلال (`_AMEND-190i`):** كلّ أمر `cloudflared` لهذا النفق
يستعمل **المعرّف** لا الاسم. مطابقة الأسماء في `cloudflared v2026.5.0`
أخطأت مرّة — لا تُؤتمن مرّتين.

### §8.ب · الأبواب الثلاثة (Ingress · الترتيب مُلزِم)

| المسار | الوجهة الداخليّة | مصدر القياس |
|---|---|---|
| `/v1/*` | `127.0.0.1:19070` (API الشوروم) | **بادئة مؤكَّدة بالقياس (`_AMEND-190i §1`):** `curl 127.0.0.1:19060/health → 404` مقابل `.../v1/health → 200`. مصدر النصّ: `apps/api/src/server.ts` — كلّ المسارات تحت `prefix: '/v1'`. |
| `/mk-assets-show/*` | `127.0.0.1:19064` (MinIO الشوروم) | `bin/mk-show:S3_BUCKET=mk-assets-show` + `storage/index.ts:forcePathStyle` — شكل الرابط `<endpoint>/<bucket>/<key>` |
| `/*` (catch-all للمضيف) | `127.0.0.1:19071` (استوديو الشوروم) | `bin/mk-show:STUDIO_PORT` |
| أيّ مضيف آخر | `http_status:404` | Ingress افتراضيّ |

**الأخصّ أوّلاً**، وإلّا ابتلع `/*` كلّ شيء.

**لماذا الباب الثاني (`/mk-assets-show/*`)?** زرّ التصدير يجلب الملفّ
بالمتصفّح نفسه — الرابط الموقَّت مبنيّ على `S3_PUBLIC_ENDPOINT`.
تفصيل في `docs/SHOWROOM.md` وتذكرة `290-PRESIGN-PUBLIC-ENDPOINT`.

### §8.ج · الشرطان الحاكمان (`.env.show` — بلا قيَم هنا)

- `NEXT_PUBLIC_API_URL=https://mkdemo.primeflow.co` — Studio يستدعي
  API من متصفّح الشريك، لا من الميني. بلا هذا: صفحة تفتح ثمّ ينهار
  كلّ فعل.
- `S3_PUBLIC_ENDPOINT=https://mkdemo.primeflow.co` — presign للمتصفّح
  فقط. `S3_ENDPOINT=http://127.0.0.1:19064` يبقى للـPUT الداخليّ.
  بلا هذا: زرّ التصدير مكسور (mixed-content + 127.0.0.1 = جهاز
  الشريك).

### §8.د · القواعد الستّ — لا تُخرَق

1. **لا نلمس `/etc/cloudflared/config.yml`** — يشغّل نفق
   `primemind-mini` (SSH محمد + ويبهوك Zoom حقيقيّ). إعادة تشغيله قد
   تُضيّع ويبهوكاً.
2. **كلّ أمر لهذا النفق يحمل `--config` بمساره كاملاً.** يوجد
   `~/.cloudflared/config.yml` ساكن لا يعمل — بلا `--config` صريح
   يلتقطه cloudflared ويوجّه إلى خدمات PrimeMind.
3. **الشوروم فقط خلف هذا النفق — لا التطوير.** dev فيه مستأجرات محمد
   + `fixtures/` تحوي أسماء وكالات حقيقيّة.
4. **loopback فقط.** لا `0.0.0.0` — النفق يصل من `127.0.0.1`.
5. **لا ترقية `cloudflared` الآن** (2026.5.0 · الأحدث 2026.9.1) —
   البرنامج نفسه يشغّل PrimeMind الحيّ.
6. **سياستان منفصلتان.** لا تُرفَق `Mohammed only` بهذا التطبيق —
   تعديلها لاحقاً لإضافة الشريك يفتح له باب SSH إلى الميني في اللحظة
   نفسها.

### §8.هـ · أوامر التشغيل

```bash
# validate (تجريبيّ · لا يُشغّل)
cloudflared tunnel --config ~/.cloudflared/mkdemo.yml ingress validate

# تشغيل في الخلفيّة + سجلّ
mkdir -p /tmp/mkdemo-tunnel
nohup cloudflared --config ~/.cloudflared/mkdemo.yml \
  tunnel run 06be8e42-efd0-43f5-8ab8-25ff74cf3a52 \
  > /tmp/mkdemo-tunnel/tunnel.log 2>&1 &
echo $! > /tmp/mkdemo-tunnel/tunnel.pid

# حال النفق (بالمعرّف · لا بالاسم)
cloudflared tunnel info 06be8e42-efd0-43f5-8ab8-25ff74cf3a52

# قياس حاسم (المتوقّع: 302 إلى primetunnel.cloudflareaccess.com)
curl -sS -o /dev/null -D - --max-time 20 https://mkdemo.primeflow.co/v1/health
```

**تنبيه:** `route dns` كذلك بالمعرّف لا الاسم — `route dns
<tunnel-id-uuid> mkdemo.primeflow.co`. الاسم أعطى نتيجةً خاطئةً مرّةً
(`_AMEND-190i`).

### §8.و · مصادر مرجعيّة

- سجلّ الإنشاء الأصليّ (بيد المالك): `claude/infra/mkdemo-tunnel.md`.
- التقارير الحرجة: `_AMEND-190d/e/f/g/h/i/j-*.md` (مسار الاكتشاف
  والتصحيح · درس «لا تستنتج قبل القياس»).
- شرط تصدير التخزين: `290-INTEGRATED-INTO-SHOW.md` (S3_PUBLIC_ENDPOINT).
