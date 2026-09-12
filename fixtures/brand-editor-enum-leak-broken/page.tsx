// عيّنة مكسورة عمداً — لاختبار حياة `check-ui-enum-leaks`.
// **لا تُستورَد** من الشيفرة. الحارس يقرؤها في وضع `--self-test`.
//
// انتهاكان مُعدَّدان صريحان:
//   (١) `{identity.logoPosition}` بارز في JSX ⇒ يُصيَّر مثلاً `bottom-left`
//   (٢) `<span>rtl</span>` قيمة حرفيّة من قائمة مغلقة كنصّ JSX

export function BrokenEditor() {
  const identity = {
    logoPosition: 'bottom-left' as const,
    locale: 'ar' as const,
    direction: 'rtl' as const,
  };
  return (
    <div>
      <div>موضع الشعار: <span dir="ltr">{identity.logoPosition}</span></div>
      <div>الاتجاه: <span>rtl</span></div>
      <div>اللغة: {identity.locale}</div>
    </div>
  );
}
