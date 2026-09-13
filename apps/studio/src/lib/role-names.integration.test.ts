// 340 · اختبار حياة: تأكيد أنّ `roleName` تحوّل القيم التقنيّة إلى الأسماء
// العربيّة المُقرّة، لا إلى الحرفيّ الإنجليزيّ. هذا هو الفرق الوظيفيّ الذي
// أَقرّته 340b.
//
// **RED (قبل التطبيق):** الـdropdown كان يعرض `{r}` مباشرةً (writer/…).
// **GREEN (بعد):** يمرّ عبر `t(roles.<r>.name)` ⇒ «الكاتب» في ar، «Writer»
// في en، «الكاتب» في mixed (المفتاح ينحاز عربيّاً كما اتّفقنا).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { roleName } from './role-names';

type Dict = Record<string, unknown>;
function loadDict(name: 'ar' | 'mixed' | 'en'): Dict {
  return JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../packages/i18n/src', `${name}.json`),
      'utf8',
    ),
  ) as Dict;
}
function get(d: Dict, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, k) =>
      acc && typeof acc === 'object' ? (acc as Dict)[k] : undefined,
    d,
  );
}
function tOf(dict: Dict) {
  return (k: string): string => {
    const v = get(dict, k);
    return typeof v === 'string' ? v : k;
  };
}

describe('roleName integration · القيم المُقرَّة في 340b', () => {
  it('ar: الأدوار الأربعة الظاهرة في presets تُترجَم للنصّ العربيّ المُقرَّر', () => {
    const t = tOf(loadDict('ar'));
    expect(roleName(t, 'writer')).toBe('الكاتب');
    expect(roleName(t, 'editor')).toBe('المحرِّر');
    expect(roleName(t, 'reviewer')).toBe('المُراجِع');
    expect(roleName(t, 'admin')).toBe('المدير');
  });

  it('ar: الأدوار الثلاثة الأخرى مُسمّاة أيضاً', () => {
    const t = tOf(loadDict('ar'));
    expect(roleName(t, 'owner')).toBe('مالك الحساب');
    expect(roleName(t, 'approver')).toBe('المُعتمِد النهائيّ');
    expect(roleName(t, 'viewer')).toBe('قارئ فقط');
  });

  it('en: الأدوار السبعة كلّها بالإنجليزيّة الصحيحة', () => {
    const t = tOf(loadDict('en'));
    expect(roleName(t, 'writer')).toBe('Writer');
    expect(roleName(t, 'editor')).toBe('Editor');
    expect(roleName(t, 'reviewer')).toBe('Reviewer');
    expect(roleName(t, 'admin')).toBe('Administrator');
    expect(roleName(t, 'owner')).toBe('Account owner');
    expect(roleName(t, 'approver')).toBe('Final approver');
    expect(roleName(t, 'viewer')).toBe('Viewer');
  });

  it('لا واحدٌ يعود بالحرف التقنيّ الخام في أيّ قاموس', () => {
    const rawRoles = ['owner', 'admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer'];
    for (const locale of ['ar', 'mixed', 'en'] as const) {
      const t = tOf(loadDict(locale));
      for (const r of rawRoles) {
        const display = roleName(t, r);
        // القيمة المرجّعة ≠ القيمة التقنيّة (writer ≠ Writer/الكاتب/…).
        expect(display).not.toBe(r);
        expect(display).not.toBe(`roles.${r}.name`);
      }
    }
  });

  it('actorHint المفتاح محذوفٌ من القواميس الثلاثة', () => {
    for (const locale of ['ar', 'mixed', 'en'] as const) {
      const d = loadDict(locale);
      const v = get(d, 'pages.projects.editor2.actorHint');
      expect(v).toBeUndefined();
    }
  });
});
