'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  PageHeader,
  Table,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, templates } from '@/src/api';
import type {
  TemplateKind,
  TemplateListItem,
  TemplateScope,
} from '@/src/api/endpoints/templates';

// S11 — القوالب. القالب العام للقراءة فقط — الواجهة تعرض ذلك
// **قبل** المحاولة (شارة «للقراءة فقط» بجوار الأزرار المعطَّلة)،
// و 403 GLOBAL_TEMPLATE_READONLY يبقى معالَجاً كاحتياط.
//
// النسخ: لا endpoint /duplicate في العقد. GET :id ثم POST / بالتعريف
// (نقرة واحدة للمستخدم، طلبان تحتها).

const SCOPES: readonly (TemplateScope | 'all')[] = ['all', 'global', 'tenant'];
const KINDS: readonly (TemplateKind | 'all')[] = ['all', 'static', 'video'];

export default function TemplatesPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<TemplateScope | 'all'>('all');
  const [kind, setKind] = useState<TemplateKind | 'all'>('all');
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  const [busyDupId, setBusyDupId] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<TemplateListItem | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const filter: Record<string, TemplateScope | TemplateKind> = {};
      if (scope !== 'all') filter.scope = scope;
      if (kind !== 'all') filter.kind = kind;
      const opts = Object.keys(filter).length > 0 ? { filter } : {};
      const page = await templates.list(opts as Parameters<typeof templates.list>[0]);
      setRows([...page.data]);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, kind]);

  async function duplicate(row: TemplateListItem): Promise<void> {
    setBusyDupId(row.id);
    setActionErrorKey(null);
    try {
      const full = await templates.get(row.id);
      await templates.create({
        name: full.name + t('pages.templates.duplicateSuffix'),
        kind: full.kind,
        definition: full.definition,
      });
      await refresh();
    } catch (err) {
      setActionErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setBusyDupId(null);
    }
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDeleteErrorKey(null);
    try {
      await templates.remove(toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDeleteErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  const columns: readonly Column<TemplateListItem>[] = [
    {
      key: 'name',
      headerKey: 'pages.templates.col.name',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {r.scope === 'global' && (
            <Badge tone="neutral">{t('pages.templates.readOnly')}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'scope',
      headerKey: 'pages.templates.col.scope',
      render: (r) => (
        <Badge tone={r.scope === 'global' ? 'accent' : 'success'}>
          {t(`pages.templates.scope.${r.scope}`)}
        </Badge>
      ),
    },
    {
      key: 'kind',
      headerKey: 'pages.templates.col.kind',
      render: (r) => <Badge tone="neutral">{t(`pages.templates.kind.${r.kind}`)}</Badge>,
    },
    {
      key: 'actions',
      headerKey: 'pages.templates.col.actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={busyDupId === r.id}
            onClick={() => duplicate(r)}
          >
            {t('pages.templates.duplicate')}
          </Button>
          {r.scope === 'tenant' && (
            <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
              {t('pages.templates.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.templates.title"
        subtitleKey="pages.templates.subtitle"
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="text-xs text-fg-subtle">{t('pages.templates.scope.label')}:</div>
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={
              'rounded border px-3 py-1 text-xs ' +
              (s === scope
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-fg-muted hover:text-fg')
            }
          >
            {t(`pages.templates.scope.${s}`)}
          </button>
        ))}
        <div className="ms-6 text-xs text-fg-subtle">{t('pages.templates.kind.label')}:</div>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              'rounded border px-3 py-1 text-xs ' +
              (k === kind
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-fg-muted hover:text-fg')
            }
          >
            {t(`pages.templates.kind.${k}`)}
          </button>
        ))}
      </div>

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}
      {actionErrorKey && <Alert kind="danger" titleKey={actionErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState titleKey="pages.templates.empty" bodyKey="pages.templates.emptyBody" />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.templates.empty"
        />
      )}

      <Dialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDeleteErrorKey(null);
        }}
        titleKey="pages.templates.confirmDelete"
        bodyKey="pages.templates.confirmDeleteBody"
        confirmKey="pages.templates.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {deleteErrorKey && <Alert kind="danger" titleKey={deleteErrorKey} />}
      </Dialog>
    </div>
  );
}
