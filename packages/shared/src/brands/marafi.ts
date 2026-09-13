// MARAFI_BRAND — هويّة عرضٍ مُختلَقة (300-DEMO-IDENTITY).
//
// **لا تُغلق خانة «عيّنة حيّة بهويّة العميل الأوّل»** — تلك تحتاج هويّة
// محمد الحقيقيّة. ما تفتحه هذه: **العمل على الحصن (الكشيدة والكسر الدلاليّ
// والتشكيل) على نصٍّ حقيقيّ الشكل بدل «اختبار»**.
//
// ── قيد لا يُخرَق ───────────────────────────────────
// **بجانب `DEFAULT_BRAND` لا فوقها.** كلاهما يمرّ عبر نفس المحرّك. إن
// اضطرّ المحرّك لقيمةٍ من هذه لكي يعمل، فالفصل لم يكتمل.
//
// ── الاسم ──────────────────────────────────────────
// «مَرافئ» — مُختلَق · وفيه «ئ» (همزة على ياء) · حالة رسمٍ في كلّ لقطة.
//
// ── قرار تحريريّ ───────────────────────────────────
// الأحمر (`#B3261E`) **محجوزٌ لـ«عاجل» وحده**. إن وجدتَ الأحمر في أيّ
// عنصرٍ آخر فذلك عطب.

import type { BrandKit } from '../brand-kit.js';

// ── اللوحة (300 §٢) ────────────────────────────────
const INK      = '#0E1A24'; // حبرٌ داكن · ليس أسود خالصاً (98% أسود = stub · L من 490)
const SURFACE  = '#F4F1EA'; // ورقٌ دافئ · الحرف العربيّ يجلس عليه أفضل
const ACCENT   = '#C8622D'; // طينيّ محروق · يفترق عن الأحمر
const URGENT   = '#B3261E'; // محجوز لـ«عاجل» وحده
const MUTED    = '#6B7A83'; // المصدر والتاريخ

export const MARAFI_BRAND: BrandKit = {
  id: 'marafi',
  name: 'مَرافئ للإنتاج الرقميّ',
  version: 1,
  direction: 'rtl',
  locale: 'ar',
  fonts: {
    primary: {
      family: 'IBM Plex Sans Arabic',
      source: 'builtin',
      licenseAck: true,
      // نفس القيم المقيسة من BASELINE-A · الخطّ نفسه (لا خطّ جديد بحسب §٣).
      weights: {
        light:   { url: '', value: 300, metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 } },
        regular: { url: '', value: 400, metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 } },
        bold:    { url: '', value: 700, metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 } },
      },
    },
    fallback: 'sans-serif',
    capabilities: {
      kashida: true,
      kashidaMethod: 'tatweel',
      variableAxes: [],
      diacriticsSafe: true,
    },
  },
  colors: {
    text: INK,
    accent: ACCENT,
    urgentBadge: URGENT,
    urgentBg: URGENT,
    urgentBgTint: URGENT,
    locationBadge: MUTED,
    surface: SURFACE,
    // placeholder ورقيّ دافئ (متدرّج داخل السطح · لا رماديّ محايد)
    placeholder: [SURFACE, '#E8E3D8'],
  },
  logo: {
    // ملفّ SVG أصليّ · packages/shared/src/brands/marafi-logo.svg
    // (يُحمَّل عند التوصيل الفعليّ · العلامة موصوفة هندسيّاً في §٤).
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
      shortLineRatio: 1.0,
      maxLines: 6,
      minLines: 2,
      preferredLines: 3,
      readableMinRatio: 0.045,
      targetFill: 0.9,
      wrapMode: 'uniform',
      headlineFsRatio: [0.065, 0.085],
      boxWidthRange: [0.72, 0.88],
    },
    kicker: { max: 60, min: 28, weight: 300, boxWidth: 760, gapBelow: 56 },
    title3l: { max: 84, min: 40, minLines: 1, preferredLines: 2 },
    source: { size: 34, weight: 300 }, // §٣ · المصدر light 300
    reelTitle: {
      max: 76,
      min: 40,
      maxLines: 4,
      boxInset: 150,
      verticalAnchor: 0.66,
      lineHeight: 1.36,
      boxWidth: 780,
      shortLineRatio: 0.6,
      minLines: 1,
      preferredLines: 2,
      readableMinRatio: 0.045,
      headlineFsRatio: [0.055, 0.075],
      boxWidthRange: [0.68, 0.86],
    },
    accentBar: { height: 8, minWidth: 140, maxWidth: 620 },
    lineHeightMode: 'fixed',
    justify: {
      mode: 'kashida',
      maxStretchPerSite: 0.35,
      maxSitesPerWord: 1,
      minLineFill: 0.82,
      lastLine: 'natural',
    },
    semanticBreaks: { enabled: true, useModel: 'never' },
    diacritics: { enabled: false, mode: 'full' },
    bidi: { enabled: true, numerals: 'latin' },
    caption: {
      max: 68, min: 36, lineHeight: 1.28, boxWidth: 900,
      maxLines: 2, minLines: 1, preferredLines: 2,
      readableMinRatio: 0.038,
      headlineFsRatio: [0.045, 0.060],
      boxWidthRange: [0.70, 0.88],
      highlightMode: 'wordColor',
      pastOpacity: 1.0,
      futureOpacity: 0.55,
      futureWordOpacity: 0.55,
    },
  },
  badges: {
    urgent: {
      label: 'عاجل',
      fontSize: 48,
      height: 66,
      paddingX: 28,
      radius: 12,
      fill: URGENT,
      textColor: SURFACE, // ورقٌ فاتح على أحمر — تباين عالٍ
    },
    location: {
      fontSize: 36,
      height: 58,
      paddingX: 22,
      radius: 8,
      fill: MUTED,
      textColor: SURFACE, // فاتح على muted — قابل للقراءة
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
    reelTitle: { color: 'rgba(14,26,36,0.35)', blur: 24, offsetY: 2 },
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
  placement: {
    logo:        { anchor: 'bottom-left',   offset: { x: 51, y: 51 } },
    badge:       { anchor: 'top-right',     offset: { x: 60, y: 60 } },
    attribution: { anchor: 'bottom-right',  offset: { x: 60, y: 60 } },
    source:      { anchor: 'bottom-right',  offset: { x: 60, y: 135 }, align: 'left' },
    caption:     { anchor: 'bottom-center', offset: { x: 0, y: 180 } },
  },
  attribution: {
    logoMode: 'none',
    platformNameStyle: 'ar',
    separator: ' · ',
    iconSize: 48,
    logoAcks: {
      tiktok:    { licenseAck: false, ackBy: '', ackAt: '' },
      x:         { licenseAck: false, ackBy: '', ackAt: '' },
      instagram: { licenseAck: false, ackBy: '', ackAt: '' },
      youtube:   { licenseAck: false, ackBy: '', ackAt: '' },
      telegram:  { licenseAck: false, ackBy: '', ackAt: '' },
      facebook:  { licenseAck: false, ackBy: '', ackAt: '' },
    },
  },
};
