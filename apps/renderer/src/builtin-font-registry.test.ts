// 610a · اختبار وحدة لـ builtin-font-registry.
//
// يُثبت ثلاث حقائق:
//   ١) بعد `registerBuiltinFonts()`، كلّ `mk-builtin-<slug>` من
//      `BUILTIN_FONTS` موجودٌ في `FontLibrary.families`.
//   ٢) `assertBuiltinFontRegistered('mk-builtin-nonexistent')` يرمي
//      `FONT_NOT_REGISTERED`.
//   ٣) `assertBuiltinFontRegistered('mk-<assetId>')` لا يرمي
//      (الخطوط المرفوعة ليست من اختصاصه).
import { describe, it, expect, beforeAll } from 'vitest';
import { FontLibrary } from 'skia-canvas';
import { BUILTIN_FONTS } from '@pf-mediakit/shared';
import {
  registerBuiltinFonts,
  assertBuiltinFontRegistered,
  isBuiltinFontRegistered,
  _resetBuiltinFontRegistry,
} from './lib/builtin-font-registry.js';
import { deriveFontIdentity } from './lib/font-identity.js';

describe('610a · builtin-font-registry', () => {
  beforeAll(() => {
    _resetBuiltinFontRegistry();
    registerBuiltinFonts();
  });

  it('يسجّل كلّ الخطوط المدمَجة تحت mk-builtin-<slug>', () => {
    expect(BUILTIN_FONTS.length).toBeGreaterThan(0);
    for (const font of BUILTIN_FONTS) {
      const runtime = deriveFontIdentity({ family: font.family });
      expect(runtime).toMatch(/^mk-builtin-/);
      expect(isBuiltinFontRegistered(runtime)).toBe(true);
      // FontLibrary.has(name) يُؤكّد التسجيل الفعليّ في skia-canvas.
      expect(FontLibrary.has(runtime)).toBe(true);
    }
  });

  it('assertBuiltinFontRegistered: mk-builtin-* غير مسجَّل ⇒ FONT_NOT_REGISTERED', () => {
    expect(() => assertBuiltinFontRegistered('mk-builtin-nonexistent-family-x'))
      .toThrow(/FONT_NOT_REGISTERED/);
    try {
      assertBuiltinFontRegistered('mk-builtin-nonexistent-family-x');
    } catch (err) {
      expect((err as Error & { code?: string }).code).toBe('FONT_NOT_REGISTERED');
    }
  });

  it('assertBuiltinFontRegistered: mk-<assetId> لا يرمي (ليس بناءً مدمجاً)', () => {
    expect(() => assertBuiltinFontRegistered('mk-11111111-2222-3333-4444-555555555555'))
      .not.toThrow();
  });

  it('assertBuiltinFontRegistered: اسم عرضيّ عاديّ لا يرمي (لم يمرّ بـidentity shim)', () => {
    expect(() => assertBuiltinFontRegistered('Arial')).not.toThrow();
    expect(() => assertBuiltinFontRegistered('Almarai')).not.toThrow();
  });

  it('registerBuiltinFonts idempotent — إعادة الاستدعاء آمنة', () => {
    const r1 = registerBuiltinFonts();
    const r2 = registerBuiltinFonts();
    expect(r1.length).toBe(r2.length);
    expect(r1.length).toBe(BUILTIN_FONTS.length);
  });
});
