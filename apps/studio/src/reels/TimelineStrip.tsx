'use client';

// TimelineStrip — شريط الخطّ الزمني (reels/453 → 454 → 456 → 458 → 461).
//
// **453:** مسارٌ واحد لكل Track بترتيب index (0 أسفل/خلف)، وكتلةٌ واحدة
// لكل TrackItem بعرضٍ متناسب مع (end − start) وموضعٍ بحسب start مقابل
// timeline.duration، ورأسُ قراءةٍ عند playheadSec.
//
// **454 · التحرير فوق الطبقة (أ):** السحب والقصّ — حتى 461 — كانا
// على الخامتين من `timeline-ops` حرفيّاً — **لا حساب حدودٍ ولا قصٍّ
// حساب حدودٍ ولا قصٍّ موازٍ هنا إطلاقاً**. أثناء السحب تُعرض معاينةٌ
// حيّة (شبح) محسوبة بالعمليّات نفسها على لقطة الخطّ الزمني لحظة
// الإمساك، ولا يُثبّت التغيير إلا عند الإفلات عبر `onTimelineChange`.
// التراجع والإعادة والشطر والحذف عند الأب (صفحة التطوير) — الشريط
// لا يعرف History.
//
// **461 · الآمنُ بدل الخام:** مسارُ السحب صار على `moveItemSafe` و
// `trimItemSafe` من `timeline-snap` — الجارُ أسبقُ من الحافّة ولا
// تراكبَ في المسار الواحد. قبل كلّ نداءٍ التصاقٌ بـ`snapTime` بعتبةٍ
// **بالبكسل** (SNAP_PX) لا بالثانية، ورأسُ القراءة مرساةٌ. `Alt`
// أثناء السحب يُطفئ الالتصاقَ — اصطلاحُ محرّرات المونتاج، بلا مفتاح
// ترجمة. وحين يُغيّر الالتصاقُ القيمةَ فعلاً: خطٌّ رأسيٌّ رفيعٌ عند
// المرساة (لونُه لون ring-accent — bg-accent) لا يظهرُ إلا أثناءَ
// السحب، ولا يُرسمُ إن لم تستقرَّ القطعةُ على المرساةِ فعلاً بعد
// أسوار الجيران.
//
// **454 · البصر:** القطعة تُميَّز من الصفّ: تعبئةٌ ملوّنة خفيفة بلون
// نوع المسار وحدٌّ ملوّن كامل، والصفُّ بحدٍّ أخفق (border-border 8%)
// وتعبئة باهتة. الألوان كلها من رموز النظام عبر color-mix — لا قيم
// مثبتة. **ملاحظة Tailwind:** أصناف `token/NN` لا تُولَّد مع ألوان
// `var(--…)` في Tailwind 3 (تحقّقنا في layout.css المُجمَّع) — لذلك
// التعبئات الشفافة عبر color-mix في style لا عبر أصناف.
//
// **454/456 · الأرقام:** المسطرة تُنسَّق عبر `formatNumber` مع
// `useDigitStyle` — مسار الأرقام الوحيد في المشروع (settings.ts)،
// لا تنسيق مختلق.
//
// **RTL:** الزمن يبدأ من الحافة اليُمنى ويتقدّم يساراً — dir="rtl"
// مثبَّت على الجذر عمداً. الحافّة اليُمنى (inset-inline-start) هي
// `start`. كلّ المواضع خصائص منطقية. استثناء وحيد موثَّق:
// translateX(50%) لتوسيط أرقام المسطرة — لا مقابل منطقيّاً في CSS
// والسلوك حتميٌّ تحت dir=rtl الثابت.
//
// **أحداث ماوس لا Pointer:** CDP (puppeteer) يضخّ mouse events عبر
// قناة الإدخال نفسها — أحداث الموس مضمونةٌ في لقطات cdp-reels.
//
// **456 · الأسماء:** كلُّ رمزٍ مرئيٍّ يحمل اسمَه من مفتاح i18n: الجذر
// «الخطّ الزمنيّ» · الصفُّ «المسار — وسائط» · القطعة «القطعة clip-01» ·
// المسطرة ورأس القراءة — عبر `useLocale`، مع `title` للتمرير. اسم نوع
// المسار في عمود التسميات مُترجَمٌ (لا `media` لاتينيّةً في الواجهة
// العربيّة). **إخفاء النصّ تحت أرضية القراءة:** القطعةُ أضيقُ من
// أرضية القراءة لا ترسم بادئةً مزدحمة — يبقى الاسمُ كاملاً في
// `title` و`aria-label`.
//
// **458 · الزوم والتمرير — الهندسة:**
// - `zoom` مضاعفٌ نسبةً إلى «الملاءمة» (fit = عرضُ المدّة كلّها في
//   عرض المستطلع): pxPerSec = (viewportW / duration) × zoom، بحدَّين
//   1 (الملاءمة — ما دونها فراغٌ بلا معنى) وZOOM_MAX = 16 (1 إطار =
//   ≈9px عند 30fps على عيّنة 32ث — ما بعده تضخيمٌ بلا دقّةٍ إضافيّة).
// - **موضعٌ بالبكسل لا بالنسبة:** عند زومٍ ×N عرضُ قطعةٍ مدّتُها D
//   يساوي حرفيّاً D × pxPerSec — قابلٌ للقياس من الـDOM (هكذا أثبته
//   cdp-reels). النسبة المئويّة ظلَّت ممكنةً لكنّ البكسلَ هو عقد
//   الزوم الصريح.
// - **مستطلعٌ واحد يلفّ المسطرة والمسارات معاً** (overflow-x-auto،
//   dir=rtl موروث) — المسطرة تتمرّر مع المسارات بلا انفصال، والصفرُ
//   عند الحافة اليُمنى للمحتوى دائماً. المتصفّحات الحديثة تبدأ تصفّح
//   RTL عند inline-start (اليمين) — هو المطلوبُ حرفيّاً.
// - **التمحور حول رأس القراءة:** قبل كلّ تغييرٍ للمقياس نُسجّل موضع
//   رأس القراءة داخل المستطلع (قياسُ حروف getBoundingClientRect — لا
//   دلالةً على إشارة scrollLeft التي تختلف بين المتصفّحات في RTL)،
//   وبعد الرسم (useLayoutEffect) نصحّح التمرير بـscrollBy بالفرق
//   الفيزيائيّ — فلا يضيع موضعُك كلّما قرّبت.
// - **العجلة وحدها تمرير، ومع ⌘ تقرِّب.** المستمع يُركَّب يدويّاً
//   بـ{ passive: false } — React يسجّل wheel علّةً سلبيّةً فلا ينفع
//   preventDefault داخله. تمريرٌ عموديٌّ يُترجم تقدّماً في الزمن
//   (δ↓ ⇒ d يزداد — دلالةً ثابتةً في RTL كما في LTR: عجلةٌ لأسفل =
//   لاحقاً). ومسارٌ أفقيٌّ (trackpad deltaX) يمرّ كما هو — لا قلبَ
//   للاتّجاه. حين يتّسع المحتوىُ في العرض لا نستولي على العجلة —
//   لتُمرِّر الصفحةَ كما تعوّد المستخدم.
// - **كثافة المسطرة تتبع الزوم:** الخطوةُ أصغرُ خطوةٍ «جميلة» من
//   RULER_STEPS تُرضي MIN_LABEL_PX بكسلاً بين تسميتَي كبرى متجاورتين
//   (اشتقاقها: 5 أحرفٍ ui-monospace عند 12px ≈ 7.2px للحرف ≈ 36px
//   أوسعُ تسميةٍ واقعيّة، + 20px تنفّساً = 56px — لا ازدحامَ أبداً).
//   عند الملاءمة على عيّنة 32ث ⇒ 5ث (مطابقٌ لسلوك 456 حرفياً)،
//   وكلّما قرّبت تنزل إلى 2 · 1 · 0.5. التحريكُ بلوحة المفاتيح
//   يبقى على كمّيّات `labelStepFor` (المدّة كلّها) — الزومُ لا يغيّر
//   معنى الأسهم، وهذه سكربتات cdp-reels تتحقّق منها عند الملاءمة.
// - **إصلاحُ إرساء التسميات (اكتشافه في 458، موجودٌ منذ 453):**
//   `dir="ltr"` على الشريحة كان يقلب جهةَ حلِّ `inset-inline-start`
//   إلى اليسار بينما العلامات تُقاس من اليمين — فكانت كلُّ تسميةٍ
//   معكوسةً عن علامتها (تسميةُ الصفر أقصى اليسار!). الأرقامُ (لاتينيّة
//   أو عربيّة-هندية) تسيرَات bidi آمنةٌ بلا عزل dir، فأُزيل. وتسميةُ
//   الصفر وحدها لا تُوسَّط (بلا translateX) كي تجلس كاملةً داخل الحافة
//   اليُمنى — التوسيطُ كان سيقتطع نصفَها خارج المحتوى.
// - **أرضية قراءة بطاقة القطعة (تعديل 456):** صارت 8٪ من عرض
//   المستطلع لا من عرض الممرّ — عند الملاءمة هما واحدٌ (الممرّ =
//   المستطلع)، وعند التقريب يعود الاسمُ إلى القطعةِ الضيقةِ زمنياً
//   متّسعَها الفيزيائيّ (L-02: النسبة من العرض المرئيّ لا رقمٌ مطلق).
// - زرّا «+» و«−» معلنان: كلمةٌ من i18n + اختصارٌ في
//   aria-keyshortcuts ورمز ⌘ مقيسٌ في شريحةٍ معزولةٍ بـ`Ltr`.
//
// **456 · التحريك:** أزرار القطع تعلن `aria-keyshortcuts` للأسهم
// والقوسين — المنطقُ نفسه في صفحة التطوير عبر عمليّات الطبقة (أ) نفسها.
// لا كلمات حرفيّة في JSX — المعرّفات بيانات، والرموز مفردة.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { Timeline, TrackType } from '@pf-mediakit/shared';
import { useLocale, Ltr } from '@pf-mediakit/i18n';
import { useDigitStyle } from '@/src/format/settings';
import { formatNumber } from '@/src/format/digits';
import { moveItemSafe, snapTime, trimItemSafe } from './timeline-snap';

export interface TimelineStripProps {
  readonly timeline: Timeline;
  readonly playheadSec: number;
  readonly selectedItemId?: string;
  readonly onSelectItem?: (trackId: string, itemId: string) => void;
  /** يُستدعى عند الإفلات بالخطّ الزمني الجديد (المعاينة النهائية). */
  readonly onTimelineChange?: (next: Timeline) => void;
}

// ── هندسة الشريط ───────────────────────────────────────

const RULER_BLOCK = 20;
const LANE_BLOCK = 44;
const ROW_GAP = 4;
const EDGE_HANDLE = 6;

/** شريط أزرار الزوم: 28px زرّ + 4px هامشٌ سفليّ — يوازيه فارغُ
 *  عمود التسميات حتى تبقى المساراتُ المصفوفة على خطٍّ واحد. */
const ZOOM_BAR_BLOCK = 32;

/** خطوات المسطرة «الجميلة» — نفس سلّم 456؛ الاختيار صار بحسب الزوم. */
const RULER_STEPS: readonly number[] = [0.5, 1, 2, 5, 10, 15, 30, 60];

/** حدٌّ أدنى بين تسميتَي كبرى متجاورتين (بكسل) — منعه للازدحام.
 *  الاشتقاق في رأس الملف: ≤5 أحرف monospace عند 12px ≈ 36px + تنفّس. */
const MIN_LABEL_PX = 56;

/** مضاعف الزوم الأقصى نسبةً إلى الملاءمة (fit). عند 16× و30fps:
 *  الإطار ≈ 9px — دقّةٌ تكفي القصّ، وما فوقها تضخيمٌ بلا فائدة. */
const ZOOM_MAX = 16;

/** فائضُ التمرير المهمل (بكسل): دونَه يُعدُّ المحتوى «يسع العرض» فلا
 *  تُستولى العجلةُ عن التمرير. اشتقاقه: نصفُ أوسعِ تسميةٍ ممكنةٍ
 *  (≈4px) قد تتجاوز حافةَ المحتوى الأخيرة عند توسيطها على علامتها،
 *  مع هامشِ تقريبِ بكسل — ليس محتوىً يُمرَّر إليه أحد. */
const SCROLL_SLACK_PX = 8;

/** خطوة الزومّين (الأزرار ولوحة المفاتيح): ×2 / ÷2 — قوى اثنين
 *  فتقع على ZOOM_MAX بالضبط: 1 · 2 · 4 · 8 · 16. */
const ZOOM_STEP = 2;

/** ⌘+عجلة: عاملٌ أُسّيٌّ ناعم — exp(−δ × 0.002): درجةُ عجلةٍ (±100)
 *  ≈ ×1.22/÷1.22، ومسارُ اللمس اللوحيّ متّصلٌ بلا قفزات. */
const ZOOM_WHEEL_K = 0.002;

/** عتبةُ الالتصاق بالبكسل لا بالثانية (ثوانيها = SNAP_PX / pxPerSec):
 *  الثابتُ بالثانية يصيرُ عند التقريب مساحةً هائلةً تبتلع كلَّ شيء. */
const SNAP_PX = 8;

/** يُصدَّر لصفحة التطوير: التحريكُ بلوحة المفاتيح يستعمل كمّيّات المسطرة
 *  عند «الملاءمة» (الخطوة الصغيرة = علامة صغرى، والكبيرة = علامة كبرى)
 *  — لا كمّيّاتٍ مختلقة بجانب المنطق القائم. زرّا الزوم لا يغيّرانها. */
export const labelStepFor = (duration: number): number => {
  for (const step of RULER_STEPS) {
    if (duration / step <= 12) return step;
  }
  return RULER_STEPS[RULER_STEPS.length - 1] ?? 60;
};

/** خطوةُ المسطرة عند مستوى زومٍ بعينه: أصغرُ خطوةٍ جميلةٍ لا تُزاحم
 *  الأرقامُ بعضَها عندها. عند الملاءمة = labelStepFor نفسها. */
const rulerStepFor = (pxPerSec: number): number => {
  for (const step of RULER_STEPS) {
    if (step * pxPerSec >= MIN_LABEL_PX) return step;
  }
  return RULER_STEPS[RULER_STEPS.length - 1] ?? 60;
};

/** أرضية قراءة بطاقة القطعة — ٪ من عرض المستطلع (L-02). أضيقُ من هذا
 *  لا يتّسع لخمسة أحرفٍ + «…» (اشتقاق القياس في تقرير 456) فتُخفى
 *  البادئة؛ الاسمُ كاملٌ في `title` و`aria-label` دائماً. عند
 *  الملاءمة يطابق سلوك 456 حرفياً (الممرّ = المستطلع). */
const LABEL_HIDE_PCT = 8;

/** ثانية → بكسل من الحافة اليُمنى للمحتوى (inline-start)، مع قصٍّ إلى
 *  [0, duration] — يتحمّل مدّةً صفريةً ومقياساً غير مقيسٍ بعد. */
const secToPx = (sec: number, duration: number, pxPerSec: number): number => {
  if (duration <= 0 || pxPerSec <= 0) return 0;
  return Math.min(duration, Math.max(0, sec)) * pxPerSec;
};

// ── ألوان الأنواع — رموز النظام عبر color-mix ────────────

const TRACK_TOKEN: Record<TrackType, string> = {
  media: 'var(--accent)',
  text: 'var(--warning)',
  audio: 'var(--success)',
};
const TRACK_BORDER: Record<TrackType, string> = {
  media: 'border-accent',
  text: 'border-warning',
  audio: 'border-success',
};
const TRACK_DOT: Record<TrackType, string> = {
  media: 'bg-accent',
  text: 'bg-warning',
  audio: 'bg-success',
};

/** تعبئة شفافة من رمز النظام — البديل الوحيد الآمن لـ`token/NN`. */
const mix = (token: string, pct: number): string =>
  `color-mix(in srgb, ${token} ${pct}%, transparent)`;

interface RulerMark {
  readonly sec: number;
  readonly major: boolean;
}

// ── حالة السحب — هندسة فقط؛ منطقُ التحرير في timeline-snap (461) ──

interface DragGeometry {
  readonly mode: 'move' | 'trim-start' | 'trim-end';
  readonly trackId: string;
  readonly itemId: string;
  readonly startX: number;
  readonly itemStart: number;
  readonly itemEnd: number;
  readonly pxPerSec: number;
  /** رأسُ القراءة لحظة الإمساك — مرساةُ الالتصاق (461 §١). */
  readonly playheadSec: number;
  /** لقطة الخطّ الزمني لحظة الإمساك — تُبنى عليها كلّ المعاينات. */
  readonly base: Timeline;
}

interface DragUi {
  readonly preview: Timeline;
  readonly trackId: string;
  readonly itemId: string;
  /** المرساةُ المقصودة إن التصقَ الحدُّ فعلاً — وإلا null. */
  readonly snapSec: number | null;
}

/** معاينةُ السحب: خطٌّ زمنيٌّ آمن + مرساةُ الالتصاق إن وقع. */
interface DragPreview {
  readonly timeline: Timeline;
  readonly snapSec: number | null;
}

/** معاينة السحب عبر العمليّات الآمنة نفسها — لا قصٍّ موازٍ هنا. */
const previewAt = (
  st: DragGeometry,
  dx: number,
  altKey: boolean,
): DragPreview => {
  // RTL: الإزاحة الفيزيائية يساراً (dx سالب) = تقدّمٌ في الزمن.
  const deltaSec = -dx / st.pxPerSec;
  const threshold = SNAP_PX / st.pxPerSec;
  /** Alt أثناء السحب يُطفئ الالتصاقَ — القيمةُ الخام (461 §٢). */
  const snap = (raw: number): number =>
    altKey
      ? raw
      : snapTime(st.base, st.trackId, st.itemId, raw, {
          threshold,
          playheadSec: st.playheadSec,
        });
  /** هل استقرّت القطعةُ على المرساةِ فعلاً؟ أسوارُ الجيران قد تدفعُها
   *  عنها — والخطُّ الذي يُخلفُ موعده كذبٌ على العين. */
  const landedOn = (result: Timeline, anchor: number): boolean => {
    const it = result.tracks
      .find((tr) => tr.id === st.trackId)
      ?.items.find((i) => i.id === st.itemId);
    if (!it) return false;
    return (
      Math.abs(it.start - anchor) < 1e-9 || Math.abs(it.end - anchor) < 1e-9
    );
  };
  if (st.mode === 'move') {
    // الحدّان يُجرَّبان وتفوز أقربُ مرساة — الالتصاقُ بالجار من
    // الجهتين لا بالبداية وحدها.
    const dur = st.itemEnd - st.itemStart;
    const rawStart = st.itemStart + deltaSec;
    const rawEnd = st.itemEnd + deltaSec;
    const sn = snap(rawStart);
    const en = snap(rawEnd);
    const dStart = sn !== rawStart ? Math.abs(sn - rawStart) : Infinity;
    const dEnd = en !== rawEnd ? Math.abs(en - rawEnd) : Infinity;
    const useEnd = dEnd < dStart;
    const anchor = useEnd ? en : sn;
    const start = useEnd ? en - dur : sn;
    const timeline = moveItemSafe(
      st.base,
      st.trackId,
      st.itemId,
      start - st.itemStart,
    );
    const raw = useEnd ? rawEnd : rawStart;
    return {
      timeline,
      snapSec: anchor !== raw && landedOn(timeline, anchor) ? anchor : null,
    };
  }
  const edge = st.mode === 'trim-start' ? 'start' : 'end';
  const edgeTime = st.mode === 'trim-start' ? st.itemStart : st.itemEnd;
  const raw = edgeTime + deltaSec;
  const t = snap(raw);
  const timeline = trimItemSafe(st.base, st.trackId, st.itemId, edge, t);
  return { timeline, snapSec: t !== raw && landedOn(timeline, t) ? t : null };
};

export function TimelineStrip({
  timeline,
  playheadSec,
  selectedItemId,
  onSelectItem,
  onTimelineChange,
}: TimelineStripProps): JSX.Element {
  const duration = timeline.duration;
  const { t } = useLocale();
  const { style: digitStyle } = useDigitStyle();

  // index 0 أسفل/خلف — flex-col-reverse أدناه يقلب الترتيب البصريّ.
  const byIndex = [...timeline.tracks].sort((a, b) => a.index - b.index);

  // ── الزوم والتمرير (458 §١) ─────────────────────────────

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  /** موضعُ رأس القراءة داخل المستطلع قبل آخر تغيير مقياس — بالقياس. */
  const anchorRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportW, setViewportW] = useState(0);

  // قياسُ المستطلع: ResizeObserver (لا حدث resize وحده) — flex-0 قابلة
  // للتمدد مع نافذة السيّاق كلّها.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = (): void => {
      const w = vp.clientWidth;
      setViewportW((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => {
      ro.disconnect();
    };
  }, []);

  const fitPxPerSec = duration > 0 && viewportW > 0 ? viewportW / duration : 0;
  const pxPerSec = fitPxPerSec * zoom;
  const contentPx = duration * pxPerSec;

  const zoomBy = useCallback(
    (factor: number): void => {
      if (duration <= 0 || viewportW <= 0) return;
      const next = Math.min(ZOOM_MAX, Math.max(1, zoom * factor));
      if (next === zoom) return;
      // التمحور حول رأس القراءة: موضعُه قبل تغيير المقياس، بقياسِ
      // الحروف — لا بإشارة scrollLeft (تختلف بين المتصفّحات في RTL).
      const vp = viewportRef.current;
      const ph = playheadRef.current;
      if (vp && ph) {
        anchorRef.current =
          ph.getBoundingClientRect().left - vp.getBoundingClientRect().left;
      }
      setZoom(next);
    },
    [duration, viewportW, zoom],
  );

  // بعد أن يستقرّ الرسمُ على المقياس الجديد: أعد رأسَ القراءة إلى
  // موضعه المسجَّل — scrollBy بفرقٍ فيزيائيّ، والمتصفّح يقصّ الحدود.
  useLayoutEffect(() => {
    const wantX = anchorRef.current;
    anchorRef.current = null;
    if (wantX === null) return;
    const vp = viewportRef.current;
    const ph = playheadRef.current;
    if (!vp || !ph) return;
    const phX =
      ph.getBoundingClientRect().left - vp.getBoundingClientRect().left;
    const dx = phX - wantX;
    if (dx !== 0) vp.scrollBy({ left: dx });
  }, [pxPerSec]);

  // ⌘+عجلة تقرِّب · عجلةٌ وحدها تمرِّر. مستمعٌ يدويّ non-passive —
  // React يسجّل wheel سلبيّةً فـpreventDefault لا يعمل داخل onWheel.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * ZOOM_WHEEL_K));
        return;
      }
      // حين يتّسع المحتوى في العرض لا نستولي على العجلة.
      if (vp.scrollWidth - vp.clientWidth <= SCROLL_SLACK_PX) return;
      e.preventDefault();
      // أفقيّ (trackpad) يمرّ كما هو · عموديٌّ يُترجم تقدّماً في
      // الزمن: عجلةٌ لأسفل = لاحقاً — في RTL كما في LTR.
      const delta = e.deltaX !== 0 ? e.deltaX : -e.deltaY;
      if (delta !== 0) vp.scrollBy({ left: delta });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      vp.removeEventListener('wheel', onWheel);
    };
  }, [zoomBy]);

  // ⌘+ / ⌘− من لوحة المفاتيح — الاختصاران المعلنان على الزرّين.
  // يحجبان تكبيرَ المتصفّح عن هذه الصفحة عمداً (نمط محرّرات الرسم).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [zoomBy]);

  // ── كثافة المسطرة تتبع الزوم ────────────────────────────

  const labelStep = rulerStepFor(pxPerSec);
  const minorStep = labelStep / 5;
  const minorCount = duration > 0 ? Math.round(duration / minorStep) : 0;

  const marks: RulerMark[] = [];
  for (let i = 0; i <= minorCount; i += 1) {
    marks.push({ sec: i * minorStep, major: i % 5 === 0 });
  }

  const markLabel = useCallback(
    (sec: number): string => formatNumber(Math.round(sec * 10) / 10, digitStyle),
    [digitStyle],
  );

  const playPx = secToPx(playheadSec, duration, pxPerSec);

  // ── السحب ───────────────────────────────────────────────

  const dragRef = useRef<DragGeometry | null>(null);
  const lastPreviewRef = useRef<Timeline | null>(null);
  const [drag, setDrag] = useState<DragUi | null>(null);
  const dragging = drag !== null;

  const onItemMouseDown = useCallback(
    (
      e: ReactMouseEvent<HTMLButtonElement>,
      trackId: string,
      itemId: string,
      itemStart: number,
      itemEnd: number,
    ): void => {
      if (dragRef.current !== null) return;
      if (e.button !== 0) return;
      e.preventDefault();
      onSelectItem?.(trackId, itemId);
      if (!onTimelineChange) return;
      if (duration <= 0 || pxPerSec <= 0) return;
      const edge = (e.target as HTMLElement).dataset.edge;
      dragRef.current = {
        mode:
          edge === 'start' ? 'trim-start' : edge === 'end' ? 'trim-end' : 'move',
        trackId,
        itemId,
        startX: e.clientX,
        itemStart,
        itemEnd,
        pxPerSec,
        playheadSec,
        base: timeline,
      };
      lastPreviewRef.current = null;
      setDrag({ preview: timeline, trackId, itemId, snapSec: null });
    },
    [duration, onSelectItem, onTimelineChange, playheadSec, pxPerSec, timeline],
  );

  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor =
      dragRef.current?.mode === 'move' ? 'grabbing' : 'ew-resize';

    const onMove = (ev: MouseEvent): void => {
      const st = dragRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (dx === 0) return;
      const preview = previewAt(st, dx, ev.altKey);
      lastPreviewRef.current = preview.timeline;
      setDrag((d) =>
        d
          ? { ...d, preview: preview.timeline, snapSec: preview.snapSec }
          : d,
      );
    };

    const onUp = (): void => {
      const final = lastPreviewRef.current;
      dragRef.current = null;
      lastPreviewRef.current = null;
      document.body.style.cursor = '';
      setDrag(null);
      // التثبيت عند الإفلات فقط — إفلاتٌ بلا حركة لا يُثبّت شيئاً.
      if (final && onTimelineChange) onTimelineChange(final);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  }, [dragging, onTimelineChange]);

  // ── العرض: المعاينة الحيّة أثناء السحب، وإلا الخطّ الزمني ──

  const shown = drag?.preview ?? timeline;

  const shownByIndex = [...shown.tracks].sort((a, b) => a.index - b.index);

  const zoomBtn =
    'flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 text-fg transition hover:border-fg-subtle disabled:opacity-40 disabled:hover:border-border';

  return (
    <div
      dir="rtl"
      role="group"
      aria-label={t('pages.reels.timeline')}
      className="select-none font-mono text-xs"
    >
      <div className="flex gap-2">
        {/* عمود التسميات — أعلى إلى أسفل = index تنازليّاً (مرآة المسارات) */}
        <div className="flex w-24 shrink-0 flex-col" style={{ rowGap: ROW_GAP }}>
          <div style={{ blockSize: ZOOM_BAR_BLOCK + RULER_BLOCK }} />
          {[...byIndex].reverse().map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-2"
              style={{ blockSize: LANE_BLOCK }}
            >
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${TRACK_DOT[track.type]}`}
              />
              <span className="truncate text-fg-subtle">
                {t(`pages.reels.trackType.${track.type}`)}
              </span>
            </div>
          ))}
        </div>

        {/* منطقة الزمن: زومٌ فوق، ومستطلعٌ واحد يلفّ المسطرة والمسارات */}
        <div className="relative min-w-0 flex-1">
          {/* زرّا الزوم — كلمةٌ من i18n واختصارٌ معلنان (لا رمزَ عارٍ) */}
          <div className="mb-1 flex justify-end gap-1">
            <button
              type="button"
              data-testid="reels-zoom-out"
              aria-keyshortcuts="Meta+-"
              aria-label={t('pages.reels.zoomOut')}
              title={t('pages.reels.zoomOut')}
              disabled={zoom <= 1}
              onClick={() => {
                zoomBy(1 / ZOOM_STEP);
              }}
              className={zoomBtn}
            >
              <span aria-hidden className="text-sm leading-none">
                −
              </span>
              <span className="text-xs">{t('pages.reels.zoomOut')}</span>
              <span
                aria-hidden
                className="tabular text-[10px] text-fg-subtle"
              >
                <Ltr>⌘−</Ltr>
              </span>
            </button>
            <button
              type="button"
              data-testid="reels-zoom-in"
              aria-keyshortcuts="Meta+="
              aria-label={t('pages.reels.zoomIn')}
              title={t('pages.reels.zoomIn')}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => {
                zoomBy(ZOOM_STEP);
              }}
              className={zoomBtn}
            >
              <span aria-hidden className="text-sm leading-none">
                +
              </span>
              <span className="text-xs">{t('pages.reels.zoomIn')}</span>
              <span
                aria-hidden
                className="tabular text-[10px] text-fg-subtle"
              >
                <Ltr>⌘+</Ltr>
              </span>
            </button>
          </div>

          {/* المستطلع — التمرير الأفقيّ الوحيد: المسطرة والمسارات معاً */}
          <div
            ref={viewportRef}
            data-testid="reels-viewport"
            className="relative overflow-x-auto"
          >
            <div
              ref={contentRef}
              data-testid="reels-content"
              className="relative"
              style={{ inlineSize: contentPx > 0 ? `${contentPx}px` : '100%' }}
            >
              {/* خطوط الشبكة عند العلامات الكبرى */}
              <div aria-hidden className="absolute inset-0 z-0">
                {marks
                  .filter((m) => m.major)
                  .map((m) => (
                    <span
                      key={`grid-${m.sec}`}
                      className="absolute w-px bg-border"
                      style={{
                        insetBlock: 0,
                        insetInlineStart: `${secToPx(m.sec, duration, pxPerSec)}px`,
                      }}
                    />
                  ))}
              </div>

              {/* المسطرة — الأرقام عبر مسار الأرقام الوحيد في المشروع */}
              <div
                role="img"
                aria-label={t('pages.reels.ruler')}
                data-testid="reels-ruler"
                className="relative z-[1]"
                style={{ blockSize: RULER_BLOCK }}
              >
                {marks.map((m) => {
                  const xPx = secToPx(m.sec, duration, pxPerSec);
                  return (
                    <span key={`tick-${m.sec}`}>
                      <span
                        aria-hidden
                        className={`absolute w-px ${m.major ? 'bg-fg-subtle' : 'bg-border'}`}
                        style={{
                          insetBlockEnd: 0,
                          insetInlineStart: `${xPx}px`,
                          blockSize: m.major ? 8 : 4,
                        }}
                      />
                      {m.major && (
                        <span
                          data-testid="reels-ruler-label"
                          className="tabular absolute text-fg-subtle"
                          style={{
                            insetBlockStart: 0,
                            insetInlineStart: `${xPx}px`,
                            // التوسيط على العلامة — إلا تسميةَ الصفر:
                            // تجلس كاملةً داخل الحافة اليُمنى (458).
                            transform:
                              m.sec === 0 ? undefined : 'translateX(50%)',
                          }}
                        >
                          {markLabel(m.sec)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              {/* المسارات — حدٌّ أخفق وتعبئة باهتة: الحاوي دون المحوِيّ */}
              <div
                className="relative z-[1] flex flex-col-reverse"
                style={{ rowGap: ROW_GAP }}
              >
                {shownByIndex.map((track) => (
                  <div
                    key={track.id}
                    data-testid={`reels-track-${track.id}`}
                    role="group"
                    aria-label={`${t('pages.reels.track')} — ${t(`pages.reels.trackType.${track.type}`)}`}
                    title={`${t('pages.reels.track')} — ${t(`pages.reels.trackType.${track.type}`)}`}
                    className="relative rounded-sm border border-border"
                    style={{
                      blockSize: LANE_BLOCK,
                      backgroundColor: 'color-mix(in srgb, var(--surface-2) 30%, transparent)',
                    }}
                  >
                    {track.items.map((item) => {
                      const startPx = secToPx(item.start, duration, pxPerSec);
                      const endPx = secToPx(item.end, duration, pxPerSec);
                      const widthPx = Math.max(0, endPx - startPx);
                      const selected = selectedItemId === item.id;
                      const dragged = drag !== null && drag.itemId === item.id;
                      // أضيقُ من أرضية القراءة (٪ من المستطلع) → لا
                      // بادئة مزدحمة؛ الاسمُ في title وaria-label
                      // كاملاً (456 §٢ · 458: أرضيةٌ من المستطلع).
                      const showLabel =
                        viewportW > 0 &&
                        widthPx >= (LABEL_HIDE_PCT / 100) * viewportW;
                      const geometry: CSSProperties = {
                        insetBlock: 2,
                        insetInlineStart: `${startPx}px`,
                        inlineSize: `${widthPx}px`,
                        minInlineSize: 2,
                        backgroundColor: mix(
                          TRACK_TOKEN[track.type],
                          selected ? 38 : 18,
                        ),
                      };
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`reels-item-${item.id}`}
                          aria-pressed={selected}
                          aria-label={`${t('pages.reels.clip')} ${item.id}`}
                          aria-keyshortcuts="ArrowRight ArrowLeft [ ]"
                          title={item.id}
                          onClick={() => {
                            onSelectItem?.(track.id, item.id);
                          }}
                          onMouseDown={(e) => {
                            onItemMouseDown(e, track.id, item.id, item.start, item.end);
                          }}
                          className={`absolute flex items-center overflow-hidden rounded-sm border text-start ${
                            TRACK_BORDER[track.type]
                          } ${onTimelineChange ? 'cursor-grab' : 'cursor-default'}${
                            selected ? ' z-10 ring-1 ring-accent' : ''
                          }${dragged ? ' opacity-70' : ''}`}
                          style={geometry}
                        >
                          {showLabel && (
                            <span
                              dir="ltr"
                              title={item.id}
                              className="block truncate px-1 text-[10px] leading-4 text-fg"
                            >
                              {item.id}
                            </span>
                          )}
                          {/* مقابض القصّ — اليُمنى start في RTL */}
                          <span
                            aria-hidden
                            data-edge="start"
                            className="absolute cursor-ew-resize"
                            style={{
                              insetBlock: 0,
                              insetInlineStart: 0,
                              inlineSize: EDGE_HANDLE,
                              backgroundColor: mix(TRACK_TOKEN[track.type], 45),
                            }}
                          />
                          <span
                            aria-hidden
                            data-edge="end"
                            className="absolute cursor-ew-resize"
                            style={{
                              insetBlock: 0,
                              insetInlineEnd: 0,
                              inlineSize: EDGE_HANDLE,
                              backgroundColor: mix(TRACK_TOKEN[track.type], 45),
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* رأس القراءة — عند playheadSec، من الحافة اليُمنى للمحتوى */}
              <div
                ref={playheadRef}
                role="img"
                aria-label={t('pages.reels.playhead')}
                title={t('pages.reels.playhead')}
                data-testid="reels-playhead"
                className="pointer-events-none absolute z-20 bg-danger"
                style={{
                  insetBlock: 0,
                  insetInlineStart: `${playPx}px`,
                  inlineSize: 2,
                  marginInlineStart: -1,
                }}
              />

              {/* خطُّ المرساة — أثناء السحب وحده، حين يلتصقُ الحدُّ فعلاً:
                  رفيعٌ بلون ring-accent (bg-accent)، لا نصَّ فيه (461 §٣). */}
              {drag !== null && drag.snapSec !== null && (
                <div
                  aria-hidden
                  data-testid="reels-snap-line"
                  className="pointer-events-none absolute z-20 bg-accent"
                  style={{
                    insetBlock: 0,
                    insetInlineStart: `${secToPx(drag.snapSec, duration, pxPerSec)}px`,
                    inlineSize: 2,
                    marginInlineStart: -1,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
