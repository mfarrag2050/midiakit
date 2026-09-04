# 16 — عقد الواجهة (Phase 4 API Contract)

> **الغاية:** يبني mk-api البنية وتبني mk-studio الواجهة **بالتوازي**.
> هذا الملف يحدّد شكل كل نقطة نهاية قبل بنائها — فلا تنتظر الواجهة
> ولا تخمّن.
>
> **مسؤولية الملف:** واجهة عامة فقط. لا مخطط قاعدة، لا كود، لا تفاصيل
> تنفيذ. البنية حرّة في اختيار الأدوات ما دامت تحترم العقد.
>
> **أول قراءة قبل التنفيذ:** المصادر في `docs/02, 03, 09, 13, 14, 15` +
> `PHASES.md §المرحلة 4` + قسم «القيود الحاكمة» أدناه.

---

## 1. القواعد العامة

### 1.1 الإصدار

كل المسارات تبدأ بـ`/v1/`. تغييرات مكسورة للتوافق تدخل تحت `/v2/`
مع بقاء `/v1/` عاملاً لفترة انتقال محدَّدة (يحدّدها المالك عند وقتها).

### 1.2 المصادقة

- **الشكل:** Bearer Token في رأس `Authorization`:
  ```
  Authorization: Bearer <JWT>
  ```
- **الحمولة:** JWT يحمل — على الأقل — `sub` (user_id) و `tenant_id` و
  `role` و `exp`.
- **قواعد ثابتة:**
  - **`tenant_id` من JWT حصراً** — لا يُقبل من المسار ولا من الـbody
    ولا من رأس مخصّص (تفادي انتحال المستأجر).
  - انتهاء الصلاحية قصير (يقترحه mk-api — سؤال مفتوح Q1).
  - Refresh عبر endpoint مخصّص (§2.3).

### 1.3 عزل المستأجرين (RLS)

- **RLS مُفعَّل على كل جدول تحت مستأجر** — على مستوى PostgreSQL لا كود
  التطبيق. مسؤولية mk-api ضبط `SET LOCAL app.tenant_id = <من JWT>` على
  كل معاملة قبل أول استعلام.
- **الاختبار الحاسم:** جلسة `tenant_A` لا ترى أيّ سجل لـ`tenant_B` عبر
  أي endpoint، حتى بتخمين المعرّف. الاستجابة لسجل موجود لكن خارج
  المستأجر = **404 `NOT_FOUND`** (لا 403؛ 403 يكشف الوجود).
- **تفصيل بوابة تحقّق RLS في `PHASES-docs.md §15 G6`** (مؤجَّلة للمرحلة 4).

### 1.4 تنسيق الأخطاء الموحّد

كل خطأ يعيد جسم JSON بهذا الشكل، **بلا استثناء**:

```json
{
  "error": {
    "code": "STRING_UPPER_SNAKE",
    "message": "<key i18n — لا نصّ مقدَّم للمستخدم>",
    "field": "<اسم الحقل عند خطأ التحقق، وإلا null>",
    "requestId": "req_01H..."
  }
}
```

- **`code`** UPPER_SNAKE ثابت (وثيقة الأخطاء تُبنى مع mk-api).
- **`message`** مفتاح i18n لا نصّ — L-22 (رسائل الخادم مفاتيح لا نصوصاً،
  CLAUDE.md §قواعد مستمدَّة من الدروس).
- **`field`** اسم الحقل الفاشل (`brand_kit_id`, `content.title`, …) عند
  خطأ تحقّق، وإلا `null`.
- **`requestId`** لتتبّع الطلب في سجلات mk-api.

**رموز HTTP الشائعة:**

| رمز | حالة الاستعمال |
|---|---|
| 200 | نجاح مع body |
| 201 | إنشاء مورد جديد (Location header + body) |
| 202 | قُبِل، معالجة غير متزامنة (renders) |
| 204 | نجاح بلا body |
| 400 | خطأ تحقّق مدخلات |
| 401 | مصادقة مفقودة / منتهية |
| 403 | مصادَق لكن بلا صلاحية |
| 404 | مورد غير موجود (يشمل RLS mismatch) |
| 409 | تضارب حالة (تحرير قديم، تحوّل غير مسموح…) |
| 413 | حمولة كبيرة (رفع) |
| 422 | مدخل صالح شكلاً لكن مرفوض دلالياً (licenseAck=false مثلاً) |
| 429 | تجاوز حصّة |
| 500 | خطأ خادم غير متوقّع |
| 503 | خدمة معتمَدة معطَّلة (خدمة التفريغ مثلاً) |

**قاعدة الأخطاء الشاملة (L-04):** كل خطأ يُرمى مبكراً وواضحاً — لا
تراجع صامت في المدخلات.

### 1.5 الترقيم (Pagination)

**النمط:** cursor-based. الأسباب: (١) مستقرّ عند إضافة/حذف سجلات، (٢)
لا مشكلة «الصفحة تنزلق».

**شكل الطلب:**
```
GET /v1/{resource}?limit=<int>&cursor=<opaque>
```

**شكل الاستجابة:**
```json
{
  "data": [...],
  "nextCursor": "opaque_or_null",
  "hasMore": true
}
```

**الحدود:**
- `limit` افتراضي 20، أقصى 100. تجاوز 100 → 400 `LIMIT_TOO_LARGE`.
- `cursor` مبهم (opaque) — لا يفكّه الواجهة، تُرسله كما استلمته.

### 1.6 التصفية والترتيب

**الاتفاق الأساسي — تفاصيل لكل مورد في قسمه:**

```
?filter[<field>]=<value>          # مساواة
?filter[<field>][gte]=<value>     # ≥
?filter[<field>][lte]=<value>     # ≤
?filter[<field>][in]=a,b,c        # ضمن مجموعة
?sort=<field>                     # تصاعدي
?sort=-<field>                    # تنازلي
?sort=<f1>,-<f2>                  # متعدد
```

**الحدود:** كل مورد يعلن الحقول المسموح التصفية/الترتيب عليها؛ حقل خارج
القائمة → 400 `INVALID_FILTER_FIELD`. **السبب:** الحقول الحرّة تُنتج
استعلامات بلا فهرس — تكلفة أداء عمياء.

### 1.7 Idempotency للعمليات المُنشِئة

`POST /v1/renders` و `POST /v1/subscription/checkout` وأي عملية تُنشئ
مورداً بأثر خارجي (فوترة، طابور) **تقبل** رأس `Idempotency-Key`:

```
Idempotency-Key: <uuid>
```

نفس المفتاح خلال 24 ساعة → نفس الاستجابة (لا إنشاء مكرَّر). عدم إرسال
المفتاح مقبول لكن غير موصى به.

### 1.8 التوقيت

كل حقول الوقت في الاستجابات: **ISO 8601 UTC** بدقة الميلي ثانية.
```
"createdAt": "2026-09-04T14:23:11.523Z"
```

المدخلات تُقبل بالصيغة نفسها. أي timezone خام (بلا Z أو offset) → 400
`INVALID_TIMESTAMP`.

### 1.9 الأدوار (يُشار إليها في كل endpoint)

من `docs/15-editorial-workflow.md`:

| الدور | صلاحيات مختصرة |
|---|---|
| `owner` | كل شيء داخل المستأجر + الفوترة |
| `admin` | كل شيء عدا الفوترة وترقية `assets.version` وإدارة الأدوار |
| `writer` | إنشاء مسودات، تعديل مشاريعه |
| `editor` | تعديل مشاريع الآخرين ضمن حالات محدَّدة |
| `reviewer` | مراجعة + طلب تعديل (لا اعتماد) |
| `approver` | اعتماد نهائي + رفض |
| `viewer` | قراءة فقط |

**ملاحظة:** «`admin`» يترقّى إلى `assets.version` عبر endpoint مخصّص
(§8) لا PATCH عام. سبب: L-29 (الأصول الخارجية تتغيّر — الترقية قرار
حسّاس، ليست تعديل حقل).

---

## 2. Sessions (المصادقة)

**tenant_id:** غير مطلوب في هذا القسم — الجلسة تُنشئه.

### 2.1 POST /v1/auth/signup

**الوصف:** إنشاء مستأجر جديد + مستخدم `owner` أول.
**الدور:** عام (بلا مصادقة).

**المدخلات:**
```json
{
  "email": "string (required, RFC-5322)",
  "password": "string (required, min 12 chars)",
  "tenantName": "string (required)",
  "locale": "'ar'|'mixed'|'en' (optional, default 'ar')"
}
```

**الاستجابة (201):**
```json
{
  "user": { "id": "usr_...", "email": "...", "role": "owner" },
  "tenant": { "id": "tnt_...", "name": "...", "plan": "trial" },
  "session": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
}
```

**الأخطاء:**
- 400 `INVALID_EMAIL` / `PASSWORD_TOO_WEAK` / `TENANT_NAME_EMPTY`
- 409 `EMAIL_TAKEN`

### 2.2 POST /v1/auth/login

**الوصف:** تسجيل دخول مستخدم قائم.
**الدور:** عام.

**المدخلات:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**الاستجابة (200):**
```json
{
  "session": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 },
  "user": { "id": "usr_...", "role": "..." },
  "tenant": { "id": "tnt_...", "name": "...", "plan": "..." }
}
```

**الأخطاء:**
- 401 `INVALID_CREDENTIALS` (بلا تمييز بين «بريد غير موجود» و«كلمة خطأ» — تفادي كشف الحسابات)
- 403 `ACCOUNT_SUSPENDED` (المستأجر متوقّف — فاتورة، إساءة استخدام)

### 2.3 POST /v1/auth/refresh

**الوصف:** استبدال refresh token بـaccess token جديد.
**الدور:** عام (يعتمد على refresh token).

**المدخلات:**
```json
{ "refreshToken": "string (required)" }
```

**الاستجابة (200):**
```json
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
```

**الأخطاء:**
- 401 `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_EXPIRED`

### 2.4 DELETE /v1/auth/logout

**الوصف:** إبطال الـtoken الحالي + refresh المرافق.
**الدور:** أيّ مصادَق.

**المدخلات:** بلا body (يُلغى الـtoken المُرسَل في الـheader).

**الاستجابة (204):** بلا body.

### 2.5 POST /v1/auth/forgot-password

**المدخلات:** `{ "email": "string" }`
**الاستجابة (204):** دائماً 204 (لا كشف وجود البريد).
**الأثر:** إرسال بريد يحوي رمز استعادة (خارج نطاق العقد).

### 2.6 POST /v1/auth/reset-password

**المدخلات:**
```json
{
  "token": "string (from email)",
  "newPassword": "string (min 12)"
}
```
**الاستجابة (204).**
**الأخطاء:** 400 `INVALID_RESET_TOKEN` / `TOKEN_EXPIRED` / `PASSWORD_TOO_WEAK`.

---

## 3. Tenants

**tenant_id:** ضمنيّ من الجلسة — لا يظهر في المسار.

### 3.1 GET /v1/tenant

**الوصف:** معلومات المستأجر الحالي.
**الدور:** أيّ مصادَق.

**الاستجابة (200):**
```json
{
  "id": "tnt_...",
  "name": "string",
  "plan": "'trial'|'starter'|'studio'|'agency'|'api'",
  "locale": "'ar'|'mixed'|'en'",
  "createdAt": "ISO",
  "seats": { "used": 4, "limit": 5 }
}
```

### 3.2 PATCH /v1/tenant

**الوصف:** تعديل اسم المستأجر أو locale الافتراضي.
**الدور:** `owner` فقط.

**المدخلات:** جزئي (patch)
```json
{
  "name": "string (optional)",
  "locale": "'ar'|'mixed'|'en' (optional)"
}
```

**الاستجابة (200):** المستأجر بعد التعديل.

**الأخطاء:** 403 `INSUFFICIENT_ROLE` · 400 `TENANT_NAME_EMPTY`.

---

## 4. Users

**tenant_id:** ضمنيّ.

### 4.1 GET /v1/users

**الدور:** `viewer` فما فوق.
**الاستجابة:** قائمة مستخدمي المستأجر.
```json
{
  "data": [
    { "id": "usr_...", "email": "...", "role": "...", "createdAt": "ISO" }
  ],
  "nextCursor": null,
  "hasMore": false
}
```
**التصفية:** `filter[role]` · **الترتيب:** `sort=createdAt` أو `-createdAt`.

### 4.2 GET /v1/users/:id

**الدور:** `viewer` فما فوق (يرى نفسه؛ `admin`+ يرى الجميع).
**الاستجابة:** المستخدم أو 404.

### 4.3 POST /v1/users/invite

**الوصف:** دعوة مستخدم جديد بالبريد. لا يُنشأ فعلياً إلا بعد قبول الدعوة.
**الدور:** `admin`+.

**المدخلات:**
```json
{
  "email": "string (required)",
  "role": "'writer'|'editor'|'reviewer'|'approver'|'viewer'|'admin' (required)"
}
```
**الاستجابة (201):**
```json
{ "id": "inv_...", "email": "...", "role": "...", "expiresAt": "ISO" }
```
**الأخطاء:**
- 403 `INSUFFICIENT_ROLE` (لا يستطيع دعوة دور أعلى من نفسه)
- 409 `USER_ALREADY_MEMBER` / `PENDING_INVITE_EXISTS`
- 422 `SEATS_EXHAUSTED` (تجاوز حصة الخطة)

### 4.4 PATCH /v1/users/:id

**الوصف:** تعديل الدور فقط (البريد ثابت).
**الدور:** `owner` أو `admin` (بشرط: لا يترقّى مستخدم فوق نفسه، ولا
يُخفَّض `owner` وحيد).

**المدخلات:** `{ "role": "..." }`
**الاستجابة (200):** المستخدم المحدَّث.
**الأخطاء:** 403 · 409 `LAST_OWNER` (تفادي المستأجر بلا owner).

### 4.5 DELETE /v1/users/:id

**الدور:** `owner` أو `admin`.
**الاستجابة (204).**
**الأخطاء:** 409 `LAST_OWNER` · 409 `USER_HAS_ACTIVE_PROJECTS` (سؤال
مفتوح Q2: هل نمنع الحذف أم نُعيد إسناد المشاريع؟).

---

## 5. Brand Kits (المورد الأثقل)

**tenant_id:** ضمنيّ. **`assets.version` يُدار عبر endpoint مخصّص §5.7.**

### 5.1 GET /v1/brand-kits

**الدور:** `viewer` فما فوق.
**التصفية:** `filter[name]` (بحث جزئي).
**الترتيب:** `sort=name|createdAt|updatedAt`.

**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "brk_...",
      "name": "string",
      "createdAt": "ISO",
      "updatedAt": "ISO",
      "assetsVersion": "2026.09"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

**ملاحظة:** الاستجابة موجزة (بلا `config` الكامل — تُقرَأ عبر §5.2).

### 5.2 GET /v1/brand-kits/:id

**الدور:** `viewer` فما فوق.
**الاستجابة (200):** كائن `BrandKit` كامل حسب `docs/03 §المخطط` — بلا
استثناء. `assets.version` يظهر ككائن `{ current: "2026.09", latest: "2026.10", updateAvailable: true }`.

### 5.3 POST /v1/brand-kits

**الوصف:** إنشاء brand kit جديد.
**الدور:** `admin`+ (تعديل الهوية قرار مؤسسي).

**المدخلات:** كائن جزئي — الحقول الإلزامية فقط:
```json
{
  "name": "string (required)",
  "direction": "'rtl' (default) | 'ltr'",
  "locale": "'ar' (default) | 'mixed' | 'en'"
}
```
الحقول الأخرى تُملأ من `DEFAULT_BRAND` (docs/03).

**الاستجابة (201):** BrandKit كامل.

**الأخطاء:**
- 422 `PLAN_LIMIT_REACHED` (حصة brand_kits في الخطة)

### 5.4 PATCH /v1/brand-kits/:id

**الوصف:** تعديل جزئي (JSON Merge Patch — RFC 7396).
**الدور:** `admin`+.

**المدخلات:** أيّ حقل من `BrandKit` عدا:
- `id` · `createdAt` · `updatedAt` (محسوبة)
- `assets.version` (يُدار عبر §5.7 فقط)
- `fonts.primary.licenseAck` لخط uploaded (يُدار عبر §5.5)
- `attribution.logoAcks[*].licenseAck` (يُدار عبر §5.6)

**الاستجابة (200):** BrandKit بعد التعديل.

**الأخطاء:**
- 400 `INVALID_COLOR` / `INVALID_FONT_REFERENCE` / …
- 403 `INSUFFICIENT_ROLE`
- 409 `STALE_UPDATE` (سؤال مفتوح Q3: هل نستعمل `If-Match` بـETag لتفادي
  overwrite ضائع؟)
- 422 `LICENSE_ACK_REQUIRED` (لو رفع خطاً بلا `licenseAck`)

**سلوك المراجعات:** كل PATCH ناجح **يُنشئ سجلاً في revisions** تلقائياً
(docs/14). لا endpoint منفصل لإنشاء revision — هي أثر جانبي للتعديل.

### 5.5 POST /v1/brand-kits/:id/fonts/:family/ack

**الوصف:** تسجيل إقرار ترخيص خط مرفوع.
**الدور:** `owner` أو `admin`.

**المدخلات:**
```json
{
  "licenseAck": true,
  "acknowledgedBy": "usr_...",
  "notes": "string (optional, يرَجَع عند التدقيق القانوني)"
}
```

**الاستجابة (200):** الجزء `fonts.primary` المحدَّث (يشمل `licenseAck=true` و `ackAt=<ISO>`).

**الأخطاء:**
- 400 `LICENSE_ACK_MUST_BE_TRUE` (رفض `false` صريحاً — L-28)
- 404 `FONT_NOT_UPLOADED` (خط source=catalog لا يحتاج ack)

### 5.6 POST /v1/brand-kits/:id/attribution/logo-acks/:platform

**الوصف:** إقرار حقّ عرض شعار منصة رسمية (`logoMode='official'`).
**الدور:** `owner` أو `admin`.

**المسار:** `:platform` ∈ `tiktok|x|instagram|youtube|telegram|facebook`.

**المدخلات:**
```json
{
  "licenseAck": true,
  "acknowledgedBy": "usr_..."
}
```

**الاستجابة (200):** `attribution.logoAcks[platform]` المحدَّث.

**الأخطاء:**
- 400 `LICENSE_ACK_MUST_BE_TRUE`
- 400 `UNKNOWN_PLATFORM` (منصة غير مدعومة)
- 409 `LOGO_MODE_NOT_OFFICIAL` (تفعيل الإقرار بلا تفعيل `official` غير منطقي — يرفض)

### 5.7 POST /v1/brand-kits/:id/assets-version

**الوصف:** ترقية إصدار الأصول للـbrand kit (docs/13 §الفحص الآلي/البشري).
**الدور:** `owner` أو `admin` فقط (L-29 — قرار حسّاس، ليس تعديلاً عاماً).

**المدخلات:**
```json
{
  "targetVersion": "YYYY.MM (required, e.g. '2026.10')",
  "acknowledgedDiff": true
}
```
**`acknowledgedDiff`** إلزامي `true` — على الواجهة عرض فروق ما قبل/بعد
قبل الطلب (docs/13 §إشعار لوحة التحكم).

**الاستجابة (200):** `assets` المحدَّث.

**الأخطاء:**
- 400 `INVALID_VERSION_FORMAT` / `VERSION_NOT_AVAILABLE`
- 403 `INSUFFICIENT_ROLE`
- 409 `DIFF_NOT_ACKNOWLEDGED`

### 5.8 DELETE /v1/brand-kits/:id

**الدور:** `owner` فقط.
**الاستجابة (204).**
**الأخطاء:**
- 409 `BRAND_KIT_IN_USE` (له مشاريع نشطة — يجب أرشفتها أولاً)
- 409 `LAST_BRAND_KIT` (تفادي مستأجر بلا هوية)

---

## 6. Templates

**tenant_id:** ضمنيّ. القوالب العامة (`tenant_id IS NULL` في نموذج
docs/02) تظهر لكل المستأجرين للقراءة فقط.

### 6.1 GET /v1/templates

**الدور:** `viewer` فما فوق.
**التصفية:** `filter[scope]=global|tenant|all` (افتراضي `all`) ·
`filter[kind]=card|breaking|reel` (سؤال مفتوح Q4: هل «kind» في القالب
أم في القاموس؟).

**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "tpl_...",
      "scope": "'global' | 'tenant'",
      "name": "string",
      "kind": "string",
      "createdAt": "ISO"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### 6.2 GET /v1/templates/:id

**الاستجابة (200):** كائن Template كامل حسب `docs/04`.

### 6.3 POST /v1/templates

**الوصف:** إنشاء قالب خاصّ بالمستأجر.
**الدور:** `admin`+.
**المدخلات:** كائن Template حسب `docs/04 §المخطط`.
**الاستجابة (201):** Template بعد التحقّق.
**الأخطاء:**
- 400 `TEMPLATE_SCHEMA_VIOLATION` (مع `field` يشير إلى المسار)
- 403 `INSUFFICIENT_ROLE`

### 6.4 PATCH /v1/templates/:id

**الدور:** `admin`+. **يرفض** تعديل قوالب `scope='global'` → 403 `GLOBAL_TEMPLATE_READONLY`.

### 6.5 DELETE /v1/templates/:id

**الدور:** `admin`+.
**الأخطاء:** 409 `TEMPLATE_IN_USE` / 403 `GLOBAL_TEMPLATE_READONLY`.

---

## 7. Projects

**tenant_id:** ضمنيّ.

### 7.1 GET /v1/projects

**الدور:** `viewer` فما فوق (يرى مشاريع أُسندت إليه؛ `admin`+ يرى الكل).
**التصفية:** `filter[state]` · `filter[assignee]` · `filter[brand_kit_id]` ·
`filter[template_id]`.
**الترتيب:** `sort=updatedAt|createdAt|title`.

**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "prj_...",
      "title": "string",
      "brand_kit_id": "brk_...",
      "template_id": "tpl_...",
      "currentState": "string (workflow state id)",
      "assigneeId": "usr_...|null",
      "updatedAt": "ISO"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### 7.2 GET /v1/projects/:id

**الاستجابة (200):** كائن Project كامل يشمل `content` (JSON بحسب حقول
القالب المرتبط).

### 7.3 POST /v1/projects

**الدور:** `writer` فما فوق.
**المدخلات:**
```json
{
  "title": "string (required)",
  "brand_kit_id": "brk_... (required)",
  "template_id": "tpl_... (required)",
  "content": "object (optional, empty by default)",
  "workflow_id": "wfl_... (optional, uses tenant default if omitted)"
}
```
**الاستجابة (201):** Project في الحالة الأولى من workflow المعتمد.
**الأخطاء:**
- 404 `BRAND_KIT_NOT_FOUND` / `TEMPLATE_NOT_FOUND` / `WORKFLOW_NOT_FOUND`
- 422 `PLAN_LIMIT_REACHED` (عدد المشاريع النشطة في الخطة)

### 7.4 PATCH /v1/projects/:id

**الدور:** يعتمد على الحالة (workflow rule — راجع §10).
**المدخلات:** جزئي — أي حقل عدا `id, tenant_id, createdAt, currentState`
(الحالة تُغيَّر عبر transitions §10.4).

**الأخطاء:**
- 403 `TRANSITION_ROLE_REQUIRED` (المستخدم بلا صلاحية تعديل في الحالة الحالية)
- 409 `STALE_UPDATE`

**سلوك المراجعات:** كل PATCH يُنشئ سجل revisions تلقائياً.

### 7.5 DELETE /v1/projects/:id

**الدور:** `admin`+ أو صاحب المشروع في الحالة `draft` فقط.
**الأخطاء:** 409 `PROJECT_HAS_RENDERS` (سؤال Q5: هل نسمح بحذف مشروع
له تصديرات؟ الأثر على `renders.brand_snapshot` — التصدير يبقى قائماً
لأنه استقلّ بلقطته، لكن المرجع يصير معطَّلاً).

---

## 8. Renders

**tenant_id:** ضمنيّ. **`brand_snapshot` يُلتقط عند POST — نقطة تجميد.**

### 8.1 POST /v1/renders

**الوصف:** إنشاء مهمة رندر (فيديو أو صورة). المهمة غير متزامنة.
**الدور:** `writer` فما فوق (شرط: له صلاحية إخراج في حالة المشروع الحالية).

**المدخلات:**
```json
{
  "project_id": "prj_... (required)",
  "size": "'x'|'instagram'|'feed'|'reel' (required)",
  "format": "'png'|'mp4' (required)",
  "priority": "'urgent'|'normal' (optional, default 'normal')"
}
```

**الاستجابة (202):**
```json
{
  "id": "rnd_...",
  "status": "'queued'",
  "queuedAt": "ISO",
  "estimatedStartAt": "ISO (best-effort)",
  "brand_snapshot_id": "bks_..."
}
```

**قواعد:**
- **`brand_snapshot` يُنشأ ذرياً** — لقطة كاملة من `brand_kit` المرتبط بالمشروع
  لحظة إنشاء المهمة. كل تعديل لاحق على brand_kit لا يؤثّر على هذا التصدير.
- **`brand_snapshot_id`** يُخزَّن في سجل الـrender ويُشار إليه في §revisions
  عبر `brand_revision_id` المرتبط (docs/14 §تكامل).
- `Idempotency-Key` مقبول (§1.7).

**الأخطاء:**
- 403 `RENDER_NOT_ALLOWED_IN_CURRENT_STATE` (مثلاً حالة `review` لا تسمح بإخراج)
- 422 `QUOTA_EXCEEDED_VIDEOS` / `QUOTA_EXCEEDED_RENDERS`
- 429 `RATE_LIMIT_EXCEEDED`

### 8.2 GET /v1/renders

**الدور:** `viewer` فما فوق (سجل التصديرات).
**التصفية:** `filter[project_id]` · `filter[status]` · `filter[format]` ·
`filter[createdAt][gte/lte]`.
**الترتيب:** `sort=-createdAt` افتراضي.

**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "rnd_...",
      "project_id": "prj_...",
      "status": "'queued'|'running'|'succeeded'|'failed'",
      "size": "'reel'",
      "format": "'mp4'",
      "output_url": "string|null (signed, expires in 1h — see 8.4)",
      "duration_ms": "int|null (final render duration)",
      "brand_snapshot_id": "bks_...",
      "createdAt": "ISO",
      "startedAt": "ISO|null",
      "completedAt": "ISO|null"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### 8.3 GET /v1/renders/:id

**الاستجابة (200):** سجل render كامل يشمل `waitMs`, `error` (عند failed).

### 8.4 GET /v1/renders/:id/output

**الوصف:** ينتج URL موقَّت للتحميل (S3/R2 pre-signed).
**الدور:** `viewer` فما فوق.
**الاستجابة (200):**
```json
{
  "url": "https://...signed...",
  "expiresAt": "ISO (1h from now — سؤال Q6)"
}
```
**الأخطاء:** 404 `OUTPUT_NOT_READY` (status ≠ succeeded).

### 8.5 GET /v1/renders/:id/brand-snapshot

**الوصف:** استرجاع لقطة الهوية المستعمَلة في هذا التصدير.
**الدور:** `viewer` فما فوق.
**الاستجابة (200):** كائن BrandKit كامل كما كان لحظة الإنشاء.

**الفائدة:** «لماذا يبدو هذا التصدير مختلفاً عن الحالي؟» — الجواب في
الفرق بين هذا الـsnapshot و `GET /brand-kits/:id` الحالي.

### 8.6 DELETE /v1/renders/:id

**الوصف:** حذف سجل render + ملف المخرَج.
**الدور:** `admin`+.
**الاستجابة (204).**
**الأخطاء:** 409 `RENDER_RUNNING` (لا حذف مهمة قيد التنفيذ — استعمل §8.7).

### 8.7 POST /v1/renders/:id/cancel

**الوصف:** إلغاء مهمة `queued` أو `running`.
**الدور:** `admin`+ (أو صاحب المهمة).
**الاستجابة (202):** المهمة، `status='cancelling'`.
**الأخطاء:** 409 `RENDER_ALREADY_TERMINAL`.

---

## 9. Assets

**tenant_id:** ضمنيّ. الأصول مرتبطة بـbrand_kit عادةً، أو مباشرة بالمستأجر
(الصور المستعملة في المشاريع).

**أنواع الأصول (`kind`):**
`font | logo | image | audio | video | lottie | svg`

### 9.1 POST /v1/assets/upload-url

**الوصف:** طلب URL موقَّت للرفع المباشر إلى التخزين (S3/R2). العميل يرفع
مباشرة إليه بلا مرور بـmk-api — تخفيف الحمل.
**الدور:** `writer` فما فوق.

**المدخلات:**
```json
{
  "kind": "'font'|'logo'|'image'|'audio'|'video'|'lottie'|'svg' (required)",
  "filename": "string (required)",
  "sizeBytes": "int (required, للتحقّق قبل الرفع)",
  "contentType": "string (required, e.g. 'image/png')"
}
```

**الاستجابة (200):**
```json
{
  "uploadUrl": "https://...signed-put...",
  "assetId": "ast_... (draft)",
  "expiresAt": "ISO",
  "maxSizeBytes": 524288000
}
```

**الأخطاء:**
- 400 `UNSUPPORTED_KIND` / `UNSUPPORTED_CONTENT_TYPE_FOR_KIND`
- 413 `SIZE_TOO_LARGE`
- 422 `STORAGE_QUOTA_EXCEEDED`

### 9.2 POST /v1/assets/:id/finalize

**الوصف:** يُستدعى بعد نجاح الرفع لـS3. يستخرج metadata (kashida caps
للخط، أبعاد الصورة…) ويطلق كشف الوجوه لـ`kind='image'` (docs/12 §5).
**الدور:** `writer` فما فوق.

**المدخلات:**
```json
{
  "licenseAck": "boolean (required=true for kind in ['font','lottie'])",
  "acknowledgedBy": "usr_... (required with licenseAck)",
  "meta": {
    "label": "string (optional)"
  }
}
```

**الاستجابة (200):**
```json
{
  "id": "ast_...",
  "kind": "font",
  "url": "s3://... (internal — not exposed to browser)",
  "publicUrl": "https://... (signed URL for engine consumption)",
  "sizeBytes": 123456,
  "meta": {
    "label": "...",
    "capabilities": { "kashida": true, "kashidaMethod": "tatweel" },
    "faces": [{ "x": 0.5, "y": 0.5, "w": 0.2, "h": 0.2 }]
  },
  "licenseAck": true,
  "ackBy": "usr_...",
  "ackAt": "ISO",
  "createdAt": "ISO"
}
```

**قواعد `licenseAck`:**
- **إلزامي `true`** لـ`kind='font'` و `kind='lottie'` (docs/03 §fonts/lottieAssets).
- **لا يُطلب** لـ`image, audio, video, logo, svg` — العميل يُقرّ بالحقوق ضمنياً برفعها.
- شعارات المنصات (logoAcks) endpoint منفصل §5.6 لأنها ليست upload.
- **رفض `false` صريحاً** — 422 `LICENSE_ACK_MUST_BE_TRUE`.

**الأخطاء:**
- 404 `UPLOAD_NOT_COMPLETED` (ملف S3 غير موجود)
- 422 `LICENSE_ACK_MUST_BE_TRUE`
- 400 `INVALID_FONT_FILE` / `INVALID_LOTTIE_SCHEMA` / `INVALID_SVG_WITH_TEXT_WARNING`

**تحذير SVG:** إن كان `kind='svg'` والملف يحمل نصّاً غير محوَّل إلى مسارات
(PHASES §المرحلة 4 — واجهة رفع SVG)، الاستجابة تحمل حقلاً إضافياً:
```json
{ "warnings": [{ "code": "SVG_HAS_TEXT", "message": "svg.text_not_converted" }] }
```
والواجهة تعرض الرسالة الصريحة قبل القبول. القبول رغم التحذير عبر إعادة
finalize مع `{ "acknowledgedWarnings": ["SVG_HAS_TEXT"] }`.

### 9.3 GET /v1/assets

**الدور:** `viewer` فما فوق.
**التصفية:** `filter[kind]` · `filter[brand_kit_id]` (لو الأصل مرتبط) ·
`filter[createdAt]`.

**الاستجابة:** قائمة صيغتها كـ§9.2 (بلا `publicUrl` في القائمة — يُطلَب لكل أصل عند الاستهلاك).

### 9.4 GET /v1/assets/:id

**الاستجابة:** الأصل الكامل يشمل `publicUrl` جديد (موقَّت).

### 9.5 POST /v1/assets/:id/refresh-url

**الوصف:** الحصول على `publicUrl` جديد إن انتهت صلاحية القديم.
**الاستجابة (200):** `{ "publicUrl": "...", "expiresAt": "ISO" }`.

### 9.6 DELETE /v1/assets/:id

**الدور:** `admin`+.
**الأخطاء:** 409 `ASSET_IN_USE_BY_BRAND_KIT` (مشار إليه — يجب إزالة المرجع أولاً).

### 9.7 POST /v1/assets/:id/detect-faces

**الوصف:** إعادة تشغيل كشف الوجوه (لو فشل الأوّل أو لم يجرِ).
**الدور:** `writer` فما فوق.
**الاستجابة (200):** `{ "faces": [...] }` (لا يُخزَّن إلا بعد §9.8).

### 9.8 PATCH /v1/assets/:id/faces

**الوصف:** حفظ إحداثيات الوجوه المُقتَرَحة/المُعدَّلة (L-07 — يُخزَّن، لا يُعاد وقت الرندر).
**الدور:** `writer` فما فوق.
**المدخلات:**
```json
{
  "faces": [{ "x": 0.5, "y": 0.5, "w": 0.2, "h": 0.2 }]
}
```
كل قيمة نسبة من عرض/ارتفاع الصورة (لا بكسل — L-02).
**الاستجابة (200):** الأصل المحدَّث.

---

## 10. Revisions (نمط مشترك)

**نمط مطبَّق على:** `brand_kits`, `projects`, `templates`, `users`, `assets`
(كل الجداول التي تحمل triggers — docs/14 §المخطط).

**tenant_id:** ضمنيّ (RLS يحمي).

### 10.1 GET /v1/{resource}/:id/revisions

**الوصف:** سجل مراجعات مورد.
**الدور:** `viewer` فما فوق (شرط له صلاحية قراءة المورد).

**التصفية:** `filter[createdAt][gte/lte]` · `filter[actorId]`.
**الترتيب:** `sort=-createdAt` افتراضي.

**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "rev_...",
      "resourceType": "brand_kits",
      "resourceId": "brk_...",
      "actorId": "usr_...",
      "op": "'insert'|'update'|'delete'",
      "diff": "object (RFC 6902 JSON Patch — nullable)",
      "hasSnapshot": true,
      "createdAt": "ISO"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

**ملاحظة:** `diff` مرفَق لكل تعديل. `hasSnapshot` صحيح كل ~10 تعديلات
(docs/14 §سياسة الحجم).

### 10.2 GET /v1/{resource}/:id/revisions/:revId

**الوصف:** revision كامل يشمل `snapshot` (إن وجدت) وحالة المورد المُعاد
بناؤها عند تلك النقطة الزمنية (استعادة صافية بلا commit).

**الاستجابة (200):**
```json
{
  "id": "rev_...",
  "reconstructedState": "object (المورد كما كان)",
  "diff": "object|null",
  "snapshot": "object|null",
  "actorId": "usr_...",
  "createdAt": "ISO"
}
```

### 10.3 POST /v1/{resource}/:id/revisions/:revId/restore

**الوصف:** استعادة المورد إلى حالة revision. **يُنشئ revision جديدة**
تمثّل الاستعادة (لا يمحو التاريخ — docs/14 §سياسة الحذف).

**الدور:** `admin`+ (الاستعادة تعديل جوهري).

**المدخلات:**
```json
{
  "reason": "string (required, ≥ 10 chars — L-15)"
}
```

**الاستجابة (200):** المورد بعد الاستعادة.

**الأخطاء:**
- 400 `REASON_TOO_SHORT`
- 403 `INSUFFICIENT_ROLE`
- 404 `REVISION_NOT_FOUND`
- 409 `RESTORE_WOULD_BREAK_REFERENCES` (مثلاً استعادة brand_kit إلى حالة تُلغي حقلاً يستعمله قالب حالي)

---

## 11. Workflows · Project State · Transitions

من `docs/15-editorial-workflow.md`.

### 11.1 GET /v1/workflows

**الدور:** `viewer` فما فوق.
**الاستجابة (200):**
```json
{
  "data": [
    { "id": "wfl_...", "name": "individual|small-team|full-agency|custom", "isDefault": true }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### 11.2 GET /v1/workflows/:id

**الاستجابة (200):**
```json
{
  "id": "wfl_...",
  "name": "string",
  "states": [
    { "id": "draft", "label": "string", "assignableTo": ["writer","editor"] }
  ],
  "transitions": [
    {
      "id": "trn_submit",
      "from": "draft",
      "to": "review",
      "label": "string",
      "requiredRole": "writer",
      "requiresReason": false
    },
    {
      "id": "trn_return",
      "from": "review",
      "to": "draft",
      "label": "string",
      "requiredRole": "reviewer",
      "requiresReason": true
    }
  ]
}
```

### 11.3 POST /v1/workflows

**الدور:** `admin`+.
**المدخلات:** كائن workflow حسب §11.2 (بلا `id, isDefault`).
**الاستجابة (201).**

### 11.4 PATCH /v1/workflows/:id

**الدور:** `admin`+.
**الأخطاء:**
- 409 `WORKFLOW_IN_USE_IMMUTABLE_FIELD` (لا تعديل `states[].id` أو
  `transitions[].from/to` وworkflow مربوط بمشاريع نشطة — يُنشأ workflow
  جديد بدلاً منه).

### 11.5 DELETE /v1/workflows/:id

**الأخطاء:** 409 `WORKFLOW_IN_USE` · 409 `CANNOT_DELETE_DEFAULT`.

### 11.6 GET /v1/projects/:id/state

**الوصف:** الحالة الراهنة للمشروع + التحوّلات المتاحة للمستخدم الحالي.
**الدور:** `viewer` فما فوق.

**الاستجابة (200):**
```json
{
  "projectId": "prj_...",
  "workflowId": "wfl_...",
  "currentState": "draft",
  "assigneeId": "usr_...|null",
  "availableTransitions": [
    { "id": "trn_submit", "to": "review", "label": "...", "requiresReason": false }
  ],
  "history": [
    {
      "transitionId": "trn_submit",
      "from": "draft",
      "to": "review",
      "actorId": "usr_...",
      "reason": "string|null",
      "at": "ISO"
    }
  ]
}
```

### 11.7 POST /v1/projects/:id/transitions

**الوصف:** تنفيذ تحوّل حالة على مشروع.
**الدور:** يعتمد على `transitions[].requiredRole` في تعريف workflow.

**المدخلات:**
```json
{
  "transitionId": "trn_... (required)",
  "reason": "string (required if transitions[].requiresReason=true)",
  "assigneeId": "usr_... (optional, يُسنَد للحالة الجديدة)"
}
```

**الاستجابة (200):** حالة المشروع الجديدة (كـ§11.6).

**الأخطاء:**
- 403 `TRANSITION_ROLE_REQUIRED`
- 409 `TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE`
- 400 `REASON_REQUIRED_FOR_THIS_TRANSITION`

### 11.8 POST /v1/projects/:id/assign

**الوصف:** إسناد مشروع (بلا تحوّل حالة).
**الدور:** `editor`+ (أو حسب workflow — سؤال Q7).
**المدخلات:** `{ "assigneeId": "usr_..." | null }`.
**الاستجابة (200):** حالة المشروع.

---

## 12. Annotations (تعليقات موضعية — docs/15 §4)

**tenant_id:** ضمنيّ.

### 12.1 GET /v1/projects/:id/annotations

**التصفية:** `filter[resolved]=true|false` · `filter[authorId]`.
**الاستجابة (200):**
```json
{
  "data": [
    {
      "id": "ann_...",
      "authorId": "usr_...",
      "target": { "kind": "layer", "layer": "headline", "wordIndex": 3 },
      "body": "string",
      "resolved": false,
      "createdAt": "ISO"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

### 12.2 POST /v1/projects/:id/annotations

**الدور:** `viewer` فما فوق (يستطيع الجميع التعليق).
**المدخلات:**
```json
{
  "target": {
    "kind": "'layer' (required)",
    "layer": "string (required, e.g. 'headline'|'source')",
    "wordIndex": "int (optional)"
  },
  "body": "string (required, ≤ 2000 chars)"
}
```
**الاستجابة (201).**

### 12.3 PATCH /v1/projects/:id/annotations/:aid

**الدور:** المؤلّف أو `editor`+.
**المدخلات:** `{ "body": "string" }` أو `{ "resolved": true }`.
**الاستجابة (200).**

### 12.4 DELETE /v1/projects/:id/annotations/:aid

**الدور:** المؤلّف أو `admin`+.

---

## 13. Subscriptions

**tenant_id:** ضمنيّ.

### 13.1 GET /v1/subscription

**الدور:** `owner` أو `admin` (سؤال Q8).
**الاستجابة (200):**
```json
{
  "plan": "'trial'|'starter'|'studio'|'agency'|'api'",
  "status": "'active'|'past_due'|'cancelled'|'trialing'",
  "currentPeriodEnd": "ISO",
  "seats": { "used": 4, "limit": 5 },
  "quotas": {
    "brandKits": { "used": 3, "limit": 20 },
    "videos": { "used": 47, "limit": 100 },
    "renders": { "used": 231, "limit": "unlimited" }
  },
  "cancelAtPeriodEnd": false
}
```

### 13.2 POST /v1/subscription/checkout

**الوصف:** إنشاء جلسة دفع (Stripe أو Paddle — يحدّده mk-api، الواجهة
تستهلك الـURL).
**الدور:** `owner`.
**المدخلات:**
```json
{
  "targetPlan": "'starter'|'studio'|'agency'|'api'",
  "billingCycle": "'monthly'|'yearly'"
}
```
**الاستجابة (200):**
```json
{
  "checkoutUrl": "https://checkout...",
  "expiresAt": "ISO"
}
```
**قبول Idempotency-Key (§1.7).**

### 13.3 POST /v1/subscription/cancel

**الدور:** `owner`.
**المدخلات:** `{ "reason": "string (required, ≥ 10 chars)" }`.
**الاستجابة (200):** الاشتراك المحدَّث (`cancelAtPeriodEnd=true`).

### 13.4 POST /v1/subscription/resume

**الدور:** `owner`.
**الاستجابة (200):** الاشتراك المحدَّث.

### 13.5 GET /v1/subscription/invoices

**الدور:** `owner`.
**الاستجابة:** قائمة فواتير.

---

## 14. Usage

**tenant_id:** ضمنيّ.

### 14.1 GET /v1/usage/current

**الدور:** `viewer` فما فوق (لكن الأرقام محدودة بحسب الدور — سؤال Q9).
**الاستجابة (200):**
```json
{
  "periodStart": "ISO",
  "periodEnd": "ISO",
  "counts": {
    "rendersTotal": 231,
    "videosSeconds": 4820,
    "storageBytes": 12885000000
  },
  "byBrandKit": [
    { "brand_kit_id": "brk_...", "renders": 100, "videosSeconds": 2100 }
  ]
}
```

### 14.2 GET /v1/usage/history

**التصفية:** `filter[period][gte/lte]` (شهر YYYY-MM).
**الترتيب:** `sort=-period`.

**الاستجابة (200):** قائمة نقاط شهرية.

---

## 15. AI Integrations (BYO-key — docs/12 §9)

**tenant_id:** ضمنيّ. **المفاتيح لا تُعاد أبداً.**

### 15.1 GET /v1/ai/integrations

**الوصف:** قائمة الموفّرين المفعَّلين + مرجع المفتاح.
**الدور:** `admin`+.
**الاستجابة (200):**
```json
{
  "data": [
    {
      "provider": "'gemini'|'openai'|'claude'|'elevenlabs'|'google-tts'|'azure'",
      "apiKeyRef": "kref_... (لا يعيد القيمة)",
      "enabled": true,
      "capabilities": ["headline-suggestions","voice-over"],
      "configuredAt": "ISO",
      "configuredBy": "usr_..."
    }
  ]
}
```

### 15.2 POST /v1/ai/integrations

**الوصف:** إضافة/تحديث مفتاح موفّر.
**الدور:** `owner` أو `admin`.
**المدخلات:**
```json
{
  "provider": "'gemini'|... (required)",
  "apiKey": "string (required, one-shot — لن يُعاد)",
  "enabled": true
}
```
**الاستجابة (201):** الكائن كـ§15.1 (بلا apiKey — `apiKeyRef` فقط).

**قواعد:**
- تحديث مفتاح قائم = إرسال POST جديد بنفس `provider` (يُنشأ `apiKeyRef` جديد،
  القديم يُبطَل).
- **لا endpoint لقراءة المفتاح مطلقاً** — لا GET لـkey. `kref_...` هو
  المرجع المستعمل داخلياً في الخدمة.

**الأخطاء:**
- 400 `INVALID_PROVIDER`
- 400 `API_KEY_VALIDATION_FAILED` (المفتاح مرفوض من مزوّده)

### 15.3 DELETE /v1/ai/integrations/:provider

**الدور:** `owner` أو `admin`.
**الاستجابة (204).**

---

## 16. Webhooks الواردة

**tenant_id:** غير مطبَّق (webhooks مصادَق عبر توقيع لا Bearer).

### 16.1 POST /v1/webhooks/stripe (أو /paddle)

**الوصف:** استقبال أحداث الفوترة.
**المصادقة:** توقيع Stripe/Paddle في رأس `X-Signature` — يتحقّق mk-api.
**الاستجابة (200):** `{ "received": true }`.
**الأخطاء:** 400 `INVALID_SIGNATURE`.

**ملاحظة الواجهة:** لا شأن للواجهة بهذا — يُدرج للاكتمال.

---

## 17. الحدود العامة (Rate Limits)

مطبَّق على مستوى token/tenant. الحدود التقريبية (سؤال Q10 للحسم):

| نوع الطلب | الحدّ |
|---|---|
| قراءة | 600/دقيقة |
| كتابة (POST/PATCH/DELETE) | 120/دقيقة |
| رفع (upload-url) | 20/دقيقة |
| إنشاء render | 30/دقيقة |
| AI integration call | حسب موفّر — الطلبات تعود بحدود المزوّد |

عند التجاوز → 429 `RATE_LIMIT_EXCEEDED` + رأس `Retry-After: <seconds>`.

---

## 18. الأسئلة المفتوحة

**هذه بنود لم تُذكر في المصادر بتفصيل كافٍ — لا أقرّر، أَعرض.**

- **Q1.** مدة صلاحية `accessToken` — 15 دقيقة؟ ساعة؟ تعتمد على تحمّل
  الواجهة لـrefresh متكرّر مقابل مخاطرة سرقة token.
- **Q2.** حذف مستخدم له مشاريع نشطة — منع، أم إعادة إسناد تلقائي، أم
  «archive user» (يظل مرجعاً في سجل المراجعات لكن غير قابل لتسجيل الدخول)؟
- **Q3.** ETag + `If-Match` على PATCH — للحماية من overwrite ضائع. هل
  نطبّقه على كل المسارات أم على brand_kits فقط؟
- **Q4.** `templates.kind` — حقل مستقلّ (`kind='card'|'breaking'|'reel'`)
  أم مشتقّ من نوع الطبقة الرئيسية في `definition`؟ docs/04 يستعمل الاسم
  دون تسمية kind رسمياً.
- **Q5.** حذف مشروع له renders — نمنع؟ نسمح ونُبقي renders (كل واحد له
  brand_snapshot مستقلّ)؟ نُنشئ حالة `archived`؟
- **Q6.** صلاحية `output_url` — ساعة؟ يوم؟ أسبوع؟ docs/13 يذكر «الاستضافة
  الدائمة» لكن الـURL نفسه موقَّت من R2. سياسة التجديد؟
- **Q7.** `POST /projects/:id/assign` — أيّ الأدوار تستطيع الإسناد؟
  workflow يحدّد `transitions[].requiredRole` — هل نضيف حقلاً مماثلاً
  للإسناد المستقلّ، أم نجعله دائماً `editor`+؟
- **Q8.** GET /subscription — هل يراها `admin` (يعرف الحصص) أم `owner`
  حصراً (الفوترة مالية)؟
- **Q9.** GET /usage/current — يراها `viewer`؟ (يعرف موقع المشاريع في
  الحصة) أم `writer`+؟ الأرقام المُفصّلة `byBrandKit` للـ`admin`+ فقط؟
- **Q10.** أرقام Rate Limits — التقديرات في §17 مبنيّة على توقّع لا قياس.
  تحتاج مراجعة مع docs/08 §الطوابير.
- **Q11.** SVG `acknowledgedWarnings` (§9.2) — هل نسجّل هذا في سجل
  المراجعات كإقرار قانوني منفصل، أم يكفي أن يظهر في metadata الأصل؟
- **Q12.** Workflow «إعادة الإسناد للحالة نفسها» — هل ممكن (لتغيير
  assignee بلا transition)؟ §11.8 يقترح ذلك، لكن docs/15 يذكر «الإسناد
  جزء من التحوّل».
- **Q13.** `POST /brand-kits/:id/revisions/:revId/restore` (§10.3) —
  يستعيد الحقول التي تحتاج إقرار (`fonts.primary.licenseAck`، logoAcks)
  ضمن الاستعادة؟ أم يُطلب إقرار جديد بعد الاستعادة؟
- **Q14.** BYO-key: أين يعيش الاستدعاء الفعلي للـAI؟ mk-api كوسيط
  (يحمي المفتاح تماماً)، أم من الواجهة مباشرة (تسرّب `apiKeyRef` قد يُخوَّل
  إلى فك المفتاح لو اختُرقت)؟
- **Q15.** SDK / Public API — الخطة تحملها في المرحلة 5. هل نصمّم `/v1`
  الحالي بحيث يُفتَح مباشرة كـpublic API، أم نُميّز بـ`/v1/internal/`
  و `/v1/public/`؟
- **Q16.** Notifications (docs/15 §5) — هل هي endpoint (`GET /v1/notifications`)
  أم WebSocket أم Server-Sent Events؟ الخيار يؤثّر على واجهة الاستهلاك.
- **Q17.** Sharing forms (docs/12 §6 — النماذج القابلة للمشاركة) —
  endpoint منفصل تحت `/v1/forms/` أم امتداد للـtemplates؟ الرابط العام
  يحتاج مصادقة مختلفة (بلا Bearer — سؤال بحد ذاته).

---

## 19. مراجع

- `docs/02-architecture.md` §نموذج البيانات (سطر 151)
- `docs/03-brand-kit-spec.md` §المخطط (سطر 27)
- `docs/09-launch-spec.md` §مواصفات المخرَج
- `docs/13-asset-lifecycle.md` §إصدارات الأصول
- `docs/14-revisions.md` §المخطط + §الاستعادة
- `docs/15-editorial-workflow.md` §الحالات + §الأدوار + §التحوّلات
- `PHASES.md §المرحلة 4` (سطر 801)

**قواعد ملزَمة أثناء التنفيذ (من CLAUDE.md):**
- **L-22:** رسائل الخادم مفاتيح لا نصوصاً (تنسيق الأخطاء §1.4).
- **L-04:** رمي مبكّر عند حدود النظام (تحقّق مدخلات §1.6).
- **L-13:** كل مخرَج نموذج اقتراح قابل للتحرير (BYO-key §15، assets faces §9.8).
- **L-28:** رخصة الرسم ≠ رخصة العلامة (licenseAck §5.5–5.6، §9.2).
- **L-29:** الأصول الخارجية تتغيّر — الإصدار المثبَّت (§5.7 endpoint مخصّص لـ`assets.version`).
