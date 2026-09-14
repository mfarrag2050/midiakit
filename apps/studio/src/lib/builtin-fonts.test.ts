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

  it('كلّ ملفّ TTF في weights.* موجودٌ في assets/fonts/', () => {
    for (const f of BUILTIN_FONTS) {
      for (const [w, filename] of Object.entries(f.weights)) {
        const path = resolve(FONTS_DIR, filename);
        expect(existsSync(path), `${f.family}.${w} ⇒ ${filename} · على القرص؟`).toBe(true);
      }
    }
  });

  it('كلّ ملفّ TTF مُدرَجٌ في قائمة السماح · /api/fonts/[name]', () => {
    // القراءة نصّاً — قائمة السماح مصفوفة سلاسل حرفيّة في الملفّ.
    const routeSource = readFileSync(API_ROUTE_PATH, 'utf8');
    for (const f of BUILTIN_FONTS) {
      for (const [w, filename] of Object.entries(f.weights)) {
        expect(
          routeSource.includes(`'${filename}'`),
          `${f.family}.${w} ⇒ ${filename} · في whitelist؟`,
        ).toBe(true);
      }
    }
  });

  it('BUILTIN_FONT_FILES مشتقّةٌ منها بلا انحراف', () => {
    for (const f of BUILTIN_FONTS) {
      expect(BUILTIN_FONT_FILES[f.family]).toEqual(f.weights);
    }
    expect(Object.keys(BUILTIN_FONT_FILES).sort()).toEqual(
      [...BUILTIN_FONT_FAMILIES].sort(),
    );
  });
});
