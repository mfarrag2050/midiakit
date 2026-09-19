'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@pf-mediakit/i18n';

// Table عام. يستقبل أعمدة معرَّفة و rows، يرسم رأساً وسطراً لكل سجل.
// **RTL:** لا `text-left` — نستعمل `text-start` كي تنعكس تلقائياً.
// `Cell.align='numeric'` يفرض `text-end` + tabular-nums لعمود أرقام
// نظيف بصرياً بغضّ النظر عن الاتجاه.

export type CellAlign = 'text' | 'numeric' | 'center';

export interface Column<T> {
  readonly key: string;
  readonly headerKey: string;
  readonly align?: CellAlign;
  readonly width?: string;
  readonly render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly getRowKey: (row: T, index: number) => string;
  readonly loading?: boolean;
  readonly emptyKey?: string;
}

function alignClass(a: CellAlign | undefined): string {
  if (a === 'numeric') return 'text-end tabular';
  if (a === 'center') return 'text-center';
  return 'text-start';
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyKey = 'table.empty',
}: Props<T>): JSX.Element {
  const { t } = useLocale();
  return (
    // 240-PHONE-WIDTH: تمرير أفقيّ داخل الجدول على الشاشات الضيقة كي
    // لا تنكسر الصفحة كلّها. `min-w-max` يحفظ صفوف الجدول من الالتفاف
    // القبيح · `-webkit-overflow-scrolling` للتمرير باللمس.
    //
    // ٤٥٠ §١: **إصلاحُ التنفيذ المكسور من ٤١٠ §٣.** التنفيذُ السابق
    // استعمل `#fff` كلون قناع (`var(--pfmk-surface, #fff)` — المتغيّر
    // غيرُ معرَّف في tokens، فيسقط إلى الأبيض) على واجهةٍ داكنة، فيمحو
    // عمودَ «القالب» بدل أن يلمّح إليه. الآن:
    //   ١) لون القناع = `var(--surface)` نفسُه لون تراوت خلف الجدول،
    //      لا `#fff`. القيمة الحقيقيّة الحاليّة `#12151a` (tokens.css).
    //   ٢) `bg-surface` صريحٌ على الحاوية — حتى يتطابق القناع مع
    //      البكسل الفعليّ الذي ستحلّ محلّه.
    //   ٣) عرضُ القناع 10px بدل 32px · عرضُ الظلّ 8px بدل 14px — يلمّح
    //      إلى الحافة، لا يغطّي عموداً.
    //   ٤) شدّةُ الظلّ خفيفة (rgba(0,0,0,0.24)) لا يبتلع البكسل خلفه.
    <div
      className="overflow-x-auto rounded-lg border border-border bg-surface"
      style={{
        background:
          'linear-gradient(to right, var(--surface) 30%, transparent),' +
          'linear-gradient(to right, transparent, var(--surface) 70%) 100% 0,' +
          'radial-gradient(farthest-side at 0 50%, rgba(0,0,0,0.24), rgba(0,0,0,0)),' +
          'radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,0.24), rgba(0,0,0,0)) 100% 0',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '10px 100%, 10px 100%, 8px 100%, 8px 100%',
        backgroundAttachment: 'local, local, scroll, scroll',
        backgroundColor: 'var(--surface)',
      }}
    >
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={
                  'border-b border-border px-4 py-2 font-medium ' +
                  alignClass(c.align)
                }
                style={c.width ? { width: c.width } : undefined}
              >
                {t(c.headerKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              {/* ٤٧٠ §٢ · هيكلٌ رماديّ (skeleton) بدل سطرٍ واحد يقول
                 «جارٍ التحميل…» — على الشبكة البطيئة (نفق) الفارق
                 يظهر: يرى المستخدم شكلَ الجدول قادماً، لا فراغاً بلا
                 وعد. سطرٌ نصّيٌّ أوّلاً حتى يقرأ قارئُ الشاشة سياقاً،
                 ثمّ ٥ صفوفٍ متذبذبة عرضاً. */}
              <tr>
                <td
                  colSpan={columns.length}
                  className="border-b border-border/40 px-4 py-2 text-center text-xs text-fg-muted"
                >
                  {t('table.loading')}
                </td>
              </tr>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  aria-hidden="true"
                  className="border-b border-border/40"
                >
                  {columns.map((c, j) => (
                    <td key={c.key} className="px-4 py-3">
                      {/* ٤٧٠ §٢ · Tailwind `bg-color/N` لا يعمل مع
                         CSS-var-based colors — نستعمل token `--border`
                         مباشرةً (وهو rgba(255,255,255,0.08) في tokens.css)
                         عبر className مقبولة `bg-border` من tailwind preset. */}
                      <div
                        className="h-3 rounded bg-border motion-safe:animate-pulse"
                        style={{ width: `${45 + ((i * 13 + j * 7) % 40)}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-xs text-fg-muted"
              >
                {t(emptyKey)}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                className="border-b border-border/60 last:border-0 hover:bg-surface-2/50"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={
                      'px-4 py-2.5 text-fg ' + alignClass(c.align)
                    }
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
