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

// **(469 §٣) نافذةُ القياس:** بعد كلّ إطارٍ تُصدَّر خريطةُ صناديقِ النصوص
// من الخطّة (`prep.bounds` + `offset.y` — الصيغةُ نفسُها التي يحسبُ بها
// المحرّكُ تصادماته) عبر `onTextLayout`. مقياسٌ يقيسُ الصحّةَ لا الوجود:
// تراكبُ صندوقَين رأسيّاً لقطعتَين متداخلتَين زمنيّاً فشلٌ صريحٌ يُمسَك
// بلا عين — ما اجتاز «البصمةُ تغيّرت» في 468 كان خربشةً فوق بعضها.

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

// ── خريطةُ صناديقِ النصوص — للفحص الآليّ (469 §٣) ─────

/** صندوقُ قطعةِ نصٍّ على القماش — إحداثيّاتُ رأسيّةٌ شاملةً `offset.y`،
 *  وزمنُ نشاطِها. الصيغةُ مرآةُ `detectCollisions` في المحرّك. */
export interface TextBoxEntry {
  readonly trackId: string;
  readonly itemId: string;
  readonly start: number;
  readonly end: number;
  readonly top: number;
  readonly bottom: number;
}

/** نتيجةُ إطارٍ واحد: الصناديقُ كلُّها + أزواجُ التصادم كما حسبَها
 *  المحرّك (تداخلٌ زمانيٌّ ومكانيٌّ معاً). */
export interface TextLayoutInfo {
  readonly boxes: readonly TextBoxEntry[];
  readonly collisionPairs: readonly string[];
}

/** يستخرج صناديقَ النصوص من الخطّة — bounds + offset.y، كما يمسكُها
 *  كاشفُ التصادم في المحرّك حرفيّاً (لا منطقَ موازياً هنا). */
const collectTextBoxes = (
  timeline: Timeline,
  plan: ReturnType<typeof buildTimelinePlan>,
): readonly TextBoxEntry[] => {
  const out: TextBoxEntry[] = [];
  for (const entry of Array.from(plan.textPreps.values())) {
    const bounds = entry.prep.bounds;
    const item = timeline.tracks
      .find((tr) => tr.id === entry.trackId)
      ?.items.find((i) => i.id === entry.itemId);
    if (!bounds || !item) continue;
    const dy = item.offset?.y ?? 0;
    out.push({
      trackId: entry.trackId,
      itemId: entry.itemId,
      start: item.start,
      end: item.end,
      top: bounds.top + dy,
      bottom: bounds.bottom + dy,
    });
  }
  return out;
};

/** صورةُ مكانٍ لكلّ مفتاح أصلٍ في مسارات الوسائط — قماشةٌ خارج الشاشة
 *  بتدرّجٍ من زوجِ `placeholder` في ألوان الهويّة (464: لا تنزيلَ ولا
 *  ملفّاً ثنائيّاً في المستودع؛ ImageLike هي {width, height} والقماشةُ
 *  تحملُهما وتصلحُ للرسم). */
const buildPlaceholderImages = (
  timeline: Timeline,
  brand: ReturnType<typeof resolveBrand>,
): Record<string, HTMLCanvasElement> => {
  const images: Record<string, HTMLCanvasElement> = {};
  for (const track of timeline.tracks) {
    if (track.type !== 'media') continue;
    for (const item of track.items) {
      const key = item.src;
      if (!key || key in images) continue;
      const c = document.createElement('canvas');
      c.width = SIZE.w;
      c.height = SIZE.h;
      const g = c.getContext('2d');
      if (!g) continue;
      const grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, brand.colors.placeholder[0]);
      grad.addColorStop(1, brand.colors.placeholder[1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      images[key] = c;
    }
  }
  return images;
};

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
  /** يُستدعى بعد كلّ إطارٍ بخريطةِ صناديقِ النصوص (469 §٣) — للفحص
   *  الآليّ. مستدعٍ مستقرُّ الهويّة (useCallback بلا أسرِبة) كي لا
   *  يعادَ الرسمُ من أجله. */
  readonly onTextLayout?: (info: TextLayoutInfo) => void;
}

export function TimelinePreview({
  timeline,
  playheadSec,
  brand: brandProp,
  maxWidthPx = 270,
  onTextLayout,
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
      // (464) العنوانُ العربيُّ لطبقةِ headline في قالب REEL —
      // حقلُها field: 'title'، والقيمةُ من اختراع هذه المعاينة.
      const content: Readonly<Record<string, unknown>> = {
        locale: 'ar',
        title: 'حكايةُ اليومِ في ستّينَ ثانيةً',
      };
      // (464) draw-media يقرأُ صورتَه من assets.images[assetKey] —
      // مفاتيحُها مفاتيحُ src في العيّنة نفسُها.
      const assets = { images: buildPlaceholderImages(timeline, brand) };

      // الخطّةُ تُبنى مرّةً لكلّ إطار هنا — مقبولٌ في المعاينة
      // (إطارٌ واحد لا ثلاثون في الثانية). إن ثقُلت، تُرفَع إلى
      // useMemo على `timeline` وحدَه؛ لا تُرفَع قبل قياسٍ يُثبت الثقل.
      const plan = buildTimelinePlan({
        ctx: ctx as Parameters<typeof buildTimelinePlan>[0]['ctx'],
        size: SIZE,
        timeline,
        brand,
        template: REEL,
        assets,
      });

      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      drawTimelineAt({
        ctx: ctx as Parameters<typeof drawTimelineAt>[0]['ctx'],
        size: SIZE,
        timeline,
        brand,
        template: REEL,
        content,
        assets,
        plan,
        t: playheadSec,
      });
      // (469 §٣) نافذةُ القياس: الصناديقُ من الخطّة نفسِها + أزواجُ
      // تصادم المحرّك — بلا منطقٍ موازٍ، وبعدَ نجاحِ الرسم لا قبله.
      onTextLayout?.({
        boxes: collectTextBoxes(timeline, plan),
        collisionPairs: plan.collisions.map(
          (c) => `${c.a.trackId}:${c.a.itemId}×${c.b.trackId}:${c.b.itemId}`,
        ),
      });
      setError(null);
    } catch (e) {
      // **لا نبتلع الخطأ.** معاينةٌ تُظهر إطاراً قديماً بعد فشلِ الرسم
      // تكذب على العين — وهو العيبُ الذي منعناه في خطّ الالتصاق.
      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      setError(e instanceof Error ? e.message : 'draw-failed');
    }
  }, [fontsReady, timeline, playheadSec, brandBase, onTextLayout]);

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
