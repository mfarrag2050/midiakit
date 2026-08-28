// DEFAULT_BRAND — الهوية الافتراضية المحايدة تماماً.
// المرجع: docs/03-brand-kit-spec.md §«الهوية الافتراضية».
//
// الغرض: يعمل المنتج من أول ثانية قبل رفع العميل أي شيء.
// اختبار صحة الفصل: إن احتاج المحرك قيمة من هوية معيّنة لكي يعمل،
// فالفصل لم يكتمل.
//
// قيود التصميم:
//   • ألوان رمادية بدرجات متمايزة (لا مطابقة لأي هوية عميل).
//   • خط مفتوح: IBM Plex Sans Arabic — عبر Google Fonts أو Local.
//   • لا شعار (url فارغ) — حراسات الرسم تتخطاه.
//   • كل الأبعاد والحركة مساوية لقيم المواصفة (المرحلة 0 نقلتها من الأصل
//     كقيم عامّة، ليست ملكاً لهوية بعينها).
//
// **تستورده الاختبارات مباشرة.** لا نسخة اختبار موازية.

import type { BrandKit } from './brand-kit.js';

export const DEFAULT_BRAND: BrandKit = {
  id: 'default',
  name: 'Default',
  version: 1,
  direction: 'rtl',
  locale: 'ar',
  fonts: {
    primary: {
      family: 'IBM Plex Sans Arabic',
      source: 'builtin',
      licenseAck: true,
      weights: {
        light: { url: '', value: 300 },
        regular: { url: '', value: 400 },
        bold: { url: '', value: 700 },
      },
    },
    fallback: 'sans-serif',
    capabilities: {
      kashida: false,
      kashidaMethod: 'tatweel',
      variableAxes: [],
      diacriticsSafe: true,
    },
  },
  colors: {
    text: '#F5F5F5',
    accent: '#B8B8B8',
    urgentBadge: '#404040',
    urgentBg: '#333333',
    urgentBgTint: '#2A2A2A',
    locationBadge: '#4A4A4A',
    surface: '#1A1A1A',
    placeholder: ['#3A3A3A', '#1A1A1A'],
  },
  logo: {
    url: '',
    size: 63,
    margin: 51,
    position: 'bottom-left',
    watermark: {
      enabled: false,
      scale: 0.95,
      offsetX: -0.12,
      opacity: 0.55,
      tint: 'colors.urgentBgTint',
    },
  },
  typography: {
    headline: { max: 96, min: 40, lineHeight: 1.34, boxWidth: 880 },
    breaking: {
      max: 80,
      min: 44,
      lineHeight: 1.42,
      boxWidth: 900,
      shortLineRatio: 0.6,
      maxLines: 6,
      wrapMode: 'optimal',
    },
    kicker: { max: 60, min: 28, weight: 300, boxWidth: 760, gapBelow: 56 },
    title3l: { max: 84, min: 40 },
    source: { size: 34, weight: 700 },
    reelTitle: {
      max: 76,
      min: 40,
      maxLines: 4,
      boxInset: 150,
      verticalAnchor: 0.66,
    },
    accentBar: { height: 8, minWidth: 140, maxWidth: 620 },
    lineHeightMode: 'dynamic',
    justify: {
      mode: 'space',
      maxStretchPerSite: 0.35,
      maxSitesPerWord: 1,
      minLineFill: 0.82,
      lastLine: 'natural',
    },
    semanticBreaks: { enabled: false, useModel: 'never' },
    diacritics: { enabled: false, mode: 'full' },
    bidi: { enabled: true, numerals: 'latin' },
  },
  badges: {
    urgent: {
      label: 'عاجل',
      fontSize: 48,
      height: 66,
      paddingX: 28,
      radius: 12,
      fill: 'colors.urgentBadge',
      textColor: 'colors.text',
    },
    location: {
      fontSize: 36,
      height: 58,
      paddingX: 22,
      radius: 8,
      fill: 'colors.locationBadge',
      textColor: 'colors.text',
      margin: { x: 60, y: 60 },
      anchor: 'top-right',
    },
  },
  gradient: {
    defaultOpacity: 0.72,
    defaultReach: 0.9,
    shape: [
      [0, 1],
      [0.2, 0.98],
      [0.4, 0.82],
      [0.6, 0.48],
      [0.8, 0.06],
      [0.92, 0],
    ],
    band: [
      [0, 0.08],
      [0.2, 0.5],
      [0.36, 0.92],
      [0.5, 1.0],
      [0.64, 0.92],
      [0.8, 0.5],
      [1, 0.08],
    ],
  },
  shadows: {
    reelTitle: { color: 'rgba(20,30,68,0.62)', blur: 24, offsetY: 2 },
  },
  margins: {
    contentRight: 71,
    breakingBaseline: 200,
    sourceBaseline: 135,
    badgeGap: 28,
    cardTopPortrait: 150,
    cardBottomS01: 350,
  },
  motion: {
    segmentMin: 7,
    segmentMax: 10,
    segmentWordBase: 8,
    segmentWordStep: 0.3,
    crossfade: 0.6,
    reelCrossfade: 0.5,
    titleFadeIn: 0.45,
    titleFadeOut: 0.5,
    badgeDelay: 0.25,
    badgeFade: 0.45,
    lineStagger: 0.12,
    lineFade: 0.42,
    outro: 0.5,
    badgePulse: 0.05,
  },
  outputs: {
    x: { w: 1080, h: 1080 },
    instagram: { w: 1080, h: 1440 },
    feed: { w: 1080, h: 1350 },
    reel: { w: 1080, h: 1920 },
  },
  audio: [],
};
