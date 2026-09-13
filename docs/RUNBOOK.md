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
