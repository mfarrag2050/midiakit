// 340 · اختبار يمنع سقوط دورٍ بلا اسم.
//
// كلّ دورٍ معرَّف في `Role` type يجب أن يحمل مفتاح `roles.<r>.name` و
// `roles.<r>.hint` غير فارغين في القواميس الثلاثة. سقوط أيّها = رؤية
// المحرّر مفتاحاً خاماً في الشاشة، أو dropdown فيه قيمةٌ ناقصة.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { roleName, roleHint, ROLE_KEYS } from './role-names';
import type { Role } from '@/src/api/types';

type Dict = Record<string, unknown>;

function loadDict(name: 'ar' | 'mixed' | 'en'): Dict {
  const path = resolve(
    __dirname,
    '../../../../packages/i18n/src',
    `${name}.json`,
  );
  return JSON.parse(readFileSync(path, 'utf8')) as Dict;
}

function get(d: Dict, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, k) =>
      acc && typeof acc === 'object' ? (acc as Dict)[k] : undefined,
    d,
  );
}

// القيم التقنيّة السبع كما في `Role` — أيّ زيادة عليها لاحقاً تكسر الاختبار
// ⇒ تُذكِّرنا بإضافة الترجمة قبل الدمج.
const CANONICAL_ROLES: readonly Role[] = [
  'owner',
  'admin',
  'writer',
  'editor',
  'reviewer',
  'approver',
  'viewer',
];

describe('roleName · roleHint (340)', () => {
  it('يعرف الأدوار السبعة كلّها', () => {
    expect(new Set(ROLE_KEYS)).toEqual(new Set(CANONICAL_ROLES));
  });

  it.each(['ar', 'mixed', 'en'] as const)(
    'كل دور له name + hint غير فارغَين في %s.json',
    (locale) => {
      const d = loadDict(locale);
      for (const r of CANONICAL_ROLES) {
        const name = get(d, `roles.${r}.name`);
        const hint = get(d, `roles.${r}.hint`);
        expect(typeof name).toBe('string');
        expect((name as string).length).toBeGreaterThan(0);
        expect(typeof hint).toBe('string');
        expect((hint as string).length).toBeGreaterThan(0);
      }
    },
  );

  it('roleName يمرّر عبر t() ويُعيد النصّ للأدوار المعروفة', () => {
    const t = (k: string): string => `T[${k}]`;
    expect(roleName(t, 'writer')).toBe('T[roles.writer.name]');
    expect(roleName(t, 'admin')).toBe('T[roles.admin.name]');
  });

  it('roleName يُعيد القيمة التقنيّة كما هي للدور المجهول (سقوط آمن)', () => {
    const t = (k: string): string => `T[${k}]`;
    expect(roleName(t, 'unknown_role')).toBe('unknown_role');
    expect(roleHint(t, 'unknown_role')).toBe('');
  });
});
