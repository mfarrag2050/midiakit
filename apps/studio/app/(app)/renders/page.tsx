'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Table,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, renders } from '@/src/api';
import type { RenderRow, RenderStatus } from '@/src/api/endpoints/renders';

// S17+S18 — قائمة التصديرات + إلغاء + رابط المخرَج.
// **انحراف #S17-1:** POST /:id/cancel يعيد **202** مع
// `{id, status:'cancelled'}` (العقد يقول 204). الواجهة تقرأ الحالة
// من الجسم، لا تفترض 204 لإخفاء الصفّ.

const STATUS_TONE: Record<RenderStatus, 'neutral' | 'warning' | 'success' | 'danger' | 'accent'> = {
  queued: 'neutral',
  running: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'accent',
  cancelling: 'warning',
};

const TERMINAL: RenderStatus[] = ['succeeded', 'failed', 'cancelled'];

export default function RendersPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<RenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [cancelErrorKey, setCancelErrorKey] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const page = await renders.list();
      setRows([...page.data]);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doCancel(id: string): Promise<void> {
    setCancelBusyId(id);
    setCancelErrorKey(null);
    try {
      const res = await renders.cancel(id);
      // نقرأ الحالة من الجسم — لا نفترض 204 كإشارة نجاح صامتة.
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: res.status } : r))
      );
    } catch (err) {
      setCancelErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCancelBusyId(null);
    }
  }

  const columns: readonly Column<RenderRow>[] = [
    {
      key: 'id',
      headerKey: 'pages.renders.col.id',
      render: (r) => (
        <span dir="ltr" className="text-[10px] text-fg-subtle">
          {r.id.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: 'project',
      headerKey: 'pages.renders.col.project',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-muted">
          {r.project_id.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: 'status',
      headerKey: 'pages.renders.col.status',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
          {t(`pages.renders.status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'format',
      headerKey: 'pages.renders.col.format',
      render: (r) => <Badge tone="neutral">{r.format}</Badge>,
    },
    {
      key: 'size',
      headerKey: 'pages.renders.col.size',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-muted">
          {r.size}
        </span>
      ),
    },
    {
      key: 'created',
      headerKey: 'pages.renders.col.created',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-subtle">
          {r.createdAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'duration',
      headerKey: 'pages.renders.col.duration',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-muted">
          {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      headerKey: 'pages.renders.col.actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-2">
          {r.status === 'succeeded' && r.output_url && (
            <a
              href={r.output_url}
              className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-accent hover:underline"
            >
              {t('pages.renders.download')}
            </a>
          )}
          {!TERMINAL.includes(r.status) && (
            <Button
              variant="ghost"
              size="sm"
              loading={cancelBusyId === r.id}
              onClick={() => void doCancel(r.id)}
            >
              {t('pages.renders.cancel')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.renders.title"
        subtitleKey="pages.renders.subtitle"
      />

      <p className="text-xs text-fg-subtle">{t('pages.renders.queueNote')}</p>

      {listErrorKey && (
        <Alert
          kind={listErrorKey.endsWith('QUOTA_EXCEEDED_RENDERS') ? 'warning' : 'danger'}
          titleKey={
            listErrorKey.endsWith('QUOTA_EXCEEDED_RENDERS')
              ? 'pages.renders.quotaExceeded'
              : listErrorKey
          }
        />
      )}
      {cancelErrorKey && <Alert kind="danger" titleKey={cancelErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState
          titleKey="pages.renders.empty"
          bodyKey="pages.renders.emptyBody"
        />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.renders.empty"
        />
      )}
    </div>
  );
}
