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

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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

/** يُصدَّر لصفحة dev: رياضيّاتُ السحب الرأسيّ تحتاجُ ارتفاعَ القماشة
 *  (تحويلِ dx/dy الفأرة إلى anchor وoffset) — الرقمُ من مالكِ القماشة
 *  لا نسخةً ثانية. */
export const PREVIEW_SIZE = SIZE;

// ── خريطةُ صناديقِ النصوص — للفحص الآليّ (469 §٣) ─────

/** صندوقُ قطعةِ نصٍّ على القماش — إحداثيّاتٌ شاملةً `offset.x/y` (مرآةُ
 *  ما يُرسَم فعلاً)، وزمنُ نشاطِها، وعلمُ خروجِها عن الكادر (471 §١:
 *  الخروجُ مسموحٌ لكن معلَنٌ — والبوّابةُ تمسكُ غيرَ المعلَم). */
export interface TextBoxEntry {
  readonly trackId: string;
  readonly itemId: string;
  readonly start: number;
  readonly end: number;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** أيُّ جزءٍ خارج [0,1080]×[0,1920]؟ — محسوبةٌ هنا لا في السكربت،
   *  فتصلحُ مؤشّراً حيّاً وبوّابةً معاً. */
  readonly outside: boolean;
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
    const dx = item.offset?.x ?? 0;
    const dy = item.offset?.y ?? 0;
    const left = bounds.left + dx;
    const right = bounds.right + dx;
    const top = bounds.top + dy;
    const bottom = bounds.bottom + dy;
    out.push({
      trackId: entry.trackId,
      itemId: entry.itemId,
      start: item.start,
      end: item.end,
      top,
      bottom,
      left,
      right,
      outside:
        left < 0 || right > SIZE.w || top < 0 || bottom > SIZE.h,
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
  /** (470 §٢) صندوقُ القطعةِ النصّيّةِ المحدَّدة — يُحيطُه إطارٌ عند
   *  التحويم وتُمسَكُ بالسحب. تُحدَّثُ قيمتُه أثناءَ السحب فتتبعه.
   *  (471 §١) خارجَ الكادر يغيّرُ لونَه تحذيراً. */
  readonly dragBox?: TextBoxEntry | null;
  /** عبارةٌ واحدةٌ تُعربُ أنّ جزءاً خارجَ الكادر — يمرّرها الأبُ من
   *  i18n؛ المكوّنُ حاضرٌ لا يعرفُ القواميس. */
  readonly outsideLabel?: string;
  /** الإمساكُ داخل الصندوق بدأ — التسجيلُ مرّةً عند الإفلات (عند الأب). */
  readonly onBoxDragStart?: () => void;
  /** إزاحةُ الفأرة بوحدات القماشة (بعد معاملِ التحويل) منذ الإمساك —
   *  ومعها Shift: الأبُ يحصرُ بها داخلَ الكادر (471 §١). */
  readonly onBoxDragMove?: (dxCanvas: number, dyCanvas: number, shiftKey: boolean) => void;
  /** الإفلاتُ بالإزاحةِ الكلّيّةِ بوحدات القماشة — يُسجَّلُ مرّةً واحدة،
   *  والـShift ممرَّرةٌ كآخرِ حركةٍ كي يطابقَ الالتزامُ الإفلاتَ. */
  readonly onBoxDragEnd?: (dxCanvas: number, dyCanvas: number, shiftKey: boolean) => void;
}

export function TimelinePreview({
  timeline,
  playheadSec,
  brand: brandProp,
  maxWidthPx = 270,
  onTextLayout,
  dragBox,
  outsideLabel,
  onBoxDragStart,
  onBoxDragMove,
  onBoxDragEnd,
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

  // ── ٣) السحبُ على القماشة (470 §٢) — إصابةٌ بمعاملِ التحويل ──
  // القماشةُ معروضةٌ مصغَّرةً (maxWidthPx ≠ 1080): إحداثيّاتُ الفأرة
  // تُضربُ في 1080/العرض-المعروض قبل أيّ مقارنةٍ أو إزاحة — وإلّا سار
  // النصُّ أسرعَ من المؤشّر. هندسةُ الإمساك تُثبَّتُ لحظةَ الضغط.
  const boxDragRef = useRef<{ startX: number; startY: number; scaleX: number; scaleY: number } | null>(null);
  const [boxDragging, setBoxDragging] = useState(false);
  const [boxHover, setBoxHover] = useState(false);

  const canvasToPointer = (e: ReactMouseEvent<HTMLCanvasElement>): { cx: number; cy: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SIZE.w / rect.width;
    const scaleY = SIZE.h / rect.height;
    return {
      cx: (e.clientX - rect.left) * scaleX,
      cy: (e.clientY - rect.top) * scaleY,
    };
  };

  const insideBox = (cx: number, cy: number): boolean =>
    dragBox !== null &&
    dragBox !== undefined &&
    cx >= dragBox.left &&
    cx <= dragBox.right &&
    cy >= dragBox.top &&
    cy <= dragBox.bottom;

  const onCanvasMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>): void => {
    if (!dragBox || !onBoxDragStart) return;
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { cx, cy } = canvasToPointer(e);
    if (!insideBox(cx, cy)) return;
    e.preventDefault();
    boxDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scaleX: SIZE.w / rect.width,
      scaleY: SIZE.h / rect.height,
    };
    setBoxDragging(true);
    onBoxDragStart();
  };

  const onCanvasMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>): void => {
    if (boxDragging) return;
    const { cx, cy } = canvasToPointer(e);
    setBoxHover(insideBox(cx, cy));
  };

  useEffect(() => {
    if (!boxDragging) return;
    document.body.style.cursor = 'grabbing';
    const onMove = (ev: MouseEvent): void => {
      const g = boxDragRef.current;
      if (!g) return;
      onBoxDragMove?.(
        (ev.clientX - g.startX) * g.scaleX,
        (ev.clientY - g.startY) * g.scaleY,
        ev.shiftKey,
      );
    };
    const onUp = (ev: MouseEvent): void => {
      const g = boxDragRef.current;
      boxDragRef.current = null;
      setBoxDragging(false);
      document.body.style.cursor = '';
      if (!g) return;
      onBoxDragEnd?.(
        (ev.clientX - g.startX) * g.scaleX,
        (ev.clientY - g.startY) * g.scaleY,
        ev.shiftKey,
      );
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  }, [boxDragging, onBoxDragEnd, onBoxDragMove]);

  return (
    <div
      data-testid="reels-preview"
      data-state={error ? 'error' : fontsReady ? 'ready' : 'loading'}
      className="flex flex-col items-center gap-2"
    >
{/* dir=ltr: فضاءُ القماشة فيزيائيٌّ لا يتّجاه — إحداثيّاتُه من
          اليسار، فالخصائصُ المنطقيّةُ تحلُّ يساراً داخلَه بلا انعكاس. */}
      <div dir="ltr" className="relative">
        <canvas
          ref={canvasRef}
          data-testid="reels-preview-canvas"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          className="rounded-lg border border-border bg-surface-2 shadow-soft"
          style={{
            width: maxWidthPx,
            height: (maxWidthPx * SIZE.h) / SIZE.w,
            cursor: boxDragging ? 'grabbing' : boxHover && dragBox ? 'grab' : undefined,
          }}
        />
        {/* إطارُ التحويم (470 §٢ · 471 §١): ما سيُمسَك — يتبعُ الصندوقَ
            الحيَّ أثناء السحب، **مقصوصاً حسابيّاً عند حدودِ القماشة**
            (تذكرة 471: "أو قصٌّ حسابيّ") — إطارٌ يطفو خارجَ الكادرِ
            يكذبُ على العين، والقصُّ الحسابيُّ يجعلُ مستطيلَ الـDOM نفسِه
            داخلَ الحدودِ فيصلحَ إثباتاً هندسيّاً. خارجٌ كليّاً ⇒ لا إطار. */}
        {dragBox && (boxHover || boxDragging)
          ? (() => {
              const visLeft = Math.max(dragBox.left, 0);
              const visRight = Math.min(dragBox.right, SIZE.w);
              const visTop = Math.max(dragBox.top, 0);
              const visBottom = Math.min(dragBox.bottom, SIZE.h);
              if (visRight <= visLeft || visBottom <= visTop) return null;
              const scale = maxWidthPx / SIZE.w;
              return (
                <div
                  aria-hidden
                  data-testid="reels-preview-box-outline"
                  className={`pointer-events-none absolute z-10 border-2 ${
                    dragBox.outside ? 'border-warning' : 'border-accent'
                  }`}
                  style={{
                    insetInlineStart: `${visLeft * scale}px`,
                    insetBlockStart: `${visTop * scale}px`,
                    inlineSize: `${(visRight - visLeft) * scale}px`,
                    blockSize: `${(visBottom - visTop) * scale}px`,
                  }}
                />
              );
            })()
          : null}
      </div>
      {/* مؤشّرُ التجاوز (471 §١): عبارةٌ واحدةٌ تُخبرُ أنّ جزءاً خارجَ
          الكادر — تظهرُ ما دامَ المحدَّدُ خارجَه، سحباً كان أو حقولاً. */}
      {dragBox?.outside ? (
        <p
          data-testid="reels-preview-overflow"
          className="text-xs text-warning"
        >
          {outsideLabel}
        </p>
      ) : null}
      {error ? (
        <p data-testid="reels-preview-error" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
