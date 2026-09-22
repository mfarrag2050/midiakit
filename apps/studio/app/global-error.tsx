'use client';

// mk/428 · §٢ — global-error يُصيّرُ `<html>` و `<body>` بنفسِه (شرطُ Next 14).
// بلا `useLocale`، بلا مكوّناتٍ من `packages/ui` أو `@pf-mediakit/i18n`،
// بلا أيِّ خطّافٍ عدا `reset` القادم من props.

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.75rem', margin: 0 }}>حدثَ خطأٌ غيرُ متوقَّع</h1>
        <p style={{ marginTop: '1rem', color: '#555' }}>حاولْ إعادةَ المحاولة، وإن استمرّ الخطأ راجعْ فريقَ الدعم.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ marginTop: '1.5rem', padding: '0.5rem 1.25rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
