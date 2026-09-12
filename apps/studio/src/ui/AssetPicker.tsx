'use client';

// AssetPicker — Dialog يعرض قائمة الأصول المصفَّاة بـkind ويعيد assetId المختار.
// **قاعدة L-22:** لا نصوص عربية داخل هذا المكوّن — كل النصوص عبر `t(key)`.

import { useEffect, useState } from 'react';
import { Button, Table, type Column } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, assets, bytesShort } from '@/src/api';
import type { AssetKind, AssetListItem } from '@/src/api/endpoints/assets';

interface Props {
  readonly open: boolean;
  readonly kind: AssetKind;
  readonly onSelect: (a: AssetListItem) => void;
  readonly onClose: () => void;
}

export function AssetPicker({ open, kind, onSelect, onClose }: Props): JSX.Element | null {
  const { t } = useLocale();
  const [rows, setRows] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErrorKey(null);
    assets
      .list({ filter: { kind } })
      .then((page) => setRows([...page.data]))
      .catch((err: unknown) => {
        setErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
      })
      .finally(() => setLoading(false));
  }, [open, kind]);

  if (!open) return null;

  const columns: readonly Column<AssetListItem>[] = [
    {
      key: 'filename',
      headerKey: 'pages.assets.col.filename',
      render: (r) => <span className="font-medium">{r.filename}</span>,
    },
    {
      key: 'size',
      headerKey: 'pages.assets.col.size',
      align: 'numeric',
      render: (r) => <span>{bytesShort(r.sizeBytes)}</span>,
    },
    {
      key: 'action',
      headerKey: 'pages.assets.col.action',
      align: 'center',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => onSelect(r)}>
          {t('pages.assets.picker.pick')}
        </Button>
      ),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="asset-picker"
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="asset-picker-title" className="text-lg font-semibold">
            {t('pages.assets.picker.title')}
          </h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </div>
        {errorKey && (
          <div className="mb-3 rounded border border-danger bg-danger/10 p-3 text-sm">
            {t(errorKey)}
          </div>
        )}
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.assets.picker.empty"
        />
      </div>
    </div>
  );
}
