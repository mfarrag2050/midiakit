// mk/524b · وحدةٌ لـheadlineBrandFor — مصدرٌ واحدٌ لقاعدة مبادلة 478b.
// اختبار الوحدة: كلا المسارَين (render.ts:runHeadline و draw-timeline-at.ts:
// applyTemplateLayer/applyTemplateHeadline) يستدعيان هذه الدالّة نفسَها،
// فتساويهما في الناتج ⇐ خاصّيّةٌ من الدالّة، لا انتظاراً لتزامنٍ يدويّ.

import { describe, expect, it } from 'vitest';
import type { BrandKit } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { headlineBrandFor, type RenderState } from './render.js';

// هويّةٌ اصطناعيّةٌ للاختبار: لها urgentText — كـmanara.
const brandWithUrgentText: BrandKit = {
  ...DEFAULT_BRAND,
  colors: { ...DEFAULT_BRAND.colors, text: '#1A2733', urgentText: '#F5F1E8' },
};

describe('headlineBrandFor · مبادلة 478b', () => {
  it('surfaceIsUrgent=true + urgentText معرَّف ⇒ يبدّل text ← urgentText', () => {
    const state: RenderState = { surfaceIsUrgent: true };
    const out = headlineBrandFor(brandWithUrgentText, state);
    expect(out.colors.text).toBe('#F5F1E8');
    expect(out.colors.urgentText).toBe('#F5F1E8'); // احتفاظ
  });

  it('surfaceIsUrgent=false ⇒ لا مبادلة (الهويّة الأصليّة)', () => {
    const state: RenderState = { surfaceIsUrgent: false };
    const out = headlineBrandFor(brandWithUrgentText, state);
    expect(out.colors.text).toBe('#1A2733');
    expect(out).toBe(brandWithUrgentText); // إرجاعٌ حرفيّ (لا نسخ) — يحمي بايت-الثبات.
  });

  it('urgentText غير معرَّف ⇒ لا مبادلة حتى مع surfaceIsUrgent=true (سلوك DEFAULT_BRAND)', () => {
    const state: RenderState = { surfaceIsUrgent: true };
    const out = headlineBrandFor(DEFAULT_BRAND, state);
    expect(out).toBe(DEFAULT_BRAND); // بايت-ثباتٌ لـdefault وسائرِ الهويّات القديمة.
  });

  it('surfaceIsUrgent=undefined ⇒ لا مبادلة', () => {
    const state: RenderState = {};
    const out = headlineBrandFor(brandWithUrgentText, state);
    expect(out).toBe(brandWithUrgentText);
  });

  it('لا يعدّل الهويّة الأصليّة (نسخةٌ ضحلة)', () => {
    const state: RenderState = { surfaceIsUrgent: true };
    const original = brandWithUrgentText.colors.text;
    headlineBrandFor(brandWithUrgentText, state);
    expect(brandWithUrgentText.colors.text).toBe(original);
  });
});
