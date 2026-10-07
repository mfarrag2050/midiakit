// 610 §3 · حارس التمييز بين فشل التحليل وغياب الجداول.
//
// `readFont` تُفرِّق بين سببَين عمليّاً مختلفَين:
//   1) parse_fail — ليس TTF/OTF/WOFF2 صالحاً ⇒ العميل يرى INVALID_FONT_FILE
//   2) missing    — قُرئ لكن بلا OS/2/hhea/head ⇒ INVALID_FONT_METRICS
//
// هذا الاختبار يُثبت الوجهَين على ملفّين حقيقيَّين:
//   • TTF صحيح من `assets/fonts/` ⇒ ok
//   • Buffer عشوائيّ (ليس TTF) ⇒ parse_fail
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFont, extractFontMetrics } from './font-metrics.js';

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const FONTS_DIR = resolve(ROOT, 'assets', 'fonts');
const VALID_FONT = resolve(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf');

describe('610 §3 · readFont — تمييز فشل التحليل من غياب الجداول', () => {
  it('ملفّ TTF صالح ⇒ ok مع المتريكات', () => {
    const buf = readFileSync(VALID_FONT);
    const r = readFont(buf);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.metrics.ascent).toBeGreaterThan(0);
      expect(r.metrics.descent).toBeGreaterThan(0);
      expect(r.metrics.unitsPerEm).toBe(1000);
      expect(['typo', 'hhea']).toContain(r.metrics.source);
    }
  });

  it('بايتات عشوائيّة (ليست خطّاً) ⇒ parse_fail', () => {
    // 256 بايت لا تحمل توقيع TTF/OTF/WOFF — opentype.parse يرمي.
    const bogus = Buffer.alloc(256);
    for (let i = 0; i < bogus.length; i++) bogus[i] = i;
    const r = readFont(bogus);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse_fail');
  });

  it('نصّ ASCII (ليس خطّاً) ⇒ parse_fail', () => {
    const text = Buffer.from('هذا ليس ملفَّ خطّ · This is not a font file');
    const r = readFont(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse_fail');
  });

  // extractFontMetrics — المسار القديم للـCLI يبقى يعيد ExtractedMetrics | null.
  it('extractFontMetrics يبقى يعيد null عند الفشل · ExtractedMetrics عند النجاح', () => {
    const buf = readFileSync(VALID_FONT);
    const m = extractFontMetrics(buf);
    expect(m).not.toBeNull();
    expect(m!.unitsPerEm).toBe(1000);

    const bogus = Buffer.alloc(64);
    expect(extractFontMetrics(bogus)).toBeNull();
  });
});
