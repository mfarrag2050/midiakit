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
    // ٤١٠ §٣: `scroll-shadow` بتقنية Roman Komarov — أربعُ خلفياتٍ
    // متزامنة، اثنتان بلون سطح الحاوية (local) واثنتان ظلٌّ رماديّ
    // (scroll). حين يكون فيه محتوى مخفيّ يمنة/يسرة يظهر الظلّ على تلك
    // الحافة. يخبر اللمسَ أن ثمّة أعمدةً خارج القماش دون شريط تمرير.
    <div
      className="overflow-x-auto rounded-lg border border-border"
      style={{
        background:
          'linear-gradient(to right, var(--pfmk-surface, #fff) 30%, rgba(255,255,255,0)),' +
          'linear-gradient(to right, rgba(255,255,255,0), var(--pfmk-surface, #fff) 70%) 100% 0,' +
          'radial-gradient(farthest-side at 0 50%, rgba(0,0,0,0.18), rgba(0,0,0,0)),' +
          'radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,0.18), rgba(0,0,0,0)) 100% 0',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '32px 100%, 32px 100%, 14px 100%, 14px 100%',
        backgroundAttachment: 'local, local, scroll, scroll',
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
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-xs text-fg-muted"
              >
                {t('table.loading')}
              </td>
            </tr>
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
