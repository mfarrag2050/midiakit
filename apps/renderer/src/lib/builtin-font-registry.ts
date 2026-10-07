// 610a · تسجيل الخطوط المدمَجة في `FontLibrary` عند إقلاع العامل.
//
// **العطب الذي يُغلقه (شُخِّص في 610 §0):**
//   `api-worker.ts` كان لا يُسجّل أيّ خطٍّ مدمج في `FontLibrary`. فحين
//   يصل `brand.fonts.primary.family = 'mk-builtin-almarai'` (بعد
//   `applyRuntimeFontIdentity`)، skia-canvas لا يجده ⇒ **fallback صامت**
//   إلى خطّ النظام. البطاقة تخرج «ناجحة» بخطٍّ ليس المُعلَن.
//
// **الحلّ:**
//   `registerBuiltinFonts()` — يُستدعى عند تحميل الوحدة في `api-worker`.
//   لكلّ خطٍّ في `BUILTIN_FONTS` (من `@pf-mediakit/shared`) يُسجَّل
//   اسم runtime المشتقّ (`mk-builtin-<slug>`) مع ملفّات الأوزان الثلاثة.
//
// **لا سقوط صامت:** `assertBuiltinFontRegistered(family)` يرمي
//   `FONT_NOT_REGISTERED` إن طُلبت عائلةُ `mk-builtin-*` غير مسجَّلة.
//
// **الوحدة سفليّة فقط:** `apps/renderer` لا `packages/engine` —
//   المحرّك خالصٌ ولا يستورد skia-canvas.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FontLibrary } from 'skia-canvas';
import { BUILTIN_FONTS } from '@pf-mediakit/shared';
import { deriveFontIdentity } from './font-identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/renderer/src/lib/*.ts → ../../../.. = جذر المستودع.
const ROOT = resolve(__dirname, '..', '..', '..', '..');
const FONTS_DIR = join(ROOT, 'assets', 'fonts');

const registered = new Set<string>();

export interface RegisteredBuiltinFont {
  readonly family: string;
  readonly runtime: string;
  readonly files: readonly string[];
}

/**
 * يُسجّل كلّ الخطوط المدمَجة في `FontLibrary`. idempotent — إعادة
 * الاستدعاء آمنة (`FontLibrary.use` تستبدل التسجيل بنفس الاسم).
 *
 * **لا existsSync عمداً:** `FontLibrary.use` من skia-canvas يرمي
 * `FontLibrary: can't open font file ...` إن غاب الملفّ — نترك هذا
 * الرمي يظهر بمساره الكامل. سبقه بـ`node:fs.existsSync` يتعارض مع
 * اختبارات 601c التي تُقنّع `node:fs` كاملاً (`existsSync: () => false`
 * لعزل processApiJob عن fs الحقيقيّ). skia-canvas لا يقرأ عبر `node:fs`
 * فيبقى سليماً.
 *
 * السقوط عند الملفّ المفقود يبقى بصوت — عبر `FontLibrary` لا عبرنا.
 */
export function registerBuiltinFonts(): readonly RegisteredBuiltinFont[] {
  const results: RegisteredBuiltinFont[] = [];
  for (const font of BUILTIN_FONTS) {
    const runtime = deriveFontIdentity({ family: font.family });
    const files = [
      join(FONTS_DIR, font.weights.light.file),
      join(FONTS_DIR, font.weights.regular.file),
      join(FONTS_DIR, font.weights.bold.file),
    ];
    try {
      FontLibrary.use(runtime, files);
      registered.add(runtime);
      results.push({ family: font.family, runtime, files });
    } catch (err) {
      // skia-canvas رمى — غالباً ملفٌّ مفقود. نُعيد الرمي بمفتاح
      // `BUILTIN_FONT_FILE_MISSING` ليدخل القاموس.
      const msg = err instanceof Error ? err.message : String(err);
      const next = new Error(
        `BUILTIN_FONT_FILE_MISSING: family=${font.family} · ${msg}`
      );
      (next as Error & { code: string }).code = 'BUILTIN_FONT_FILE_MISSING';
      throw next;
    }
  }
  return results;
}

/**
 * يرمي `FONT_NOT_REGISTERED` إن كان `family` من فضاء `mk-builtin-*`
 * ولم يُسجَّل. يترك fonts المرفوعة (`mk-<assetId>`) على مسار العامل
 * الآخر — تُسجَّل في `processApiJob` بعد تنزيل الأصل.
 */
export function assertBuiltinFontRegistered(family: string): void {
  if (!family.startsWith('mk-builtin-')) return;
  if (!registered.has(family)) {
    const err = new Error(`FONT_NOT_REGISTERED: ${family}`);
    (err as Error & { code: string }).code = 'FONT_NOT_REGISTERED';
    throw err;
  }
}

/** للاختبار الوحداتيّ فقط — يُعيد ضبط الحالة الداخليّة. */
export function _resetBuiltinFontRegistry(): void {
  registered.clear();
}

/** للاختبار والقياس — هل العائلة runtime مسجّلة؟ */
export function isBuiltinFontRegistered(runtime: string): boolean {
  return registered.has(runtime);
}

/** للاختبار والقياس — قائمة العائلات المسجَّلة. */
export function listRegisteredBuiltinFonts(): readonly string[] {
  return Array.from(registered);
}
