// عيّنة مكسورة عمداً لاختبار حياة `check-brand-editor-labels`.
// **لا يُستورَد من الشيفرة**. الحارس وحده يقرؤه في وضع `--self-test`.
// المكسور: `<span>{key}</span>` بدل `t('...color.${key}')`.

const COLOR_KEYS = [
  'text',
  'accent',
  'urgentBadge',
  'urgentBg',
  'urgentBgTint',
  'locationBadge',
  'surface',
] as const;

export function BrokenPage() {
  const colors: [string, string | undefined][] = COLOR_KEYS.map((k) => [k, '#000']);
  return (
    <div>
      {colors.map(([key, hex]) => (
        <div key={key}>
          {/* ← العطب: نصّ إنجليزيّ خام يُعرَض بلا i18n */}
          <span dir="ltr">{key}</span>
          <span>{hex}</span>
        </div>
      ))}
    </div>
  );
}
