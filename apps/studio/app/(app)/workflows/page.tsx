'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import { ApiError, workflows } from '@/src/api';
import type {
  WorkflowFull,
  WorkflowState,
  WorkflowSummary,
  WorkflowTransition,
} from '@/src/api/endpoints/workflows';

// S14 — قائمة سير العمل + presets + إنشاء أوّل. المحرّر في [id].
// **مبدأ:** الحالات والانتقالات + requiredRole + requiresReason **قواعد
// بيانات** (JSON على الخادم عبر POST /v1/workflows) — لا كود مثبَّت.

interface Preset {
  key: 'individual' | 'smallTeam' | 'fullAgency';
  name: string;
  kind: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

function buildPresets(): Preset[] {
  return [
    {
      key: 'individual',
      name: 'individual',
      kind: 'individual',
      states: [
        { id: 'draft', label: 'مسودّة', assignableTo: ['writer'] },
        { id: 'review', label: 'قيد المراجعة', assignableTo: ['reviewer'] },
        { id: 'approved', label: 'معتمد', assignableTo: [] },
      ],
      transitions: [
        { id: 'trn_submit',  from: 'draft',  to: 'review',    label: 'إرسال للمراجعة', requiredRole: 'writer',   requiresReason: false },
        { id: 'trn_return',  from: 'review', to: 'draft',     label: 'إرجاع للتحرير',  requiredRole: 'reviewer', requiresReason: true  },
        { id: 'trn_approve', from: 'review', to: 'approved',  label: 'اعتماد',        requiredRole: 'reviewer', requiresReason: false },
      ],
    },
    {
      key: 'smallTeam',
      name: 'small-team',
      kind: 'small-team',
      states: [
        { id: 'draft',    label: 'مسودّة',      assignableTo: ['writer', 'editor'] },
        { id: 'editing',  label: 'قيد التحرير', assignableTo: ['editor'] },
        { id: 'review',   label: 'قيد المراجعة', assignableTo: ['reviewer'] },
        { id: 'approved', label: 'معتمد',       assignableTo: [] },
      ],
      transitions: [
        { id: 'trn_to_editing', from: 'draft',    to: 'editing',  label: 'إحالة للتحرير', requiredRole: 'writer',   requiresReason: false },
        { id: 'trn_to_review',  from: 'editing',  to: 'review',   label: 'إرسال للمراجعة', requiredRole: 'editor',   requiresReason: false },
        { id: 'trn_return',     from: 'review',   to: 'editing',  label: 'إرجاع للتحرير',  requiredRole: 'reviewer', requiresReason: true  },
        { id: 'trn_approve',    from: 'review',   to: 'approved', label: 'اعتماد',        requiredRole: 'reviewer', requiresReason: false },
      ],
    },
    {
      key: 'fullAgency',
      name: 'full-agency',
      kind: 'full-agency',
      states: [
        { id: 'draft',      label: 'مسودّة',        assignableTo: ['writer'] },
        { id: 'editing',    label: 'قيد التحرير',   assignableTo: ['editor'] },
        { id: 'review',     label: 'قيد المراجعة',   assignableTo: ['reviewer'] },
        { id: 'legal',      label: 'مراجعة قانونية', assignableTo: ['admin'] },
        { id: 'approved',   label: 'معتمد',         assignableTo: [] },
        { id: 'archived',   label: 'مؤرشف',         assignableTo: [] },
      ],
      transitions: [
        { id: 'trn_to_editing', from: 'draft',    to: 'editing',  label: 'إحالة للتحرير',  requiredRole: 'writer',   requiresReason: false },
        { id: 'trn_to_review',  from: 'editing',  to: 'review',   label: 'إرسال للمراجعة',  requiredRole: 'editor',   requiresReason: false },
        { id: 'trn_return',     from: 'review',   to: 'editing',  label: 'إرجاع للتحرير',   requiredRole: 'reviewer', requiresReason: true  },
        { id: 'trn_to_legal',   from: 'review',   to: 'legal',    label: 'إحالة قانونية',   requiredRole: 'reviewer', requiresReason: false },
        { id: 'trn_approve',    from: 'legal',    to: 'approved', label: 'اعتماد',         requiredRole: 'admin',    requiresReason: false },
        { id: 'trn_archive',    from: 'approved', to: 'archived', label: 'أرشفة',          requiredRole: 'admin',    requiresReason: false },
      ],
    },
  ];
}

export default function WorkflowsPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<Preset['key']>('individual');
  const [creating, setCreating] = useState(false);
  const [createErrorKey, setCreateErrorKey] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<WorkflowSummary | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const page = await workflows.list();
      setRows([...page.data]);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doCreate(): Promise<void> {
    setCreating(true);
    setCreateErrorKey(null);
    try {
      const p = buildPresets().find((x) => x.key === preset);
      if (!p) return;
      const created = await workflows.create({
        name: name.trim() || p.name,
        kind: p.kind,
        states: p.states,
        transitions: p.transitions,
      });
      setCreateOpen(false);
      setName('');
      await refresh();
      // إبقاء العميل على القائمة — للاطّلاع على المحرّر يستطيع الضغط على الصف.
      void created;
    } catch (err) {
      setCreateErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCreating(false);
    }
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDeleteErrorKey(null);
    try {
      await workflows.remove(toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDeleteErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  const columns: readonly Column<WorkflowSummary>[] = [
    {
      key: 'name',
      headerKey: 'pages.workflows.nameLabel',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/workflows/${encodeURIComponent(r.id)}`}
            className="font-medium text-accent hover:underline"
          >
            {r.name}
          </Link>
          {r.isDefault && (
            <Badge tone="success">{t('pages.workflows.isDefault')}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      headerKey: 'pages.projects.col.actions',
      align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
          {t('pages.workflows.delete')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.workflows.title"
        subtitleKey="pages.workflows.subtitle"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            {t('pages.workflows.create')}
          </Button>
        }
      />

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState
          titleKey="pages.workflows.empty"
          bodyKey="pages.workflows.emptyBody"
        />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.workflows.empty"
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        titleKey="pages.workflows.createTitle"
        confirmKey="pages.workflows.create"
        onConfirm={doCreate}
      >
        <div className="space-y-4">
          {createErrorKey && <Alert kind="danger" titleKey={createErrorKey} />}
          <Field labelKey="pages.workflows.nameLabel" htmlFor="wf-name">
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
            />
          </Field>
          <div>
            <div className="mb-2 text-xs text-fg-subtle">
              {t('pages.workflows.presets.label')}
            </div>
            <div className="space-y-2">
              {(['individual', 'smallTeam', 'fullAgency'] as const).map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface-2 p-3 text-sm hover:border-accent"
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={preset === k}
                    onChange={() => setPreset(k)}
                    disabled={creating}
                  />
                  <span>{t(`pages.workflows.presets.${k}`)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDeleteErrorKey(null);
        }}
        titleKey="pages.workflows.confirmDelete"
        bodyKey="pages.workflows.confirmDeleteBody"
        confirmKey="pages.workflows.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {deleteErrorKey && <Alert kind="danger" titleKey={deleteErrorKey} />}
      </Dialog>
    </div>
  );
}
