// 360b (بعد الموعد) · حارس مصدرٍ واحد للحقيقة.
//
// **ما يتحقّق منه هذا الاختبار:**
//   1. `BUILTIN_FONTS` يذكر عائلتَين اثنتَين: IBM Plex Sans Arabic + Almarai
//      (تجميدٌ للحال الحاليّة · تُحدَّث حين تُضاف عائلة).
//   2. كلّ ملفّ TTF في `weights.*` موجودٌ فعلاً في `assets/fonts/`.
//   3. كلّ ملفّ TTF في `weights.*` مُدرَجٌ في قائمة السماح
//      (`apps/studio/app/api/fonts/[name]/route.ts`) — بدون ذلك تفشل
//      المعاينة عند التحميل بلا رسالة صريحة.
//
// **RED (إن اختلّت الحقيقة):**
//   · إضافة عائلة إلى `BUILTIN_FONTS` بلا رفع ملفّها ⇒ يفشل §٢.
//   · إضافة عائلة بلا تحديث whitelist في route.ts ⇒ يفشل §٣.
//   · حذف عائلة من `BUILTIN_FONTS` بلا تحديث الاختبار ⇒ يفشل §١.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILTIN_FONTS, BUILTIN_FONT_FAMILIES, BUILTIN_FONT_FILES } from './builtin-fonts';

const REPO_ROOT = resolve(__dirname, '../../../..');
const FONTS_DIR = resolve(REPO_ROOT, 'assets/fonts');
const API_ROUTE_PATH = resolve(
  REPO_ROOT,
  'apps/studio/app/(app)/../../app/api/fonts/[name]/route.ts',
);

describe('BUILTIN_FONTS · single source of truth (360b · بعد الموعد)', () => {
  it('يذكر عائلتَين اثنتَين حصراً · IBM Plex Sans Arabic + Almarai', () => {
    expect(BUILTIN_FONT_FAMILIES).toEqual(['IBM Plex Sans Arabic', 'Almarai']);
  });

  it('كلّ عائلة تحمل ثلاثة أوزان بالضبط (light · regular · bold)', () => {
    for (const f of BUILTIN_FONTS) {
      const keys = Object.keys(f.weights).sort();
      expect(keys).toEqual(['bold', 'light', 'regular']);
    }
  });

  it('كلّ ملفّ TTF في weights.*.file موجودٌ في assets/fonts/', () => {
    for (const f of BUILTIN_FONTS) {
      for (const [w, weight] of Object.entries(f.weights)) {
        const path = resolve(FONTS_DIR, weight.file);
        expect(existsSync(path), `${f.family}.${w} ⇒ ${weight.file} · على القرص؟`).toBe(true);
      }
    }
  });

  it('كلّ ملفّ TTF مُدرَجٌ في قائمة السماح · /api/fonts/[name]', () => {
    // القراءة نصّاً — قائمة السماح مصفوفة سلاسل حرفيّة في الملفّ.
    const routeSource = readFileSync(API_ROUTE_PATH, 'utf8');
    for (const f of BUILTIN_FONTS) {
      for (const [w, weight] of Object.entries(f.weights)) {
        expect(
          routeSource.includes(`'${weight.file}'`),
          `${f.family}.${w} ⇒ ${weight.file} · في whitelist؟`,
        ).toBe(true);
      }
    }
  });

  // ٤٣٠ §٢ · متريكاتُ رأس الخطّ كاملةٌ لكلّ وزنٍ يدخل المعرِض. غيابُها
  // يجعل الرندرَ يرمي `INVALID_FONT_METRICS` (٨١٠).
  it('كلّ وزنٍ يحمل FontMetrics صحيحة (ascent · descent · unitsPerEm)', () => {
    for (const f of BUILTIN_FONTS) {
      for (const [w, weight] of Object.entries(f.weights)) {
        expect(weight.metrics.ascent, `${f.family}.${w}.ascent`).toBeGreaterThan(0);
        expect(weight.metrics.descent, `${f.family}.${w}.descent`).toBeGreaterThan(0);
        expect(weight.metrics.unitsPerEm, `${f.family}.${w}.unitsPerEm`).toBeGreaterThan(0);
      }
    }
  });

  // ٤٣٠ §٤ · قاعدة ٣٩٤ · كلّ خطٍّ يدخل المعرِض يحمل رخصةً حرّةً مسمّاة
  // وله ملفُّ رخصةٍ على القرص.
  it('كلّ خطٍّ يحمل licenseً من القائمة المسموحة وملفَّ رخصةٍ موجوداً', () => {
    const ALLOWED = new Set(['OFL-1.1', 'Apache-2.0']);
    for (const f of BUILTIN_FONTS) {
      expect(ALLOWED.has(f.license), `${f.family}.license = ${f.license}`).toBe(true);
      expect(f.nameAr.length, `${f.family}.nameAr`).toBeGreaterThan(0);
      expect(f.sampleAr.length, `${f.family}.sampleAr`).toBeGreaterThan(0);
      const licPath = resolve(FONTS_DIR, f.licenseFile);
      expect(existsSync(licPath), `${f.family}.licenseFile = ${f.licenseFile}`).toBe(true);
    }
  });

  it('BUILTIN_FONT_FILES مشتقّةٌ منها بلا انحراف (أسماء الملفّات فقط)', () => {
    for (const f of BUILTIN_FONTS) {
      // ٤٣٠ §١ · التوقيع القديم يحمل أسماء ملفّات فقط. الشكل الجديد
      // يحمل file+value+labelKey+metrics — الاشتقاق يستخرج الأسماء.
      expect(BUILTIN_FONT_FILES[f.family]).toEqual({
        light: f.weights.light.file,
        regular: f.weights.regular.file,
        bold: f.weights.bold.file,
      });
    }
    expect(Object.keys(BUILTIN_FONT_FILES).sort()).toEqual(
      [...BUILTIN_FONT_FAMILIES].sort(),
    );
  });
});
