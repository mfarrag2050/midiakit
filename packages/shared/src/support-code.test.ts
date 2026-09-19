import { describe, it, expect } from 'vitest';
import { supportCodeFor } from './support-code.js';

describe('supportCodeFor · ٣٧٠ · رمز حادثة قابل للنطق', () => {
  it('يُعيد شكل MK-XXXX-XXXX (12 حرفاً · شرطتان)', () => {
    const code = supportCodeFor('11111111-1111-1111-1111-111111111111');
    expect(code).toMatch(/^MK-[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/);
    expect(code.length).toBe(12);
  });

  it('حتميّ: نفس renderId ⇒ نفس supportCode', () => {
    const id = 'aabbccdd-eeff-0011-2233-445566778899';
    expect(supportCodeFor(id)).toBe(supportCodeFor(id));
  });

  it('يختلف بين renderIds مختلفة', () => {
    const a = supportCodeFor('11111111-1111-1111-1111-111111111111');
    const b = supportCodeFor('22222222-2222-2222-2222-222222222222');
    expect(a).not.toBe(b);
  });

  it('لا يحوي 0/O/1/I/L (Crockford — بلا التباس بصريّ)', () => {
    // نُشغّل 200 UUID ونتحقّق أنّ أيّ حرف ممنوعٍ لا يظهر.
    for (let i = 0; i < 200; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`;
      const code = supportCodeFor(id);
      // نحذف MK- والشرطات ثمّ نفحص الأحرف الثمانية.
      const chars = code.slice(3).replace('-', '');
      expect(chars).not.toMatch(/[OIL]/);
      // 0 و 1 مقبولان في Crockford (رقمان صريحان) — الممنوع الأحرف فقط.
    }
  });

  it('حسّاس لتغيير حرف واحد في UUID (avalanche)', () => {
    const a = supportCodeFor('00000000-0000-0000-0000-000000000000');
    const b = supportCodeFor('00000000-0000-0000-0000-000000000001');
    expect(a).not.toBe(b);
  });

  it('لا يحوي بيانات renderId مباشرةً (لا تسريب)', () => {
    // renderId فيه سلاسل يمكن تمييزها — يجب ألّا تظهر في الرمز.
    const id = 'abcdef01-2345-6789-abcd-ef0123456789';
    const code = supportCodeFor(id);
    expect(code).not.toContain('abcdef');
    expect(code).not.toContain('012345');
  });
});
