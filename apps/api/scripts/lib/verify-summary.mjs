/**
 * FIX-CASCADE — سطر ملخّص موحَّد لكل verify:* (L-53).
 *
 * قاعدة: تقرير «خضراء» أو «إخفاق واحد» بلا عدد ليس دليلاً. كل بوابة
 * تطبع سطراً أخيراً موحّد الشكل:
 *   <name>: <total> فحصاً · <failures> إخفاقاً
 *
 * verify:all يجمع هذه الأسطر ويطبع الجدول. لا اجتهاد في العدّ.
 */

/**
 * يُنشئ counter مشترك لسكربت verify.
 * الاستعمال:
 *   const { pass, fail, summary } = createCounters();
 *   pass('...'); fail('...');
 *   // في finally:
 *   summary('bk-numerals');
 */
export function createCounters() {
  let passes = 0;
  let failures = 0;
  return {
    pass(msg) { passes++; console.log(`  ✓ ${msg}`); },
    fail(msg) { failures++; console.error(`  ✗ ${msg}`); },
    getFailures() { return failures; },
    getPasses() { return passes; },
    summary(name) {
      const total = passes + failures;
      // سطر ثابت الصيغة — verify:all يعتمد عليه.
      console.log(`\n[verify-summary] ${name}: ${total} فحصاً · ${failures} إخفاقاً`);
    },
  };
}
