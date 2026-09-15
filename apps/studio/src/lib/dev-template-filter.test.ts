// 330-THREE-LEAKS-AND-A-LIE §3.1 · دلائل فلترة القوالب المسمّاة بلغة المطوّر.

import { describe, it, expect } from 'vitest';
import { isDevNamedTemplate } from './dev-template-filter';

describe('isDevNamedTemplate (330 §3.1)', () => {
  it('يمسك «بسيط — إثبات بوّابة المرحلة 2» — التسريب الأصليّ في التذكرة', () => {
    expect(isDevNamedTemplate('بسيط — إثبات بوّابة المرحلة 2')).toBe(true);
  });

  it('يمسك أرقاماً هندية أيضاً (المرحلة ٢)', () => {
    expect(isDevNamedTemplate('بسيط — إثبات بوّابة المرحلة ٢')).toBe(true);
  });

  it('يمسك mock/dev/seed حرفياً بلا حساسيّة لحال الأحرف', () => {
    expect(isDevNamedTemplate('Mock template')).toBe(true);
    expect(isDevNamedTemplate('dev-only card')).toBe(true);
    expect(isDevNamedTemplate('SEED')).toBe(true);
  });

  it('لا يمسك أسماء عادية (بطاقة عاجل، بطاقة سفلية، ريلز)', () => {
    expect(isDevNamedTemplate('بطاقة عاجل')).toBe(false);
    expect(isDevNamedTemplate('بطاقة سفلية')).toBe(false);
    expect(isDevNamedTemplate('ريلز')).toBe(false);
    expect(isDevNamedTemplate('Latin Card')).toBe(false);
  });

  it('لا يمسك «مرحلة» في سياق عاديّ (مرحلة الطفولة، مرحلة الإنتاج)', () => {
    // النمط يشترط رقماً بعد «المرحلة» — كي لا يمسك عناوين حقيقيّة.
    expect(isDevNamedTemplate('بطاقة مرحلة الطفولة')).toBe(false);
    expect(isDevNamedTemplate('مرحلة الإنتاج')).toBe(false);
  });
});
