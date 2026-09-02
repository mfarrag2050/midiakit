// Ltr — يغلّف أرقاماً/مركّبات لاتينية بـdir="ltr" لتظهر بترتيبها
// الطبيعي داخل واجهة RTL. مطلوب لأشياء مثل «460.4 / 108.0 GB» —
// السياق RTL يعكس ترتيب «/» فتظهر كأنها «108.0 / 460.4».
//
// **قاعدة الاستخدام:** كل مركّب رقمي يحوي أكثر من رقم واحد ومعه فاصل
// (/ · ,) يجب أن يُغلَّف. الأرقام المفردة تبقى بلا غلاف.

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
