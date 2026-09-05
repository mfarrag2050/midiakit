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
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
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
