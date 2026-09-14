// Ltr — يغلّف مركّبات لاتينية (أرقام، مسارات، معرّفات) بـdir="ltr"
// لتظهر بترتيبها الطبيعي داخل واجهة RTL.
//
// **قاعدة الاستخدام (L-23):** كل مركّب يحوي أكثر من رقم/رمز واحد
// وبينهما فاصل (`/`, `-`, `:`, `,`) يجب أن يُغلَّف. أرقام مفردة تبقى
// بلا غلاف. مثال:
//   ✓ <Ltr>460.4 / 108.0 GB</Ltr>     // «460.4 / 108.0» لا يُقلَب
//   ✓ 12                              // لا حاجة للغلاف
//   ✓ <Ltr>renders/rnd_01H…/output</Ltr>
//
// **الفرق عن `unicode-bidi: bidi-override`:** نستعمل `dir` وحده —
// `unicode-bidi: isolate` (السلوك الافتراضي لـ`dir`) يعزل السياق
// بلا فرض قسري على أرقام مفردة داخل عربية.

import type { ReactNode } from 'react';

export function Ltr({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span dir="ltr" className={`inline-block ${className}`}>
      {children}
    </span>
  );
}
