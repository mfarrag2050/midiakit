import { describe, it, expect } from 'vitest';
import { validateTemplate, TemplateValidationError } from './validate.js';
import {
  BREAKING,
  CARD_BOTTOM,
  CARD_CENTERED,
  CARD_KICKER,
  PLAIN,
  REEL,
  TEMPLATES,
} from './index.js';

describe('validateTemplate — قوالب المستودع الجاهزة', () => {
  it('يحمّل ويتحقّق من كل القوالب الستّة عند الاستيراد', () => {
    expect(BREAKING.id).toBe('breaking');
    expect(CARD_CENTERED.id).toBe('card_centered');
    expect(CARD_BOTTOM.id).toBe('card_bottom');
    expect(CARD_KICKER.id).toBe('card_kicker');
    expect(REEL.id).toBe('reel');
    expect(PLAIN.id).toBe('plain');
  });

  it('كل قالب له layers غير فارغة و kind صالح', () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      expect(tpl.layers.length, `${key} layers`).toBeGreaterThan(0);
      expect(['static', 'video']).toContain(tpl.kind);
    }
  });
});

describe('validateTemplate — رفض المدخلات المعطوبة', () => {
  const base = {
    id: 'test',
    name: 'اختبار',
    kind: 'static' as const,
    sizes: ['x'],
    layers: [{ type: 'solid', fill: 'brand.colors.surface' }],
  };

  it('يرفض id بحروف كبيرة', () => {
    expect(() =>
      validateTemplate({ ...base, id: 'Test' })
    ).toThrow(TemplateValidationError);
  });

  it('يرفض kind غير معروف', () => {
    expect(() =>
      validateTemplate({ ...base, kind: 'gif' })
    ).toThrow(TemplateValidationError);
  });

  it('يرفض layers فارغة', () => {
    expect(() => validateTemplate({ ...base, layers: [] })).toThrow(
      TemplateValidationError
    );
  });

  it('يرفض onlyIf غير معروف', () => {
    expect(() =>
      validateTemplate({
        ...base,
        layers: [{ type: 'solid', fill: 'brand.colors.surface', onlyIf: 'hasFoo' }],
      })
    ).toThrow(TemplateValidationError);
  });

  it('يرفض headline بدون verticalAnchor عند anchor=centerLower', () => {
    expect(() =>
      validateTemplate({
        ...base,
        layers: [
          {
            type: 'headline',
            field: 'headline',
            wrap: 'uniform',
            align: 'right',
            anchor: 'centerLower',
            font: 'brand.typography.breaking',
          },
        ],
      })
    ).toThrow(/verticalAnchor/);
  });

  it('يرفض badge بدون use', () => {
    expect(() =>
      validateTemplate({
        ...base,
        layers: [
          { type: 'badge', anchor: 'above-headline', gap: 28 },
        ],
      })
    ).toThrow(/use/);
  });

  it('يرفض source بدون gapFsRatio', () => {
    expect(() =>
      validateTemplate({
        ...base,
        layers: [
          {
            type: 'source',
            field: 'source',
            anchor: 'below-headline',
            font: 'brand.typography.source',
          },
        ],
      })
    ).toThrow(/gapFsRatio/);
  });

  it('يفحص fallback بشكل recursion', () => {
    expect(() =>
      validateTemplate({
        ...base,
        layers: [
          {
            type: 'image',
            field: 'image',
            fit: 'cover',
            fallback: [
              { type: 'unknownType' },
            ],
          },
        ],
      })
    ).toThrow(/fallback\[0\]\.type/);
  });

  it('يحمل المسار الكامل في رسالة الخطأ', () => {
    try {
      validateTemplate({
        ...base,
        layers: [
          { type: 'solid', fill: 'x' },
          { type: 'gradient', direction: 'sideways' },
        ],
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateValidationError);
      expect((e as TemplateValidationError).path).toBe('layers[1].direction');
    }
  });
});
