# طبقة استهلاك mk-api

عقد `docs/16-api-contract.md` مُترجم إلى وحدات TypeScript. **لا يُستدعى**
من أيّ صفحة قبل نقاط التزامن في `docs/17-phase4-plan.md §5`.

## ملفات

- `client.ts` — الطلب الأساسي: Bearer, auto-refresh عند 401, احترام
  `Retry-After` عند 429, `Idempotency-Key`, cursor pagination (§1.5)،
  `filter[field]` (§1.6).
- `errors.ts` — `ApiError` + `parseApiError` + قائمة `ApiErrorCode` من §1.4.
- `tokens.ts` — تخزين access/refresh في `localStorage` (يبقى كذلك بعد
  اكتمال endpoint المستخدم — الرمز في المتصفح، السياق في الخادم).
- `types.ts` — أنواع مشتركة (`Role`, `Locale`, `Plan`, `Tenant`, `User`).
- `endpoints/*.ts` — كل مورد في §2-§16 كوحدة مستقلّة.
- `index.ts` — namespace `api.*` للاستعمال المستقبلي.

## قواعد ملزَمة

- **رسائل الخادم مفاتيح لا نصوص** (L-22). `error.message` مفتاح `i18n`
  يُفكّه `useLocale().t(err.messageKey)` — لا تعرض `err.message` مباشرة.
- **لا `fetch` في المكوّنات.** كل استدعاء يمرّ عبر `request()`.
- **الحساسيّة السرّية:** لا نُخزّن مفاتيح AI في المتصفح — الخادم حصراً
  (G-P4-5). الطبقة لا تعيد `apiKey` من `listIntegrations`.
- **Idempotency على العمليات المُنشِئة** (`POST /renders`, `POST /checkout`).

## متى يُربَط

راجع جدول SYNC في `docs/17 §5`. المجموعات S1–S4 لا تستدعي شيئاً.
