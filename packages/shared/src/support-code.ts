// support-code — ٣٧٠ · رمز حادثة قابل للنطق يشتق من renderId.
//
// **الخصائص الأربع من التذكرة:**
//   1. **مستقرّ عبر إعادة التشغيل والنشر** — renderId في DB · SHA-256 حتميّ.
//   2. **قصير يُملى في الهاتف** — 12 حرفاً (`MK-XXXX-XXXX`).
//   3. **يربط الشكوى بالسجلّ بخطوةٍ واحدة** — `grep 'support=MK-XXXX-XXXX' logs`
//      أو حسبةٌ عكسيّة من renderId عبر نفس الدالّة.
//   4. **لا يسرّب** — hash unidirectional · لا tenant/email/timestamp دقيق.
//
// **رفض شكل audit (720 §٣.١):** كان يقترح base32 من `Date.now()` + counter.
// يخالف الخاصّية 4 صراحةً: **timestamp داخل الرمز يُستدلّ منه على لحظة الفشل
// بدقّة ~11 يوماً** (تعليقُ audit نفسُه). واستعمال counter يفرض Redis INCR في
// المسار الحارّ. اخترتُ hash حتميّ لأنّه أنظف وأصفى.
//
// **الأبجديّة:** Crockford base32 — 32 حرفاً يقصي (0/O · 1/I/L) للتلافي
// الالتباس البصريّ في النطق (audit 720 §٣.٣ · نفس المرجع).
//
// **الاتّجاه (RTL):** لاتينيّ + رقميّ + شرطات. عرضٌ داخل جملة عربيّة =
// L→R كتلةً واحدة (Unicode BiDi يعالجها). صحيحٌ بلا `<span dir="ltr">`.
//
// **الاصطدام:** 40 بت (8 حرفاً Crockford) = 10^12 قيمة. بـ10^6 رندر ⇒
// birthday paradox ≈ 1/1000 احتمال اصطدام. مقبولٌ لدعمٍ يوميّ — تعارضٌ
// نادرٌ يُحلّ يدوياً (رندران للمستأجرين مختلفَين · سياق الشكوى يميّز).
//
// **قابليّة العكس:** ليست عكسيّةً — لكن الدعم يبحث بـgrep على السجلّ الذي
// يحوي (supportCode + renderId) في كلّ فشل. أو يحسب supportCodeFor على
// كلّ renderId مشتبه به.

import { createHash } from 'node:crypto';

// Crockford base32 — 32 حرفاً بلا 0/O 1/I/L. مرجع: https://www.crockford.com/base32.html
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * يُعيد رمز حادثة `MK-XXXX-XXXX` مشتقّاً حتميّاً من `renderId`.
 * @param renderId UUID للرندر (المصدر الوحيد للحتميّة).
 */
export function supportCodeFor(renderId: string): string {
  const hash = createHash('sha256').update(renderId).digest();
  // نأخذ أوّل 5 بايت (40 بت) ونحوّلها 8 أحرف Crockford (5 بت لكلّ حرف).
  // مسحٌ خطّيّ على مستوى البِتّات (شرح: 40 = 8 × 5).
  let bits = '';
  for (let i = 0; i < 5; i++) {
    bits += hash[i]!.toString(2).padStart(8, '0');
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    const chunk = bits.slice(i * 5, i * 5 + 5);
    out += CROCKFORD[parseInt(chunk, 2)];
  }
  return `MK-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}
