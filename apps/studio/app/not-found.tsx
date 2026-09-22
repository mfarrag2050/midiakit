// mk/428 · §٢ — صفحةُ خطأ App Router بلا سياقٍ ولا خطّاف.
// نصٌّ ثابتٌ · وسمٌ عاري · لا `useLocale` · لا استيراد من `packages/ui` أو
// `@pf-mediakit/i18n`. صفحةُ الخطأِ التي تحتاجُ سياقاً لتَظهرَ فخٌّ.

export default function NotFound(): JSX.Element {
  return (
    <main dir="rtl" lang="ar" style={{ padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>الصفحةُ غير موجودة</h1>
      <p style={{ marginTop: '1rem', color: '#555' }}>الرابطُ الذي طلبتَه لا يُقابله صفحةٌ في هذا الموقع.</p>
    </main>
  );
}
