// البند 4 · اختبار (1) المُجاز — «هويّة بلا secondary ⇒ لا تتغيّر لقطة».
//
// هذا الفرع عقدٌ في الأنواع فقط؛ المحرّك لا يقرأ `secondary` ولا
// `<role>.family` بعد. ثبات md5 للّقطات يحرسه `verify:snapshot` في CI.
// هنا نثبّت المقدّمة: لا هويّةَ مشحونة ولا الافتراضيّ يستعمل الحقلين،
// فكلّ لقطة قائمة تُرسَم من هويّة بلا secondary.
//
// **كيف يموت:** إضافة `secondary` أو `family` إلى هويّة مشحونة قبل أن
// يقرأهما المحرّك ⇒ أحمر (قيمة في الهويّة لا يرسمها المحرّك).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BRAND } from './default-brand.js';
import { MARAFI_BRAND } from './brands/marafi.js';

const BRANDS_DIR = join(__dirname, '../../../brands');

function usesSecondary(cfg: unknown): string[] {
  const hits: string[] = [];
  const c = cfg as { fonts?: Record<string, unknown>; typography?: Record<string, unknown> };
  if (c.fonts && 'secondary' in c.fonts) hits.push('fonts.secondary');
  for (const [role, v] of Object.entries(c.typography ?? {})) {
    if (v && typeof v === 'object' && 'family' in v) hits.push(`typography.${role}.family`);
  }
  return hits;
}

describe('البند 4 · (1) الهويّات المشحونة بلا secondary', () => {
  it('DEFAULT_BRAND و MARAFI_BRAND', () => {
    expect(usesSecondary(DEFAULT_BRAND)).toEqual([]);
    expect(usesSecondary(MARAFI_BRAND)).toEqual([]);
  });

  it('brands/*.json', () => {
    const files = readdirSync(BRANDS_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const cfg = JSON.parse(readFileSync(join(BRANDS_DIR, f), 'utf8'));
      expect(usesSecondary(cfg), f).toEqual([]);
    }
  });
});
