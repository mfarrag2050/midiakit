'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, brandKits, projects, templates } from '@/src/api';
import type { ProjectSummary } from '@/src/api/endpoints/projects';
import { REEL_TEMPLATE_ENABLED } from '@/src/config/features';

// S12 — قائمة المشاريع + إنشاء + حذف. المحرّر في /projects/[id].
// **العقد المرجعي:** docs/16 §7.1 §7.3 §7.5 · §11.6 (currentState).
// 409 PROJECT_HAS_RENDERS يظهر رسالة مترجَمة داخل حوار الحذف (لا تعطيل زر).

type StateFilter = 'all' | 'draft' | 'review' | 'approved' | 'archived';
const STATES: readonly StateFilter[] = ['all', 'draft', 'review', 'approved', 'archived'];

const STATE_TONE: Record<string, 'neutral' | 'success' | 'accent' | 'warning'> = {
  draft: 'neutral',
  review: 'warning',
  approved: 'success',
  archived: 'accent',
};

export default function ProjectsPage(): JSX.Element {
  const { t } = useLocale();

  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);
  const [state, setState] = useState<StateFilter>('all');

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBrandKit, setNewBrandKit] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newLocale, setNewLocale] = useState<'ar' | 'en'>('ar');
  const [createBusy, setCreateBusy] = useState(false);
  const [createErrorKey, setCreateErrorKey] = useState<string | null>(null);

  // brand kits + templates (loaded on create-dialog open)
  const [bkOptions, setBkOptions] = useState<{ id: string; name: string }[]>([]);
  const [tplOptions, setTplOptions] = useState<{ id: string; name: string }[]>([]);
  const [pickerErrorKey, setPickerErrorKey] = useState<string | null>(null);

  // delete dialog
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const filter: Record<string, string> = {};
      if (state !== 'all') filter.state = state;
      const page = await projects.list(
        Object.keys(filter).length > 0 ? { filter } : {}
      );
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
  }, [state]);

  async function openCreate(): Promise<void> {
    setCreateOpen(true);
    setPickerErrorKey(null);
    setCreateErrorKey(null);
    setNewTitle('');
    setNewLocale('ar');
    try {
      const [bkPage, tplPage] = await Promise.all([
        brandKits.list(),
        templates.list(),
      ]);
      // REEL-HIDE: أخفِ قوالب الفيديو (kind === 'video') من قائمة الاختيار.
      const visibleTemplates = REEL_TEMPLATE_ENABLED
        ? tplPage.data
        : tplPage.data.filter((tt) => tt.kind !== 'video');
      setBkOptions([...bkPage.data.map((k) => ({ id: k.id, name: k.name }))]);
      setTplOptions([...visibleTemplates.map((tt) => ({ id: tt.id, name: tt.name }))]);
      setNewBrandKit(bkPage.data[0]?.id ?? '');
      setNewTemplate(visibleTemplates[0]?.id ?? '');
    } catch (err) {
      setPickerErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    }
  }

  async function doCreate(): Promise<void> {
    setCreateBusy(true);
    setCreateErrorKey(null);
    try {
      await projects.create({
        title: newTitle.trim(),
        brand_kit_id: newBrandKit,
        template_id: newTemplate,
        locale: newLocale,
      });
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setCreateErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCreateBusy(false);
    }
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDeleteErrorKey(null);
    try {
      await projects.remove(toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDeleteErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  const tplName = useMemo(
    () => new Map(tplOptions.map((tt) => [tt.id, tt.name])),
    [tplOptions]
  );
  const bkName = useMemo(
    () => new Map(bkOptions.map((k) => [k.id, k.name])),
    [bkOptions]
  );

  const columns: readonly Column<ProjectSummary>[] = [
    {
      key: 'title',
      headerKey: 'pages.projects.col.title',
      render: (r) => (
        <Link
          href={`/projects/${encodeURIComponent(r.id)}`}
          className="font-medium text-accent hover:underline"
        >
          {r.title}
        </Link>
      ),
    },
    {
      key: 'state',
      headerKey: 'pages.projects.col.state',
      render: (r) => (
        <Badge tone={STATE_TONE[r.currentState] ?? 'neutral'}>
          {t(`pages.projects.state.${r.currentState}`)}
        </Badge>
      ),
    },
    {
      key: 'brand',
      headerKey: 'pages.projects.col.brandKit',
      render: (r) => (
        <span className="text-fg-muted">
          {bkName.get(r.brand_kit_id) ?? r.brand_kit_id}
        </span>
      ),
    },
    {
      key: 'template',
      headerKey: 'pages.projects.col.template',
      render: (r) => (
        <span className="text-fg-muted">
          {tplName.get(r.template_id) ?? r.template_id}
        </span>
      ),
    },
    {
      key: 'assignee',
      headerKey: 'pages.projects.col.assignee',
      render: (r) => (
        <span className="text-fg-subtle">
          {r.assigneeId ?? t('pages.projects.assignee.unassigned')}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      headerKey: 'pages.projects.col.updatedAt',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-subtle">
          {r.updatedAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'actions',
      headerKey: 'pages.projects.col.actions',
      align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
          {t('pages.projects.delete')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.projects.title"
        subtitleKey="pages.projects.subtitle"
        action={
          <Button onClick={() => void openCreate()}>
            {t('pages.projects.create')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs text-fg-subtle">
          {t('pages.projects.filter.state')}:
        </div>
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={
              'rounded border px-3 py-1 text-xs ' +
              (s === state
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-fg-muted hover:text-fg')
            }
          >
            {s === 'all'
              ? t('pages.projects.filter.all')
              : t(`pages.projects.state.${s}`)}
          </button>
        ))}
      </div>

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState
          titleKey="pages.projects.empty"
          bodyKey="pages.projects.emptyBody"
        />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.projects.empty"
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        titleKey="pages.projects.createTitle"
        confirmKey="pages.projects.create"
        onConfirm={doCreate}
      >
        <div className="space-y-4">
          {pickerErrorKey && <Alert kind="danger" titleKey={pickerErrorKey} />}
          {createErrorKey && <Alert kind="danger" titleKey={createErrorKey} />}
          <Field labelKey="pages.projects.titleLabel" htmlFor="prj-title" required>
            <Input
              id="prj-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={createBusy}
            />
          </Field>
          <Field labelKey="pages.projects.brandKitLabel" htmlFor="prj-brand" required>
            <select
              id="prj-brand"
              value={newBrandKit}
              onChange={(e) => setNewBrandKit(e.target.value)}
              disabled={createBusy || bkOptions.length === 0}
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
            >
              {bkOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </Field>
          <Field labelKey="pages.projects.templateLabel" htmlFor="prj-tpl" required>
            <select
              id="prj-tpl"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              disabled={createBusy || tplOptions.length === 0}
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
            >
              {tplOptions.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </Field>
          <Field labelKey="pages.projects.localeLabel" htmlFor="prj-locale">
            <select
              id="prj-locale"
              value={newLocale}
              onChange={(e) => setNewLocale(e.target.value as 'ar' | 'en')}
              disabled={createBusy}
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
            >
              <option value="ar">ar</option>
              <option value="en">en</option>
            </select>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDeleteErrorKey(null);
        }}
        titleKey="pages.projects.confirmDelete"
        bodyKey="pages.projects.confirmDeleteBody"
        confirmKey="pages.projects.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {deleteErrorKey && <Alert kind="danger" titleKey={deleteErrorKey} />}
      </Dialog>
    </div>
  );
}
