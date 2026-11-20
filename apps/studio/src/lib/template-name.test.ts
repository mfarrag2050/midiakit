import { describe, it, expect } from 'vitest';
import en from '../../../../packages/i18n/src/en.json';
import ar from '../../../../packages/i18n/src/ar.json';
import { templateDisplayName, type Translator } from './template-name';

function dictTranslator(dict: unknown): Translator {
  const lookup = (key: string): string | null => {
    let cur: unknown = dict;
    for (const seg of key.split('.')) {
      if (!cur || typeof cur !== 'object') return null;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return typeof cur === 'string' ? cur : null;
  };
  return { t: (k) => lookup(k) ?? k, has: (k) => lookup(k) !== null };
}

// المفاتيح الستّة = definition.id في packages/templates/src/templates/*.json
const SYSTEM_KEYS = ['breaking', 'card_bottom', 'card_centered', 'card_kicker', 'plain', 'reel'];

describe('549 · templateDisplayName', () => {
  it('قالب عامّ بمفتاح معروف ⇒ ترجمة الواجهة الإنجليزيّة', () => {
    expect(templateDisplayName({ name: 'بطاقة عاجل', key: 'breaking' }, dictTranslator(en))).toBe('Breaking card');
  });

  it('كلّ مفتاح قالب عامّ مترجَم في en وفي ar', () => {
    for (const k of SYSTEM_KEYS) {
      const enName = templateDisplayName({ name: '∅', key: k }, dictTranslator(en));
      const arName = templateDisplayName({ name: '∅', key: k }, dictTranslator(ar));
      expect(enName, k).not.toBe('∅');
      expect(arName, k).not.toBe('∅');
      expect(enName, k).not.toMatch(/[؀-ۿ]/);
    }
  });

  it('قالب مستأجر (key=null) ⇒ الاسم كما كتبه المستخدم', () => {
    expect(templateDisplayName({ name: 'قالبي', key: null }, dictTranslator(en))).toBe('قالبي');
  });

  it('مفتاح بلا ترجمة ⇒ الاسم المخزَّن لا مسار المفتاح', () => {
    expect(templateDisplayName({ name: 'جديد', key: 'unknown_key' }, dictTranslator(en))).toBe('جديد');
  });
});
