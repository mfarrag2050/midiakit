// packages/db/scripts/_lib/skip-guard.mjs
//
// 142-SKIP-IS-NOT-PASS — القاعدة الواحدة لكل فاحص يعتمد على مورد خارجيّ.
// «التخطّي ليس نجاحاً، والصمت ليس تخطّياً». ثلاث حالات لا اثنتان:
//   • فحص جرى ونجح          ⇒ exit 0
//   • فحص جرى وفشل          ⇒ exit 1 (السكربت يطبع اسم ما فشل)
//   • فحص لم يجرِ (المورد ناقص) ⇒ ليس 0:
//       - في CI  ⇒ exit 1  (بيئة كاملة شرط · الصمت يعني ادّعاء زور)
//       - في dev ⇒ exit 78 (EX_CONFIG · مميّز · بصوت عالٍ يُطبَع كل مرّة)
//
// لا نقبل SKIP_* متغيّراً يُمنح لأحد ليمرّ — منفذ هروب بثوب جديد (القاعدة 14).

/** يكشف بيئة CI عبر متغيّر معياريّ (GitHub Actions يضعه = 'true'). */
export function isCi() {
  return process.env.CI === 'true' || process.env.CI === '1';
}

/**
 * يُخرج السكربت بحالة «لم يُفحَص لأنّ المورد ناقص».
 *
 * @param {object} args
 * @param {string} args.scriptName — اسم الفاحص (للسجلّ).
 * @param {string} args.missing    — اسم المورد الغائب (مثل 'DATABASE_URL').
 * @param {string} [args.hint]     — سطر إرشاد اختياري («شغّل bin/mk up» ...).
 */
export function skipMissingResource({ scriptName, missing, hint }) {
  const banner = `${missing} — الفحص لم يجرِ`;
  if (isCi()) {
    console.error(`[${scriptName}] ✗ ${banner} · CI يشترط بيئة كاملة`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
  // dev: تخطٍّ بصوت + رمز خروج مميَّز (78 = EX_CONFIG في sysexits.h) — لا 0.
  // هذا يُفشِل pnpm test في dev بلا Docker · وهو المقصود من التذكرة:
  // لا نُخفي غياب المورد خلف أخضر كاذب.
  console.warn(`[${scriptName}] ⚠ لم يُفحَص — المورد الناقص: ${missing}`);
  console.warn(`  رمز خروج 78 (EX_CONFIG) — ليس 0 · ليس فشل فحص.`);
  if (hint) console.warn(`  ${hint}`);
  process.exit(78);
}
