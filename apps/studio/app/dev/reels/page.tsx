'use client';

// /dev/reels — صفحة تطوير لمحرّر الخطّ الزمني (reels/453 → 454 → 456 → 458 → 462 → 463 → 464 → 466 → 468 → 469).
//
// **458:** مقاس الخطّ الزمني يُعرض بمفتاحٍ مترجَم (pages.reels.size.*)
// — القيمة في البيانات تبقى TimelineSize كما هي؛ وسطرُ التلميحات
// يزداد بندَ الزوم (عجلةٌ وحدها تمرير، ومع ⌘ تقريب).
//
// **456 · الأسماء والتحريك:** كلُّ زرٍّ يحمل كلمةً من قاموس i18n
// (`actions.split/undo/redo/play/pause` · `pages.reels.*`) مع
// `aria-label` و`title`، وكلُّ اختصارٍ معلنٌ في `aria-keyshortcuts`
// وتلميحٍ مرئيّ. رموز المفاتيح المركّبة (⌘Z · ⌘⇧Z · ⌫ ⌦ · [ ]) تُعزل
// بمكوّن `Ltr` — عطبُ bidi المقلوب (Z⌘) قيس قبل الإصلاح وسُدّ.
// التحريكُ بلوحة المفاتيح (456 §٣): الأسهمُ تُزيح القطعةَ المختارة
// (الأسهمُ تمضي حيث تشير — 463 قلَبَ الاتّجاه: ← تقدّماً في الزمن في
// شريطٍ RTL و→ عَكساً، قياساً لا افتراضاً)، و⇧ يوسّع الخطوة، والقوسان
// يقصّان الحافّتين. كلُّها عبر `snapMove`/`snapTrim` (462: الآمنُ +
// الالتصاق) و`apply` — لا منطقَ جديد، والكمّيّات من `labelStepFor`
// نفسها (كمّيّات المسطرة).
//
// **463 · الزجاجُ الأماميّ:** TimelinePreview فوق الشريط تحت «معاينة
// حيّة» — قماشةٌ ترسم الإطارَ عند رأس القراءة عبر `drawTimelineAt`
// (الوصفةُ من /dev/pixel-eq: الخطُّ أوّلاً ثمّ dpr=1)، فيصدقُ العنوانُ
// الذي فوقه.
//
// **464 · قطعةٌ بلا مؤثّرٍ غيرُ موجودة.** المؤثّرُ ليس زينةً تُضاف
// لاحقاً — هو ما يجعلُ القطعةَ مرئيّةً: `draw-timeline-at` يتخطّى كلَّ
// عنصرٍ بلا `effects`، فالوسائطُ تحمل `draw-media` والنصوصُ `text-item-lines`.
// قطعةٌ تظهرُ في الشريط ولا تظهرُ في المعاينةِ **محرّرٌ يكذب** — والعيّنةُ
// قبل هذا التذكرة كانت ترسمُ صفرَ بكسلٍ من ٢٬٠٧٣٬٦٠٠ لهذا السبب بعينه.
//
// **466 · معاينةٌ تتحرّك:** مؤثّرٌ ساكنٌ يرسمُ ساكناً — فالإطارُ صار
// دالّةً في الزمن. kenBurns بمعلمتَيها from/to (بلاهما scale=NaN
// يُسمِّمُ مصفوفةَ التحويل ويُخفي ما بعدها — فراغُ 464 الذي حسبتُه
// عيبَ محرّكٍ وكان نقصَ معلَماتٍ في العيّنة)، **والتحويلُ قبلَ الرسم:
// مؤثّرٌ يأتي بعدَ الرسمِ لا يحوّلُ شيئاً** — kenBurns أولاً ثمّ
// draw-media/byWord. والنصُّ يولدُ كلمةً كلمةً، وقطعةٌ واحدةٌ تُتركُ
// ساكنةً للمقارنة. نقلُ قطعةٍ نصفَ ثانيةٍ **داخلَ نافذتها** يغيّرُ
// الإطارَ الآن — هذا الاختبارُ الذي سقط في 464 وسببُهُ عندي.
//
// **468 · الإنشاءُ بالأزرار:** «أضِفْ مساراً» قائمةُ الأنواع الثلاثة
// (وسائط · نصّ · صوت — مساران من نوعٍ واحدٍ مسموحان: هذه هي الطبقيّةُ
// التي طلبها المالك)، و«أضِفْ قطعةً» على المسار المحدَّد عند رأس
// القراءة — مدّةٌ افتراضيّةٌ ٣ ثوانٍ وبـinsert (قرارُ المالك 2026-09-22)،
// وكلاهما عبر `apply` فيدخلان التراجعَ/الإعادة. الاختيارُ صار مساريّاً:
// المسارُ المضافُ يُختارُ تلقائياً فتُبنى عليه القطعةُ (لا نقرَّ لمسارٍ
// فارغ)، والقطعةُ المختارةُ تُبقي مسارَها. قطعةُ الوسائطِ تُولَدُ على
// أصلِ عيّنةٍ قائمٍ (لا منتقيَ أصولَ بعد)، وقطعةُ الصوتِ بلا مؤثّراتٍ
// عمداً — المحرّكُ لا يرسمُ صوتاً (AudioPlan/audio-graph)، والمؤثّرُ
// الافتراضيُّ للوسائطِ والنصِّ يُلحِقُهُ addItem. والمدّةُ تُقرأُ الآنَ من
// `present` لا من العيّنة — insert يُطيلُها فلا يكذبُ شريطُ الموضعِ
// ولا القراءةُ ولا حلقةُ التشغيل.
//
// **469 · العينُ ترى ما لا يراه المقياس:** بوّابةُ 468 اجتازتها خربشةٌ
// متراكبة — كلُّ مقاييسها خضراء. العلاجُ بجذوره: (١) **عطاءُ العيّنةِ
// anchor صريحاً** (0.2 · 0.5 · 0.8) — بلا anchor يهبطُ النصُّ إلى
// المنتصف (mapItemAnchor في plan.ts) فيركبُ كلَّ من يتداخلُ معه زمنيّاً؛
// والقطعةُ المضافة تولدُ عند 0.8. (٢) **لوحةُ الخصائص:** عند تحديدِ
// قطعةٍ تظهرُ حقولُ نوعِها وحدَه — نص: value يُكتبُ فتتبدّلُ المعاينةُ
// فوراً + مُنزلِقُ anchor وحقلا offset بالبكسل («حرّكه لأيِّ مكان»)؛
// وسائط: الأصلُ ومن/إلى kenBurns؛ صوت: gain؛ ولكلِّ نوعٍ البدايةُ
// والنهاية عبر القصِّ الآمن. كلُّ تعديلٍ عبر `apply` فيدخلُ التراجع.
// (٣) **نافذةُ القياس:** المعاينةُ تُصدّر صناديقَ النصوص من الخطّة
// (`reels-text-layout`) — السكربتُ يفحصُ أنّ كلَّ قطعتَين متداخلتَين
// زمنيّاً تقاطعُهما الرأسيُّ صفرٌ، بحالةٍ سلبيّةٍ تُثبتُ أنّه يرسب.
//
// **462 · البابُ الثاني — الأسهمُ كالفأرة:** التحريكُ والقصُّ باللوحة
// صارا على الآمنَين من timeline-snap: التصاقٌ بعتبةِ SNAP_PX/pxPerSec
// ورأسُ القراءة مرساةً — كما في السحب تماماً. المقياسُ يصعدُ من
// الشريط عبر onScaleChange. فُحص الباقي: `splitItem`/`removeItem` لا
// يُنتجان تراكباً — الشطرُ لمسٌ عند نقطةٍ بلا فجوة، والحذفُ ينقصُ
// ولا يزيد.
//
// **454:** الحالةُ كلُّها في `History` من الطبقة (أ) — لا مكدّسَ ثانٍ:
// السحب/القصّ يصلان عبر `onTimelineChange` (من TimelineStrip) ويُطبَّقان
// بـ`apply`، والشطر/الحذف بنداءٍ مباشر، والتراجع/الإعادة بـ`undo`/`redo`.
// مدفوعٌ بلا أثر: `timelineEq` يمنع دفع حالاتٍ متطابقة إلى الماضي
// (إفلاتٌ بلا حركة، أو قصٌّ قصّه القصّ إلى الموضع نفسه).
//
// **454 · الاختصارات معلنة:** تشغيل (Space) · شطر (S) · حذف
// (Delete/Backspace) · تراجع (⌘Z) · إعادة (⌘⇧Z) — aria-keyshortcuts +
// تلميح مرئيّ على كلّ زرّ، وكلّ كتلة وصولٌ بـTab (buttons).
//
// **الأرقام:** عبر `useDigitStyle` + `formatNumber` — مسار المشروع
// الوحيد، مع `DigitStyleSwitcher` لتجربته حيّاً. لا تنسيق مختلق.
// المبدّلُ يُسمّى من الخارج (`digits.switcher`): مكوّنه خارج بدل هذه
// التذكرة، فالتسميةُ تغليفٌ هنا.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, Ltr } from '@pf-mediakit/i18n';
import type { Timeline, Track, TrackItem, TrackType } from '@pf-mediakit/shared';
import { TimelineStrip, SNAP_PX, labelStepFor } from '@/src/reels/TimelineStrip';
import { TimelinePreview, type TextLayoutInfo } from '@/src/reels/TimelinePreview';
import {
  apply,
  createHistory,
  redo,
  removeItem,
  splitItem,
  undo,
  type History,
} from '@/src/reels/timeline-ops';
import { snapMove, snapTrim } from '@/src/reels/timeline-snap';
import { addTrack, addItem } from '@/src/reels/timeline-add';
import { useDigitStyle } from '@/src/format/settings';
import { formatNumber } from '@/src/format/digits';
import { DigitStyleSwitcher } from '@/src/format/DigitStyleSwitcher';

const SAMPLE: Timeline = {
  duration: 32,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'trk-media',
      type: 'media',
      index: 0,
      items: [
        // 464: بلا `draw-media` لا ترسمُ الوسائطُ شيئاً — والصورُ
        // المولَّدةُ تصلُ المحرّكَ عبر assets.images بمفتاح src نفسِه.
        // 466: kenBurns بمعلمتَيها — زحفُ ٨٪ على مدى القطعة، وorigin
        // يختلفُ بين القطعتَين ليرى الفرقَ العينُ (بلا from/to يصيرُ
        // scale=NaN فتُسمَّمُ مصفوفةُ التحويل ويختفي ما بعدها — فراغُ 464).
        { id: 'clip-01', start: 0, end: 9.5, src: 'asset:reel-a',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:reel-a' },
          ] },
        { id: 'clip-02', start: 9.5, end: 18, src: 'asset:reel-b',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'topLeft' },
            { type: 'draw-media', assetKey: 'asset:reel-b' },
          ] },
        { id: 'clip-03', start: 18, end: 32, src: 'asset:reel-c',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:reel-c' },
          ] },
      ],
    },
    {
      id: 'trk-text',
      type: 'text',
      index: 1,
      items: [
        // 466: النصُّ يتحرّك — byWord كلمةً كلمةً (رقمان بالثانية)، ومعه
        // kenBurns زحفُ ٨٪ على مدى القطعة: نقلُها نصفَ ثانيةٍ يُزحزحُ
        // المشهدَ والقطعةُ داخلَ نافذة النشاط — اختبارُ الحساسيّة الذي
        // سقط في 464. والقيمةُ نصٌّ عربيٌّ من اختراع هذه الصفحة، لا
        // اسمَ جهةٍ ولا علامةً.
        // 469 §١: anchor صريحٌ لكلّ قطعة — بلاهُ يهبطُ الجميعُ إلى
        // المنتصف فيركبُ بعضُهم بعضاً عند أيّ تداخلٍ زمنيّ (هو عطبُ
        // اللقطة التي قُرئت بالعين). 0.2 · 0.5 · 0.8 متباعدةٌ عمداً.
        { id: 'title-01', start: 0.5, end: 7, anchor: 0.2,
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'text-item-byWord', stagger: 0.08, fadeDuration: 0.25 },
          ],
          value: 'الإيقاعُ السريعُ يشدُّ المشاهدَ من أوّلِ ثانية' },
        // 466 §٢: تُبقى هاتانِ ساكنتَين على text-item-lines — المشهدُ
        // الواحدُ يُري المتحرّكَ والساكنَ معاً للمقارنة.
        { id: 'title-02', start: 7, end: 14, anchor: 0.5,
          effects: [{ type: 'text-item-lines' }],
          value: 'كلُّ لقطةٍ تخدمُ الحكايةَ ولا تحيدُ عنها' },
        { id: 'title-03', start: 20, end: 28, anchor: 0.8,
          effects: [{ type: 'text-item-lines' }],
          value: 'النصُّ المكتوبُ جيّداً يصلُ قبلَ الصورة' },
      ],
    },
    {
      id: 'trk-audio',
      type: 'audio',
      index: 2,
      items: [
        { id: 'vo-main', start: 0, end: 18, gain: 0.9 },
        { id: 'sting-01', start: 18, end: 20.5 },
      ],
    },
  ],
};

/** مدّة القطعة الجديدة بالثواني — قرارُ التذكرة 468 §٤. */
const NEW_ITEM_SEC = 3;

/** معرّفُ مسارٍ جديدٍ لا يصطدم بالقائم. مساران من نوعٍ واحدٍ مسموحان —
 *  هذه هي الطبقيّةُ التي طلبها المالك — فالتسميةُ تُعِدُّ نوعَها:
 *  trk-text-2 يعلو trk-text. */
const freshTrackId = (tl: Timeline, type: TrackType): string => {
  const taken = new Set(tl.tracks.map((tr) => tr.id));
  let n = tl.tracks.filter((tr) => tr.type === type).length + 1;
  while (taken.has(`trk-${type}-${n}`)) n += 1;
  return `trk-${type}-${n}`;
};

/** معرّفُ قطعةٍ جديدٍ على تسميةِ العيّنة (clip-NN · title-NN · tone-NN) —
 *  فرادتُه على الخطّ كلِّه لا على المسار وحدَه: القطعةُ تظهرُ في DOM
 *  بمعرّفها (testid)، وتصادمُ المعرفاتِ بين مسارَين يُعمي القياسَ
 *  و page.click معاً. */
const freshItemId = (tl: Timeline, track: Track): string => {
  const prefix =
    track.type === 'media' ? 'clip' : track.type === 'text' ? 'title' : 'tone';
  const taken = new Set(
    tl.tracks.flatMap((tr) => tr.items.map((i) => i.id)),
  );
  let n = track.items.length + 1;
  let id = `${prefix}-${String(n).padStart(2, '0')}`;
  while (taken.has(id)) {
    n += 1;
    id = `${prefix}-${String(n).padStart(2, '0')}`;
  }
  return id;
};

/** مقارنة الحقول التي تمسّها العمليّات — تمنع دفع حالاتٍ متطابقة. */
const timelineEq = (a: Timeline, b: Timeline): boolean =>
  a.duration === b.duration &&
  a.fps === b.fps &&
  a.size === b.size &&
  a.tracks.length === b.tracks.length &&
  a.tracks.every((t, i) => {
    const u = b.tracks[i];
    if (!u) return false;
    return (
      t.id === u.id &&
      t.type === u.type &&
      t.index === u.index &&
      t.items.length === u.items.length &&
      t.items.every((it, j) => {
        const iu = u.items[j];
        if (!iu) return false;
        return it.id === iu.id && it.start === iu.start && it.end === iu.end;
      })
    );
  });

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** الاختيار (468): صار مساريّاً — القطعةُ تختارُ مسارَها، والمسارُ
 *  المضافُ يُختارُ بلا قطعةٍ فتُبنى عليه القطعةُ التالية. */
interface Selection {
  readonly trackId: string;
  readonly itemId?: string;
}

export default function ReelsTimelinePage(): JSX.Element {
  const { t } = useLocale();
  const { style: digitStyle } = useDigitStyle();

  const [history, setHistory] = useState<History>(() => createHistory(SAMPLE));
  const [playheadSec, setPlayheadSec] = useState(4.5);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  /** مقياس الشريط الحاليّ (pxPerSec) — يصعدُ عبر onScaleChange (462):
   *  تُشتقُّ منه عتبةُ التصاقِ التحريك باللوحة. قبل القياس 0 — أي
   *  عتبةَ صفرٍ: آمنٌ بلا التصاق. */
  const [pxPerSec, setPxPerSec] = useState(0);
  /** خريطةُ صناديقِ النصوصِ من آخر إطارٍ (469 §٣) — يستقرُّ هويّةً حتى
   *  لا يعيدَ الرسمَ إلا لصناديقٍ تبدّلت فعلاً. */
  const [textLayout, setTextLayout] = useState<TextLayoutInfo | null>(null);

  const present = history.present;

  // الاختيار قد يفقد عنصره (حذف · تراجع) — يتراجعُ إلى مساره لا أن
  // يُعلَّق؛ وإن فقدَ المسارَ نفسَه يُنسف. (468: الاختيارُ مساريّ.)
  useEffect(() => {
    if (!selected) return;
    const track = present.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) {
      setSelected(null);
      return;
    }
    if (
      selected.itemId !== undefined &&
      !track.items.some((it) => it.id === selected.itemId)
    ) {
      setSelected({ trackId: selected.trackId });
    }
  }, [present, selected]);

  const onSelectItem = useCallback((trackId: string, itemId: string): void => {
    setSelected({ trackId, itemId });
  }, []);

  const onScaleChange = useCallback((v: number): void => {
    setPxPerSec(v);
  }, []);

  /** نافذةُ القياس (469 §٣) — مستقرُّ الهويّة كي لا يعادَ رسمُ المعاينة
   *  من أجله؛ لا يُعيدُ الحالةَ إلّا إذا تبدّلت الصناديقُ فعلاً. */
  const onTextLayout = useCallback((info: TextLayoutInfo): void => {
    setTextLayout((prev) => {
      if (prev !== null && JSON.stringify(prev) === JSON.stringify(info)) {
        return prev;
      }
      return info;
    });
  }, []);

  const onTimelineChange = useCallback((next: Timeline): void => {
    setHistory((h) => (timelineEq(h.present, next) ? h : apply(h, () => next)));
  }, []);

  const selectedTrack = selected
    ? present.tracks.find((tr) => tr.id === selected.trackId)
    : undefined;
  const selectedItem = selectedTrack?.items.find(
    (it) => it.id === selected?.itemId,
  );
  const canAddItem = !!selectedTrack;
  const canSplit =
    !!selectedItem && playheadSec > selectedItem.start && playheadSec < selectedItem.end;
  const canDelete = !!selectedItem;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // قيمُ العرضِ للوحةِ الخصائص (469 §٤) — المسارُ الوحيدُ للأرقامِ
  // `formatNumber` في الموضع؛ وحقولُ الإدخالِ قيمٌ خامٌ بياناتٌ. الكلمات
  // ('top'/'center'/'bottom') تُعرضُ على أقربِ طرفٍ للمُنزلِق، والتحريرُ
  // يكتبُ نسبةً رقميّةً دائماً. gain الغائبُ يُعرضُ 1 (كاملَ المستوى)
  // ويبقى الغيابُ في البياناتِ حتى يُحرَّر.
  const anchorValue =
    typeof selectedItem?.anchor === 'number'
      ? selectedItem.anchor
      : selectedItem?.anchor === 'top'
        ? 0
        : selectedItem?.anchor === 'bottom'
          ? 1
          : 0.5;
  const offsetValueX =
    typeof selectedItem?.offset?.x === 'number' ? selectedItem.offset.x : 0;
  const offsetValueY =
    typeof selectedItem?.offset?.y === 'number' ? selectedItem.offset.y : 0;
  const kenBurnsEffect = selectedItem?.effects?.find(
    (fx) => fx.type === 'kenBurns',
  );
  const kenBurnsFromValue =
    kenBurnsEffect && typeof kenBurnsEffect.from === 'number'
      ? kenBurnsEffect.from
      : 1;
  const kenBurnsToValue =
    kenBurnsEffect && typeof kenBurnsEffect.to === 'number'
      ? kenBurnsEffect.to
      : 1.08;

  const splitSelected = useCallback((): void => {
    if (!selected?.itemId) return;
    const { trackId, itemId } = selected;
    setHistory((h) => {
      const next = splitItem(h.present, trackId, itemId, playheadSec);
      return timelineEq(h.present, next) ? h : apply(h, () => next);
    });
  }, [playheadSec, selected]);

  const deleteSelected = useCallback((): void => {
    if (!selected?.itemId) return;
    const { trackId, itemId } = selected;
    setHistory((h) => apply(h, (tl) => removeItem(tl, trackId, itemId)));
    setSelected(null);
  }, [selected]);

  // ── الإنشاء (468 §٤) — عبر `apply` فيدخلان التراجعَ/الإعادة ──

  /** مسارٌ جديدٌ من نوعٍ مختار — يُختارُ تلقائياً فتُبنى عليه القطعةُ
   *  التالية بلا نقرٍ لا طريقَ إليه في مسارٍ فارغ. */
  const addTrackByType = useCallback(
    (type: TrackType): void => {
      const trackId = freshTrackId(present, type);
      const next = addTrack(present, { id: trackId, type });
      setHistory((h) => (timelineEq(h.present, next) ? h : apply(h, () => next)));
      setSelected({ trackId });
    },
    [present],
  );

  /** قائمةُ <details> الأصليّة: الاختيارُ يغلقُها — سلوكُ القوائم
   *  المألوف، بلا حالةٍ تُدارُ يدويّاً. */
  const addMenuRef = useRef<HTMLDetailsElement>(null);
  const pickTrackType = useCallback(
    (type: TrackType): void => {
      if (addMenuRef.current) addMenuRef.current.open = false;
      addTrackByType(type);
    },
    [addTrackByType],
  );

  /** قطعةٌ على المسار المحدَّد عند رأس القراءة — ٣ ثوانٍ وبـinsert
   *  (قرارُ المالك): تُفسحُ في مسارها وحدَه وتُطيلُ المدّة. حقولُ النوعِ
   *  من المسار: الوسائطُ على أصلِ عيّنةٍ قائمٍ (لا منتقيَ أصولَ بعد)،
   *  والنصُّ بقيمةٍ من مفتاح i18n **وموضعٍ صريحٍ 0.8** (469 §١: بلا
   *  anchor يهبطُ إلى المنتصف فيركبُ كلَّ من يتداخلُ معه)، والصوتُ بلا
   *  مؤثّراتٍ عمداً — المؤثّرَ الافتراضيَّ للوسائطِ والنصِّ يُلحِقُهُ
   *  addItem. */
  const addItemAtPlayhead = useCallback((): void => {
    const track = present.tracks.find((tr) => tr.id === selected?.trackId);
    if (!track) return;
    const itemId = freshItemId(present, track);
    const span = { start: playheadSec, end: playheadSec + NEW_ITEM_SEC };
    const base: TrackItem =
      track.type === 'media'
        ? { id: itemId, ...span, src: 'asset:reel-a' }
        : track.type === 'text'
          ? { id: itemId, ...span, anchor: 0.8, value: t('pages.reels.newItemText') }
          : { id: itemId, ...span };
    const next = addItem(present, track.id, base, 'insert');
    setHistory((h) => (timelineEq(h.present, next) ? h : apply(h, () => next)));
    setSelected({ trackId: track.id, itemId });
  }, [playheadSec, present, selected, t]);

  // ── لوحةُ الخصائص (469 §٤) — آخرُ بندٍ في الطبقة (ب) ──

  /** يعدّلُ القطعةَ المختارة عبر `apply` فيدخلُ التراجع. `timelineEq`
   *  يقارنُ الهندسةَ وحدَها فلا يصلحُ هنا — التعديلُ العميقُ يُقارَنُ
   *  بالقيمةِ كلِّها: تعديلٌ ردَّ القيمةَ إلى نفسِها لا يدفعُ حالةً
   *  إلى الماضي. */
  const editSelectedItem = useCallback(
    (patch: (it: TrackItem) => TrackItem): void => {
      if (!selected?.itemId) return;
      const { trackId, itemId } = selected;
      setHistory((h) => {
        const track = h.present.tracks.find((tr) => tr.id === trackId);
        const it = track?.items.find((i) => i.id === itemId);
        if (!track || !it) return h;
        const nextItem = patch(it);
        const next = {
          ...h.present,
          tracks: h.present.tracks.map((tr) =>
            tr.id === trackId
              ? {
                  ...tr,
                  items: track.items.map((i) => (i.id === itemId ? nextItem : i)),
                }
              : tr,
          ),
        };
        if (JSON.stringify(h.present) === JSON.stringify(next)) return h;
        return apply(h, () => next);
      });
    },
    [selected],
  );

  const setTextValue = useCallback(
    (v: string): void => {
      editSelectedItem((it) => ({ ...it, value: v }));
    },
    [editSelectedItem],
  );

  /** الموضعُ الرأسيُّ حرّاً — نسبةٌ رقميّةٌ تكتبُ على أيِّ anchor قائم
   *  (كلمةً كانت أم رقماً). */
  const setTextAnchor = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({ ...it, anchor: v }));
    },
    [editSelectedItem],
  );

  const setTextOffsetX = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({ ...it, offset: { ...(it.offset ?? {}), x: v } }));
    },
    [editSelectedItem],
  );

  const setTextOffsetY = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({ ...it, offset: { ...(it.offset ?? {}), y: v } }));
    },
    [editSelectedItem],
  );

  const setMediaSrc = useCallback(
    (v: string): void => {
      editSelectedItem((it) => ({ ...it, src: v }));
    },
    [editSelectedItem],
  );

  const setKenBurnsFrom = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({
        ...it,
        effects: (it.effects ?? []).map((fx) =>
          fx.type === 'kenBurns' ? { ...fx, from: v } : fx,
        ),
      }));
    },
    [editSelectedItem],
  );

  const setKenBurnsTo = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({
        ...it,
        effects: (it.effects ?? []).map((fx) =>
          fx.type === 'kenBurns' ? { ...fx, to: v } : fx,
        ),
      }));
    },
    [editSelectedItem],
  );

  const setAudioGain = useCallback(
    (v: number): void => {
      editSelectedItem((it) => ({ ...it, gain: v }));
    },
    [editSelectedItem],
  );

  /** البدايةُ والنهايةُ عبر القصِّ الآمن (عتبةُ التصاقٍ صفرٌ): جدارُ
   *  الجارِ يحفظُ تسلسلَ المسار كما في السحب تماماً. */
  const editEdge = useCallback(
    (edge: 'start' | 'end', raw: number): void => {
      if (!selected?.itemId) return;
      const { trackId, itemId } = selected;
      setHistory((h) => {
        const next = snapTrim(
          h.present,
          trackId,
          itemId,
          edge,
          raw,
          0,
          playheadSec,
        ).timeline;
        return timelineEq(h.present, next) ? h : apply(h, () => next);
      });
    },
    [playheadSec, selected],
  );

  const doUndo = useCallback((): void => {
    setHistory((h) => undo(h));
  }, []);

  const doRedo = useCallback((): void => {
    setHistory((h) => redo(h));
  }, []);

  // ── التحريك بلوحة المفاتيح (456 §٣) — عبر العمليّات لا بجانبها ──
  // الكمّيّات من المسطرة نفسها: صغيرة = علامة صغرى (labelStep/5)،
  // كبيرة = علامة كبرى (labelStep). RTL: → تقدّماً في الزمن.
  const labelStep = labelStepFor(present.duration);
  const nudgeSmall = labelStep / 5;
  const nudgeLarge = labelStep;
  // عتبةُ الالتصاق بالبكسل كمسار الفأرة (462): SNAP_PX/pxPerSec — وقبل
  // قياس الشريط مقياسُه 0 فتكون عتبةَ صفرٍ (التصاقٌ معطَّل، آمنٌ باقٍ).
  const snapThreshold = pxPerSec > 0 ? SNAP_PX / pxPerSec : 0;

  const nudgeSelected = useCallback(
    (deltaSec: number): void => {
      if (!selected?.itemId) return;
      const { trackId, itemId } = selected;
      setHistory((h) => {
        const next = snapMove(
          h.present,
          trackId,
          itemId,
          deltaSec,
          snapThreshold,
          playheadSec,
        ).timeline;
        return timelineEq(h.present, next) ? h : apply(h, () => next);
      });
    },
    [playheadSec, selected, snapThreshold],
  );

  const trimSelected = useCallback(
    (edge: 'start' | 'end', stepSec: number): void => {
      if (!selected?.itemId) return;
      const { trackId, itemId } = selected;
      setHistory((h) => {
        const it = h.present.tracks
          .find((tr) => tr.id === trackId)
          ?.items.find((i) => i.id === itemId);
        if (!it) return h;
        // القصّ = تقصير: البدايةُ تتقدّم والنهايةُ تتأخّر.
        const to = edge === 'start' ? it.start + stepSec : it.end - stepSec;
        const next = snapTrim(
          h.present,
          trackId,
          itemId,
          edge,
          to,
          snapThreshold,
          playheadSec,
        ).timeline;
        return timelineEq(h.present, next) ? h : apply(h, () => next);
      });
    },
    [playheadSec, selected, snapThreshold],
  );

  // الاختصارات — لكلّ فعلٍ اختصار معلن (aria-keyshortcuts على الأزرار).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target;
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (inField) return;
      // التحريك: الأسهمُ تمضي حيث تشير — ← تقدّماً في الزمن (شريط RTL)
      // و→ عَكساً (463: السهمُ يدٌ تدفعُ جسماً، لا كلمةٌ تُقرأ) · ⇧ خطوة
      // أوسع. القوسان يقصّان الحافّتين (e.code لا e.key — فالقوسُ مع ⇧
      // يصير «{»).
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (!selectedItem) return;
        e.preventDefault();
        const step = (e.shiftKey ? nudgeLarge : nudgeSmall) *
          (e.key === 'ArrowRight' ? -1 : 1);
        nudgeSelected(step);
        return;
      }
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        if (!selectedItem) return;
        e.preventDefault();
        trimSelected(e.code === 'BracketLeft' ? 'start' : 'end', e.shiftKey ? nudgeLarge : nudgeSmall);
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        splitSelected();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === ' ' && !e.repeat) {
        if (
          target instanceof HTMLElement &&
          (target.tagName === 'BUTTON' || target.tagName === 'INPUT')
        ) {
          return;
        }
        e.preventDefault();
        setPlaying((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    deleteSelected,
    doRedo,
    doUndo,
    nudgeLarge,
    nudgeSelected,
    nudgeSmall,
    selectedItem,
    selected,
    splitSelected,
    trimSelected,
  ]);

  // تشغيل القراءة: rAF يقدّم playheadSec ويُعيد من الصفر عند المدّة —
  // والمدّةُ من `present` (468): insert يُطيلُها فلا تلفُ الحلقةُ قبل
  // نهايةِ المقطعِ الحقيقيّة.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayheadSec((p) => {
        const next = p + dt;
        return next >= present.duration ? 0 : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, present.duration]);

  const btn =
    'flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2.5 text-fg transition hover:border-fg-subtle disabled:opacity-40 disabled:hover:border-border';
  const kbd = 'tabular text-[10px] text-fg-subtle';
  /** لوحةُ الخصائص (469): تسميةُ الحقلِ وإطارُ إدخاله. */
  const fieldLbl = 'flex flex-col gap-1 text-xs text-fg-muted';
  const fieldIn =
    'w-full rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs text-fg';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <h1 className="text-lg font-semibold text-fg">
        {t('pages.projects.workspace.size.reel')}
      </h1>

      <section className="mt-6">
        <h2 className="text-xs uppercase tracking-widest text-fg-subtle">
          {t('pages.projects.preview.title')}
        </h2>
        <div className="mt-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
          {/* الزجاجُ الأماميّ فوق المقود (463) — العنوانُ يصدق */}
          <div className="mb-4 flex justify-center">
            <TimelinePreview
              timeline={present}
              playheadSec={playheadSec}
              onTextLayout={onTextLayout}
            />
          </div>
          <TimelineStrip
            timeline={present}
            playheadSec={playheadSec}
            onSelectItem={onSelectItem}
            onTimelineChange={onTimelineChange}
            onScaleChange={onScaleChange}
            {...(selected ? { selectedItemId: selected.itemId } : {})}
          />
        </div>
      </section>

      {/* القراءة — عرضٌ فقط */}
      <section className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="reels-play"
          aria-pressed={playing}
          aria-keyshortcuts="Space"
          aria-label={playing ? t('actions.pause') : t('actions.play')}
          title={playing ? t('actions.pause') : t('actions.play')}
          onClick={() => {
            setPlaying((v) => !v);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-surface-2 text-fg transition hover:border-fg-subtle"
        >
          <span aria-hidden className="text-sm leading-none">
            {playing ? '⏸' : '▶'}
          </span>
        </button>
        <div className="min-w-[12rem] flex-1">
          <input
            type="range"
            data-testid="reels-scrub"
            aria-label={t('pages.reels.scrubber')}
            title={t('pages.reels.scrubber')}
            min={0}
            max={present.duration}
            step={1 / SAMPLE.fps}
            value={Math.min(playheadSec, present.duration)}
            onChange={(e) => {
              setPlayheadSec(Number(e.target.value));
            }}
            className="w-full accent-accent"
          />
        </div>
        <div dir="ltr" className="tabular text-xs text-fg-muted">
          {formatNumber(round1(playheadSec), digitStyle)} /{' '}
          {formatNumber(SAMPLE.duration, digitStyle)}
        </div>
        <div
          role="group"
          aria-label={t('digits.switcher')}
          title={t('digits.switcher')}
        >
          <DigitStyleSwitcher />
        </div>
      </section>

      {/* التحرير — الإضافةُ · الشطر · الحذف · التراجع · الإعادة · التحريك */}
      <section className="mt-3 flex flex-wrap items-center gap-2">
        {/* «أضِفْ مساراً» — قائمةُ الأنواع الثلاثة (468 §٤). <details>
            الأصليّة: لا حالةَ قائمةٍ تُدارُ يدويّاً، والاختيارُ يغلقُها.
            موضعُ اللوحةِ بخصائصَ منطقيّة (insetInline/insetBlock). */}
        <details ref={addMenuRef} className="relative">
          <summary
            className={`${btn} list-none cursor-pointer [&::-webkit-details-marker]:hidden`}
            data-testid="reels-add-track"
            aria-haspopup="menu"
            aria-label={t('actions.addTrack')}
            title={t('actions.addTrack')}
          >
            <span aria-hidden className="text-sm leading-none">
              ＋
            </span>
            <span className="text-xs">{t('actions.addTrack')}</span>
          </summary>
          <div
            role="menu"
            aria-label={t('actions.addTrack')}
            className="absolute start-0 z-20 mt-1 flex flex-col rounded-sm border border-border bg-surface shadow-soft"
            style={{ insetBlockStart: '100%' }}
          >
            {(['media', 'text', 'audio'] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="menuitem"
                data-testid={`reels-add-track-${type}`}
                aria-label={`${t('actions.addTrack')} — ${t(`pages.reels.trackType.${type}`)}`}
                title={`${t('actions.addTrack')} — ${t(`pages.reels.trackType.${type}`)}`}
                onClick={() => pickTrackType(type)}
                className="flex items-center px-3 py-1.5 text-start text-xs text-fg transition hover:bg-surface-2"
              >
                {t(`pages.reels.trackType.${type}`)}
              </button>
            ))}
          </div>
        </details>
        {/* «أضِفْ قطعةً» — على المسار المحدَّد عند رأس القراءة، بـinsert
            (قرارُ المالك). معطَّلٌ حتى يُختارَ مسارٌ — قطعةٌ بلا مسارٍ
            لا معنى لها. */}
        <button
          type="button"
          data-testid="reels-add-item"
          aria-label={t('actions.addItem')}
          title={t('actions.addItem')}
          disabled={!canAddItem}
          onClick={addItemAtPlayhead}
          className={btn}
        >
          <span aria-hidden className="text-sm leading-none">
            ▪
          </span>
          <span className="text-xs">{t('actions.addItem')}</span>
        </button>
        <button
          type="button"
          data-testid="reels-split"
          aria-keyshortcuts="S"
          aria-label={t('actions.split')}
          title={t('actions.split')}
          disabled={!canSplit}
          onClick={splitSelected}
          className={btn}
        >
          <span aria-hidden className="text-sm leading-none">
            ✂
          </span>
          <span className="text-xs">{t('actions.split')}</span>
          <span aria-hidden className={kbd}>
            S
          </span>
        </button>
        <button
          type="button"
          data-testid="reels-delete"
          aria-keyshortcuts="Delete Backspace"
          aria-label={t('actions.delete')}
          title={t('actions.delete')}
          disabled={!canDelete}
          onClick={deleteSelected}
          className={btn}
        >
          <span aria-hidden className="text-sm leading-none">
            ⌫
          </span>
          <span className="text-xs">{t('actions.delete')}</span>
          <span aria-hidden className={kbd}>
            <Ltr>⌫ ⌦</Ltr>
          </span>
        </button>
        <button
          type="button"
          data-testid="reels-undo"
          aria-keyshortcuts="Meta+Z"
          aria-label={t('actions.undo')}
          title={t('actions.undo')}
          disabled={!canUndo}
          onClick={doUndo}
          className={btn}
        >
          <span aria-hidden className="text-sm leading-none">
            ↺
          </span>
          <span className="text-xs">{t('actions.undo')}</span>
          <span aria-hidden className={kbd}>
            <Ltr>⌘Z</Ltr>
          </span>
        </button>
        <button
          type="button"
          data-testid="reels-redo"
          aria-keyshortcuts="Meta+Shift+Z"
          aria-label={t('actions.redo')}
          title={t('actions.redo')}
          disabled={!canRedo}
          onClick={doRedo}
          className={btn}
        >
          <span aria-hidden className="text-sm leading-none">
            ↻
          </span>
          <span className="text-xs">{t('actions.redo')}</span>
          <span aria-hidden className={kbd}>
            <Ltr>⌘⇧Z</Ltr>
          </span>
        </button>
      </section>

      {/* تلميحٌ مرئيّ لكلّ اختصار — الرموز معزولة والكلمات من مفاتيح */}
      <p className="mt-2 text-xs text-fg-muted">
        <Ltr>␣</Ltr> {t('pages.reels.hintPlay')}
        <span aria-hidden> · </span>
        <Ltr>→ ←</Ltr> {t('pages.reels.hintNudge')}
        <span aria-hidden> · </span>
        <Ltr>[ ]</Ltr> {t('pages.reels.hintTrim')}
        <span aria-hidden> · </span>
        <Ltr>⌘</Ltr> {t('pages.reels.hintZoom')}
      </p>

      {/* لوحةُ الخصائص (469 §٤) — عند تحديدِ قطعةٍ تظهرُ حقولُ نوعِها
          وحدَه. كلُّ تعديلٍ عبر `apply` فيدخلُ التراجع، والمعاينةُ
          تتبدّلُ فوراً لأنّها تقرأ `present` نفسَه. */}
      {selectedItem && selectedTrack ? (
        <section
          className="mt-4"
          aria-label={t('pages.reels.properties')}
          data-testid="reels-properties"
        >
          <h2 className="text-xs uppercase tracking-widest text-fg-subtle">
            {t('pages.reels.properties')}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft md:grid-cols-4">
            <label className={fieldLbl}>
              <span>{t('pages.reels.start')}</span>
              <input
                type="number"
                data-testid="reels-prop-start"
                className={fieldIn}
                step={1 / SAMPLE.fps}
                value={selectedItem.start}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) editEdge('start', v);
                }}
              />
            </label>
            <label className={fieldLbl}>
              <span>{t('pages.reels.end')}</span>
              <input
                type="number"
                data-testid="reels-prop-end"
                className={fieldIn}
                step={1 / SAMPLE.fps}
                value={selectedItem.end}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) editEdge('end', v);
                }}
              />
            </label>
            {selectedTrack.type === 'text' ? (
              <>
                <label className={`${fieldLbl} col-span-2`}>
                  <span>{t('pages.reels.textValue')}</span>
                  <input
                    type="text"
                    dir="auto"
                    data-testid="reels-prop-value"
                    className={fieldIn}
                    value={selectedItem.value ?? ''}
                    onChange={(e) => {
                      setTextValue(e.target.value);
                    }}
                  />
                </label>
                <label className={fieldLbl}>
                  <span className="flex items-center justify-between gap-2">
                    <span>{t('pages.reels.anchor')}</span>
                    <span dir="ltr" className="tabular text-fg-subtle">
                      {formatNumber(
                        Math.round(anchorValue * 100) / 100,
                        digitStyle,
                      )}
                    </span>
                  </span>
                  {/* dir=ltr: ٠ يساراً و١ يميناً — الأرقامُ حتميّةُ
                      الترتيب، والموضعُ على الشاشة من الأعلى إلى الأسفل. */}
                  <input
                    type="range"
                    dir="ltr"
                    data-testid="reels-prop-anchor"
                    min={0}
                    max={1}
                    step={0.05}
                    value={anchorValue}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setTextAnchor(v);
                    }}
                  />
                </label>
                <label className={fieldLbl}>
                  <span>{t('pages.reels.offsetX')}</span>
                  <input
                    type="number"
                    data-testid="reels-prop-offset-x"
                    className={fieldIn}
                    step={1}
                    value={offsetValueX}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setTextOffsetX(v);
                    }}
                  />
                </label>
                <label className={fieldLbl}>
                  <span>{t('pages.reels.offsetY')}</span>
                  <input
                    type="number"
                    data-testid="reels-prop-offset-y"
                    className={fieldIn}
                    step={1}
                    value={offsetValueY}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setTextOffsetY(v);
                    }}
                  />
                </label>
              </>
            ) : null}
            {selectedTrack.type === 'media' ? (
              <>
                <label className={`${fieldLbl} col-span-2`}>
                  <span>{t('pages.reels.assetName')}</span>
                  <input
                    type="text"
                    dir="ltr"
                    data-testid="reels-prop-src"
                    className={fieldIn}
                    value={selectedItem.src ?? ''}
                    onChange={(e) => {
                      setMediaSrc(e.target.value);
                    }}
                  />
                </label>
                {kenBurnsEffect ? (
                  <>
                    <label className={fieldLbl}>
                      <span>
                        {t('pages.reels.kenBurns')} · {t('pages.reels.from')}
                      </span>
                      <input
                        type="number"
                        data-testid="reels-prop-kb-from"
                        className={fieldIn}
                        step={0.01}
                        value={kenBurnsFromValue}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setKenBurnsFrom(v);
                        }}
                      />
                    </label>
                    <label className={fieldLbl}>
                      <span>
                        {t('pages.reels.kenBurns')} · {t('pages.reels.to')}
                      </span>
                      <input
                        type="number"
                        data-testid="reels-prop-kb-to"
                        className={fieldIn}
                        step={0.01}
                        value={kenBurnsToValue}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setKenBurnsTo(v);
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </>
            ) : null}
            {selectedTrack.type === 'audio' ? (
              <label className={fieldLbl}>
                <span>{t('pages.reels.gain')}</span>
                <input
                  type="number"
                  data-testid="reels-prop-gain"
                  className={fieldIn}
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    typeof selectedItem.gain === 'number' ? selectedItem.gain : 1
                  }
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setAudioGain(v);
                  }}
                />
              </label>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* (469 §٣) نافذةُ القياس — صناديقُ النصوص من آخر إطارٍ كما
          يحسبُها المحرّك، يقرؤها السكربتُ ويفحصُ تقاطعَ المتداخلَين
          زمنيّاً. مقياسُ الصحّة لا الوجود. */}
      <span data-testid="reels-text-layout" hidden>
        {textLayout ? JSON.stringify(textLayout) : ''}
      </span>

      {/* قراءات — بياناتٌ فقط */}
      <section className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-muted">
        <span className="flex items-center gap-2">
          {t('pages.renders.col.duration')}
          <span
            dir="ltr"
            data-testid="reels-readout"
            className="tabular text-fg"
          >
            {formatNumber(present.duration, digitStyle)} ·{' '}
            {formatNumber(SAMPLE.fps, digitStyle)} ·{' '}
            {t(`pages.reels.size.${SAMPLE.size}`)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-success">
            ✓
          </span>
          <span dir="ltr" className="tabular">
            {selected
              ? selected.itemId
                ? `${selected.trackId} / ${selected.itemId}`
                : selected.trackId
              : '—'}
          </span>
        </span>
      </section>
    </main>
  );
}
