'use client';

// ── لوحةُ المعاينة — الزجاجُ الأماميّ ─────────────────────────────
//
// **لماذا وُجدت:** بنينا شريطَ زمنٍ كاملاً بلا صورة. فتحها المالكُ
// فسأل: «أين الشاشة التي يظهر فيها الفيديو؟». وكان محقّاً — آلةُ
// قيادةٍ بلا زجاجٍ أماميّ.
//
// **ليست ميزةً جديدة.** المحرّك يُصدِّر `drawTimelineAt` — دالّةٌ خالصة
// تأخذ الخطَّ الزمنيَّ ولحظةً `t` وترسم الإطار على قماشة. فالمعاينةُ
// قماشةٌ تناديها عند زمن رأس القراءة، لا أكثر. تتحرّك القطعةُ فيتغيّر
// الإطار، لأنّ كلَيهما يقرأ `timeline` نفسَه.
//
// **الوصفةُ مأخوذةٌ من `/dev/pixel-eq`** لا مخترَعة — تلك الصفحةُ حلّت
// تشغيلَ المحرّك في المتصفّح قبلنا: حقنُ `@font-face` من نفس ملفّات
// الخطّ التي يحمّلها skia، ثمّ `document.fonts.load` قبل أيِّ
// `measureText` (ADR-006)، و`dpr = 1` حرفيّاً.
//
// **ADR-006 حرفيّاً:** لا رسمَ قبل جهوزيّة الخطّ. القياسُ بخطٍّ لم
// يُحمَّل يُنتج عرضاً كاذباً، فتُلَفُّ السطورُ خطأً — ولا يظهر العطبُ
// إلّا بعد أن تراه العينُ وتصدّقه.

import { useEffect, useRef, useState } from 'react';
import type { BrandKit, Timeline } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { REEL } from '@pf-mediakit/templates';
import {
  applyLocaleToBrand,
  buildTimelinePlan,
  drawTimelineAt,
  resolveBrand,
} from '@pf-mediakit/engine';

const SIZE = { w: 1080, h: 1920 } as const;

/** أوزانُ الخطّ الثلاثة من نفس المسار المسموح في `/api/fonts`. */
const FONT_FILES = {
  light: 'IBMPlexSansArabic-Light.ttf',
  regular: 'IBMPlexSansArabic-Regular.ttf',
  bold: 'IBMPlexSansArabic-Bold.ttf',
} as const;

export interface TimelinePreviewProps {
  readonly timeline: Timeline;
  readonly playheadSec: number;
  /** الهويّة — الافتراضيّة حين لا تُمرَّر. */
  readonly brand?: BrandKit;
  /** أقصى عرضٍ بالبكسل للعرض على الشاشة. القماشةُ تبقى 1080×1920. */
  readonly maxWidthPx?: number;
}

export function TimelinePreview({
  timeline,
  playheadSec,
  brand: brandProp,
  maxWidthPx = 270,
}: TimelinePreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandBase = brandProp ?? DEFAULT_BRAND;
  const family = brandBase.fonts.primary.family;

  // ── ١) الخطّ أوّلاً — لا رسمَ قبله (ADR-006) ────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = 'reels-preview-fontface';
        if (!document.getElementById(id)) {
          const style = document.createElement('style');
          style.id = id;
          style.textContent = `
@font-face{font-family:'${family}';src:url('/api/fonts/${FONT_FILES.regular}') format('truetype');font-weight:400;font-display:block}
@font-face{font-family:'${family}';src:url('/api/fonts/${FONT_FILES.bold}') format('truetype');font-weight:700;font-display:block}
@font-face{font-family:'${family}';src:url('/api/fonts/${FONT_FILES.light}') format('truetype');font-weight:300;font-display:block}`;
          document.head.appendChild(style);
        }
        await Promise.all([
          document.fonts.load(`80px "${family}"`),
          document.fonts.load(`bold 80px "${family}"`),
          document.fonts.load(`300 80px "${family}"`),
        ]);
        if (!cancelled) setFontsReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'font-load-failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [family]);

  // ── ٢) الرسم — عند كلّ تغيّرٍ في الخطّ الزمنيّ أو رأس القراءة ──
  useEffect(() => {
    if (!fontsReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // dpr = 1 حرفيّاً: بكسلُ CSS = بكسلُ الجهاز، كما في pixel-eq.
    canvas.width = SIZE.w;
    canvas.height = SIZE.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('no-2d-context');
      return;
    }

    try {
      const brand = resolveBrand(applyLocaleToBrand(brandBase, 'ar'));
      const content: Readonly<Record<string, unknown>> = { locale: 'ar' };

      // الخطّةُ تُبنى مرّةً لكلّ إطار هنا — مقبولٌ في المعاينة
      // (إطارٌ واحد لا ثلاثون في الثانية). إن ثقُلت، تُرفَع إلى
      // useMemo على `timeline` وحدَه؛ لا تُرفَع قبل قياسٍ يُثبت الثقل.
      const plan = buildTimelinePlan({
        ctx: ctx as Parameters<typeof buildTimelinePlan>[0]['ctx'],
        size: SIZE,
        timeline,
        brand,
        template: REEL,
        content,
      });

      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      drawTimelineAt({
        ctx: ctx as Parameters<typeof drawTimelineAt>[0]['ctx'],
        size: SIZE,
        timeline,
        brand,
        template: REEL,
        content,
        plan,
        t: playheadSec,
      });
      setError(null);
    } catch (e) {
      // **لا نبتلع الخطأ.** معاينةٌ تُظهر إطاراً قديماً بعد فشلِ الرسم
      // تكذب على العين — وهو العيبُ الذي منعناه في خطّ الالتصاق.
      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      setError(e instanceof Error ? e.message : 'draw-failed');
    }
  }, [fontsReady, timeline, playheadSec, brandBase]);

  return (
    <div
      data-testid="reels-preview"
      data-state={error ? 'error' : fontsReady ? 'ready' : 'loading'}
      className="flex flex-col items-center gap-2"
    >
      <canvas
        ref={canvasRef}
        data-testid="reels-preview-canvas"
        className="rounded-lg border border-border bg-surface-2 shadow-soft"
        style={{ width: maxWidthPx, height: (maxWidthPx * SIZE.h) / SIZE.w }}
      />
      {error ? (
        <p data-testid="reels-preview-error" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
