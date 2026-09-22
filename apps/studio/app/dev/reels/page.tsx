'use client';

// /dev/reels — صفحة تطوير لمحرّر الخطّ الزمني (reels/453 → 454 → 456 → 458 → 462 → 463 → 464).
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

import { useCallback, useEffect, useState } from 'react';
import { useLocale, Ltr } from '@pf-mediakit/i18n';
import type { Timeline } from '@pf-mediakit/shared';
import { TimelineStrip, SNAP_PX, labelStepFor } from '@/src/reels/TimelineStrip';
import { TimelinePreview } from '@/src/reels/TimelinePreview';
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
        // `kenBurns` من مؤثّراتنا المسمّاة في 464 — لا ترسمُ شيئاً بعدُ
        // في المحرّك الحاليّ، وتبقى عهداً مكشوفاً في التقرير.
        { id: 'clip-01', start: 0, end: 9.5, src: 'asset:reel-a',
          effects: [
            { type: 'draw-media', assetKey: 'asset:reel-a' },
            { type: 'kenBurns' },
          ] },
        { id: 'clip-02', start: 9.5, end: 18, src: 'asset:reel-b',
          effects: [
            { type: 'draw-media', assetKey: 'asset:reel-b' },
            { type: 'kenBurns' },
          ] },
        { id: 'clip-03', start: 18, end: 32, src: 'asset:reel-c',
          effects: [
            { type: 'draw-media', assetKey: 'asset:reel-c' },
            { type: 'kenBurns' },
          ] },
      ],
    },
    {
      id: 'trk-text',
      type: 'text',
      index: 1,
      items: [
        // 464: سطورُ النصّ تُرسمُ بـ`text-item-lines` من الخطّة — والقيمةُ
        // نصٌّ عربيٌّ حقيقيٌّ من اختراع هذه الصفحة، لا اسمَ جهةٍ ولا علامةً.
        { id: 'title-01', start: 0.5, end: 7,
          effects: [{ type: 'text-item-lines' }],
          value: 'الإيقاعُ السريعُ يشدُّ المشاهدَ من أوّلِ ثانية' },
        { id: 'title-02', start: 7, end: 14,
          effects: [{ type: 'text-item-lines' }],
          value: 'كلُّ لقطةٍ تخدمُ الحكايةَ ولا تحيدُ عنها' },
        { id: 'title-03', start: 20, end: 28,
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

interface Selection {
  readonly trackId: string;
  readonly itemId: string;
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

  const present = history.present;

  // الاختيار قد يفقد عنصره (حذف · تراجع) — يُنسف لا أن يُعلَّق.
  useEffect(() => {
    if (!selected) return;
    const track = present.tracks.find((tr) => tr.id === selected.trackId);
    if (!track || !track.items.some((it) => it.id === selected.itemId)) {
      setSelected(null);
    }
  }, [present, selected]);

  const onSelectItem = useCallback((trackId: string, itemId: string): void => {
    setSelected({ trackId, itemId });
  }, []);

  const onScaleChange = useCallback((v: number): void => {
    setPxPerSec(v);
  }, []);

  const onTimelineChange = useCallback((next: Timeline): void => {
    setHistory((h) => (timelineEq(h.present, next) ? h : apply(h, () => next)));
  }, []);

  const selectedTrack = selected
    ? present.tracks.find((tr) => tr.id === selected.trackId)
    : undefined;
  const selectedItem = selectedTrack?.items.find((it) => it.id === selected?.itemId);
  const canSplit =
    !!selectedItem && playheadSec > selectedItem.start && playheadSec < selectedItem.end;
  const canDelete = !!selectedItem;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const splitSelected = useCallback((): void => {
    if (!selected) return;
    setHistory((h) => {
      const next = splitItem(h.present, selected.trackId, selected.itemId, playheadSec);
      return timelineEq(h.present, next) ? h : apply(h, () => next);
    });
  }, [playheadSec, selected]);

  const deleteSelected = useCallback((): void => {
    if (!selected) return;
    const { trackId, itemId } = selected;
    setHistory((h) => apply(h, (tl) => removeItem(tl, trackId, itemId)));
    setSelected(null);
  }, [selected]);

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
      if (!selected) return;
      setHistory((h) => {
        const next = snapMove(
          h.present,
          selected.trackId,
          selected.itemId,
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
      if (!selected) return;
      setHistory((h) => {
        const it = h.present.tracks
          .find((tr) => tr.id === selected.trackId)
          ?.items.find((i) => i.id === selected.itemId);
        if (!it) return h;
        // القصّ = تقصير: البدايةُ تتقدّم والنهايةُ تتأخّر.
        const to = edge === 'start' ? it.start + stepSec : it.end - stepSec;
        const next = snapTrim(
          h.present,
          selected.trackId,
          selected.itemId,
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

  // تشغيل القراءة: rAF يقدّم playheadSec ويُعيد من الصفر عند المدّة.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayheadSec((p) => {
        const next = p + dt;
        return next >= SAMPLE.duration ? 0 : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  const btn =
    'flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2.5 text-fg transition hover:border-fg-subtle disabled:opacity-40 disabled:hover:border-border';
  const kbd = 'tabular text-[10px] text-fg-subtle';

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
            <TimelinePreview timeline={present} playheadSec={playheadSec} />
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
            max={SAMPLE.duration}
            step={1 / SAMPLE.fps}
            value={Math.min(playheadSec, SAMPLE.duration)}
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

      {/* التحرير — الشطر · الحذف · التراجع · الإعادة · التحريك */}
      <section className="mt-3 flex flex-wrap items-center gap-2">
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

      {/* قراءات — بياناتٌ فقط */}
      <section className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-muted">
        <span className="flex items-center gap-2">
          {t('pages.renders.col.duration')}
          <span
            dir="ltr"
            data-testid="reels-readout"
            className="tabular text-fg"
          >
            {formatNumber(SAMPLE.duration, digitStyle)} ·{' '}
            {formatNumber(SAMPLE.fps, digitStyle)} ·{' '}
            {t(`pages.reels.size.${SAMPLE.size}`)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-success">
            ✓
          </span>
          <span dir="ltr" className="tabular">
            {selected ? `${selected.trackId} / ${selected.itemId}` : '—'}
          </span>
        </span>
      </section>
    </main>
  );
}
