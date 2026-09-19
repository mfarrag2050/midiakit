// ٤٠١ §٤ · اختبارُ دالّةِ التمييز — بلا وسيطٍ محرَّك: قاعدةٌ لغويّةٌ
// خالصة، الاختبارُ مقتضبٌ مباشرٌ يحرس عدم انزلاقِ حدود الفئات
// (١ ↔ ٢ · ٢ ↔ ٣ · ١٠ ↔ ١١).
//
// **يتضمّن اختبارَ تكاملٍ على القواميس الثلاثة** — لأنّ الوعدَ في §١ أنّ
// الدالّةَ تنتقي مفتاحاً موجوداً في كلّ لغةٍ لكلّ فئة. مفتاحٌ ناقصٌ =
// انهيارُ العرضِ إلى مفتاحٍ خامٍ («…renderAgeSeconds.two»).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arPluralCategory, pluralFor } from './plural';

describe('arPluralCategory — حدودُ الفئاتِ الأربع', () => {
  it('0 → other (١١+ في الاستعمال، ومفردُ التمييز يقبل الصفر)', () => {
    expect(arPluralCategory(0)).toBe('other');
  });
  it('1 → one', () => {
    expect(arPluralCategory(1)).toBe('one');
  });
  it('2 → two', () => {
    expect(arPluralCategory(2)).toBe('two');
  });
  it('3..10 → few (جمعُ القلّة)', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(arPluralCategory(n)).toBe('few');
    }
  });
  it('11..99 → other (مفردُ التمييز)', () => {
    for (const n of [11, 12, 20, 45, 99]) {
      expect(arPluralCategory(n)).toBe('other');
    }
  });
  it('100+ → other', () => {
    for (const n of [100, 101, 250, 1000]) {
      expect(arPluralCategory(n)).toBe('other');
    }
  });
  it('سالبٌ يُعامَل قيمةً مطلقة', () => {
    expect(arPluralCategory(-1)).toBe('one');
    expect(arPluralCategory(-3)).toBe('few');
    expect(arPluralCategory(-11)).toBe('other');
  });
  it('كسورٌ تُقصّ إلى صحيح', () => {
    expect(arPluralCategory(1.9)).toBe('one');
    expect(arPluralCategory(2.4)).toBe('two');
    expect(arPluralCategory(10.7)).toBe('few');
  });
});

describe('pluralFor — يختار من كائنٍ رباعيّ', () => {
  const forms = {
    one: 'واحد',
    two: 'اثنان',
    few: 'قليل',
    other: 'كثير',
  } as const;
  it('1 → واحد', () => expect(pluralFor(1, forms)).toBe('واحد'));
  it('2 → اثنان', () => expect(pluralFor(2, forms)).toBe('اثنان'));
  it('5 → قليل', () => expect(pluralFor(5, forms)).toBe('قليل'));
  it('12 → كثير', () => expect(pluralFor(12, forms)).toBe('كثير'));
});

// ─── تكامل — كلّ مفتاحٍ متوقَّع موجودٌ في القواميس الثلاثة ─────────
type Dict = Record<string, unknown>;

function loadDict(name: 'ar' | 'mixed' | 'en'): Dict {
  const path = resolve(__dirname, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Dict;
}

function get(d: Dict, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, k) =>
      acc && typeof acc === 'object' ? (acc as Dict)[k] : undefined,
    d,
  );
}

const PLURAL_KEYS = [
  'pages.projects.editor.renderAgeSeconds',
  'pages.projects.editor.renderAgeMinutes',
  'pages.projects.editor.renderAgeHours',
  'time.minAgo',
  'time.hourAgo',
  'time.dayAgo',
] as const;

const CATEGORIES = ['one', 'two', 'few', 'other'] as const;

describe.each(['ar', 'mixed', 'en'] as const)('قاموس %s — كلّ مفتاحٍ رباعيّ مكتمل', (loc) => {
  const dict = loadDict(loc);
  it.each(PLURAL_KEYS)('%s يحوي one/two/few/other', (key) => {
    for (const cat of CATEGORIES) {
      const val = get(dict, `${key}.${cat}`);
      expect(val, `${loc}.${key}.${cat}`).toBeTypeOf('string');
      expect((val as string).length, `${loc}.${key}.${cat}`).toBeGreaterThan(0);
    }
  });
});

describe('ar — الصيغُ الصحيحةُ نصّاً (يحرسُ الانحدار)', () => {
  const ar = loadDict('ar');
  it.each([
    ['renderAgeMinutes.few', '{n} دقائق'],
    ['renderAgeMinutes.other', '{n} دقيقة'],
    ['renderAgeSeconds.few', '{n} ثوانٍ'],
    ['renderAgeSeconds.other', '{n} ثانية'],
    ['renderAgeHours.few', '{n} ساعات'],
    ['renderAgeHours.other', '{n} ساعة'],
  ])('pages.projects.editor.%s = %j', (suffix, expected) => {
    expect(get(ar, `pages.projects.editor.${suffix}`)).toBe(expected);
  });
});
