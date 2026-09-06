'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  PageHeader,
  Table,
  Textarea,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import {
  ApiError,
  projects,
  renders,
  revisions,
  templates,
} from '@/src/api';
import type { ProjectFull, ProjectState } from '@/src/api/endpoints/projects';
import type { Template } from '@/src/api/endpoints/templates';
import type { RenderRow } from '@/src/api/endpoints/renders';
import type {
  RevisionFull,
  RevisionSummary,
} from '@/src/api/endpoints/revisions';

// S12 — محرّر المشروع. حقول المحتوى مُشتقّة من template.definition.fields.
// PATCH يمرّر updatedAt كـIf-Match (§12). 409 STALE_UPDATE يعيد التحميل
// ويحرّر واجهة نظيفة (لا يمحو تعديلات المستخدم — يعرض تنبيه).
// 428 IF_MATCH_REQUIRED رسالة صريحة (لا ينبغي أن يحدث — يعني حذف الرأس).
//
// **العقد المرجعي:** docs/16 §7 · §8 · §10 · §11.
//
// **S13 (المعاينة الحيّة) خارج نطاق هذه التذكرة —** انظر PHASES-studio.
// «تصدير الآن» يستدعي POST /renders ويستطلع الحالة كل ثانية حتى ينتهي.

interface FieldDef {
  readonly id: string;
  readonly label: string;
  readonly type: 'text' | 'multiline';
  readonly required?: boolean;
}

function extractFields(tpl: Template | null): FieldDef[] {
  if (!tpl) return [];
  const def = tpl.definition as { fields?: FieldDef[] };
  return Array.isArray(def?.fields) ? def.fields : [];
}

export default function ProjectEditorPage(): JSX.Element {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<ProjectFull | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [state, setState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [savingErrorKey, setSavingErrorKey] = useState<string | null>(null);
  const [savingNoticeKey, setSavingNoticeKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [transitionErrorKey, setTransitionErrorKey] = useState<string | null>(null);
  const [transitionBusyId, setTransitionBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const [revsOpen, setRevsOpen] = useState(false);
  const [revs, setRevs] = useState<RevisionSummary[]>([]);
  const [revsLoading, setRevsLoading] = useState(false);
  const [revView, setRevView] = useState<RevisionFull | null>(null);
  const [restoreRev, setRestoreRev] = useState<RevisionSummary | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreErrorKey, setRestoreErrorKey] = useState<string | null>(null);

  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderRow, setRenderRow] = useState<RenderRow | null>(null);
  const [renderErrorKey, setRenderErrorKey] = useState<string | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fields = useMemo(() => extractFields(tpl), [tpl]);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const p = await projects.get(id);
      setProject(p);
      const [tt, st] = await Promise.all([
        templates.get(p.template_id),
        projects.getState(id),
      ]);
      setTpl(tt);
      setState(st);
      const content = (p.content ?? {}) as Record<string, string>;
      const initial: Record<string, string> = {};
      const defs = extractFields(tt);
      for (const f of defs) initial[f.id] = String(content[f.id] ?? '');
      setDraft(initial);
      setDirty(false);
    } catch (err) {
      setLoadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return (): void => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function doSave(): Promise<void> {
    if (!project) return;
    setSaving(true);
    setSavingErrorKey(null);
    setSavingNoticeKey(null);
    try {
      const updated = await projects.patch(
        project.id,
        { content: draft },
        project.updatedAt
      );
      setProject(updated);
      setDirty(false);
      setSavingNoticeKey('pages.projects.editor.saved');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_UPDATE') {
        setSavingNoticeKey('pages.projects.editor.staleUpdate');
        await load();
      } else if (err instanceof ApiError && err.code === 'IF_MATCH_REQUIRED') {
        setSavingErrorKey('pages.projects.editor.ifMatchRequired');
      } else {
        setSavingErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
      }
    } finally {
      setSaving(false);
    }
  }

  async function doTransition(trnId: string): Promise<void> {
    if (!state) return;
    const trn = state.availableTransitions.find((x) => x.id === trnId);
    if (!trn) return;
    setTransitionBusyId(trnId);
    setTransitionErrorKey(null);
    try {
      const input: { transitionId: string; reason?: string } = { transitionId: trnId };
      if (trn.requiresReason) {
        const reason = (reasonById[trnId] ?? '').trim();
        if (reason.length < 10) {
          setTransitionErrorKey('errors.REASON_REQUIRED_FOR_THIS_TRANSITION');
          setTransitionBusyId(null);
          return;
        }
        input.reason = reason;
      }
      const next = await projects.transition(id, input);
      setState(next);
      // إعادة تحميل المشروع لأن updatedAt تغيّر (يمنع STALE_UPDATE لاحقاً).
      const fresh = await projects.get(id);
      setProject(fresh);
    } catch (err) {
      setTransitionErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setTransitionBusyId(null);
    }
  }

  async function doRender(): Promise<void> {
    if (!project) return;
    setRenderBusy(true);
    setRenderErrorKey(null);
    setRenderRow(null);
    try {
      const created = await renders.create({
        project_id: project.id,
        format: tpl?.kind === 'video' ? 'mp4' : 'png',
        size: 'feed',
      });
      setRenderId(created.id);
      // polling كل ثانية حتى الحالة النهائية (mock ينتقل بعد ~2.5s).
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(() => {
        void (async (): Promise<void> => {
          try {
            const r = await renders.get(created.id);
            setRenderRow(r);
            if (['succeeded', 'failed', 'cancelled'].includes(r.status)) {
              if (pollTimer.current) clearInterval(pollTimer.current);
            }
          } catch {
            /* تجاهل هفوات polling */
          }
        })();
      }, 1000);
    } catch (err) {
      setRenderErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setRenderBusy(false);
    }
  }

  async function openRevisions(): Promise<void> {
    setRevsOpen(true);
    setRevsLoading(true);
    try {
      const page = await revisions.list('projects', id);
      setRevs([...page.data]);
    } catch {
      setRevs([]);
    } finally {
      setRevsLoading(false);
    }
  }

  async function viewRev(r: RevisionSummary): Promise<void> {
    try {
      const full = await revisions.get('projects', id, r.id);
      setRevView(full);
    } catch {
      /* تجاهل */
    }
  }

  async function doRestore(): Promise<void> {
    if (!restoreRev) return;
    setRestoreErrorKey(null);
    try {
      const updated = await revisions.restore<ProjectFull>(
        'projects',
        id,
        restoreRev.id,
        { reason: restoreReason.trim() }
      );
      setProject(updated);
      setRestoreRev(null);
      setRestoreReason('');
      await openRevisions();
    } catch (err) {
      setRestoreErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  const revColumns: readonly Column<RevisionSummary>[] = [
    {
      key: 'at',
      headerKey: 'pages.projects.revisions.col.at',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-subtle">
          {r.createdAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'actor',
      headerKey: 'pages.projects.revisions.col.actor',
      render: (r) => (
        <span className="text-fg-muted">
          {r.actorId ?? t('pages.projects.editor.systemActor')}
        </span>
      ),
    },
    {
      key: 'op',
      headerKey: 'pages.projects.revisions.col.op',
      render: (r) => (
        <Badge tone={r.op === 'delete' ? 'danger' : 'neutral'}>
          {t(`pages.projects.revisions.op.${r.op}`)}
        </Badge>
      ),
    },
    {
      key: 'snapshot',
      headerKey: 'pages.projects.revisions.col.snapshot',
      align: 'center',
      render: (r) => (r.hasSnapshot ? <Badge tone="success">•</Badge> : null),
    },
    {
      key: 'act',
      headerKey: 'pages.projects.col.actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void viewRev(r)}>
            {t('pages.projects.revisions.view')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRestoreRev(r)}>
            {t('pages.projects.revisions.restore')}
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return <div className="p-8 text-fg-muted">…</div>;
  }
  if (loadErrorKey) {
    return (
      <div className="space-y-4">
        <Alert kind="danger" titleKey={loadErrorKey} />
        <Link href="/projects" className="text-accent hover:underline">
          {t('pages.projects.editor.back')}
        </Link>
      </div>
    );
  }
  if (!project || !state) return <div />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/projects" className="text-xs text-fg-subtle hover:text-fg">
            ← {t('pages.projects.editor.back')}
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{project.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
            <Badge tone="neutral">
              {t(`pages.projects.state.${state.currentState}`)}
            </Badge>
            <span dir="ltr">{project.updatedAt.slice(0, 19).replace('T', ' ')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void openRevisions()}>
            {t('pages.projects.editor.revisions')}
          </Button>
          <Button
            onClick={() => void doSave()}
            disabled={!dirty || saving}
            loading={saving}
          >
            {t('pages.projects.editor.save')}
          </Button>
        </div>
      </div>

      {savingNoticeKey && <Alert kind="info" titleKey={savingNoticeKey} />}
      {savingErrorKey && <Alert kind="danger" titleKey={savingErrorKey} />}

      <div className="grid gap-6 md:grid-cols-3">
        {/* المحتوى — يمين عريض */}
        <div className="space-y-4 md:col-span-2">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.projects.editor.content')}
          </div>
          {fields.length === 0 && (
            <p className="text-xs text-fg-subtle">
              {t('pages.projects.editor2.noFields')}
            </p>
          )}
          {fields.map((f) => (
            <Field
              key={f.id}
              labelKey={f.label}
              htmlFor={`fld-${f.id}`}
              {...(f.required ? { required: true } : {})}
            >
              {f.type === 'multiline' ? (
                <Textarea
                  id={`fld-${f.id}`}
                  value={draft[f.id] ?? ''}
                  onChange={(e) => {
                    setDraft({ ...draft, [f.id]: e.target.value });
                    setDirty(true);
                    setSavingNoticeKey(null);
                  }}
                  rows={4}
                />
              ) : (
                <Input
                  id={`fld-${f.id}`}
                  value={draft[f.id] ?? ''}
                  onChange={(e) => {
                    setDraft({ ...draft, [f.id]: e.target.value });
                    setDirty(true);
                    setSavingNoticeKey(null);
                  }}
                />
              )}
            </Field>
          ))}
        </div>

        {/* سير العمل + التصدير — يسار ضيّق */}
        <div className="space-y-6">
          <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium text-fg-muted">
              {t('pages.projects.editor.workflow')}
            </div>
            {transitionErrorKey && (
              <Alert kind="danger" titleKey={transitionErrorKey} />
            )}
            <div className="text-xs text-fg-subtle">
              {t('pages.projects.editor.transitions')}:
            </div>
            {state.availableTransitions.length === 0 && (
              <p className="text-xs text-fg-subtle">
                {t('pages.projects.editor.noTransitions')}
              </p>
            )}
            {state.availableTransitions.map((tr) => (
              <div key={tr.id} className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">{tr.label}</div>
                  <Button
                    size="sm"
                    onClick={() => void doTransition(tr.id)}
                    loading={transitionBusyId === tr.id}
                  >
                    →
                  </Button>
                </div>
                {tr.requiresReason && (
                  <Textarea
                    value={reasonById[tr.id] ?? ''}
                    onChange={(e) =>
                      setReasonById({ ...reasonById, [tr.id]: e.target.value })
                    }
                    placeholder={t('pages.projects.editor.reasonLabel')}
                    rows={2}
                  />
                )}
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium text-fg-muted">
              {t('pages.projects.editor.renders')}
            </div>
            {renderErrorKey && (
              <Alert
                kind={
                  renderErrorKey.endsWith('UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS')
                    ? 'warning'
                    : 'danger'
                }
                titleKey={
                  renderErrorKey.endsWith('UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS')
                    ? 'pages.projects.editor.externalAssetsBlocked'
                    : renderErrorKey
                }
              />
            )}
            {renderRow && (
              <div className="text-xs text-fg-muted">
                {renderRow.status === 'queued' &&
                  t('pages.projects.editor.renderQueued')}
                {renderRow.status === 'running' &&
                  t('pages.projects.editor.renderRunning')}
                {renderRow.status === 'succeeded' && renderRow.output_url && (
                  <a
                    href={renderRow.output_url}
                    className="text-accent hover:underline"
                  >
                    {t('pages.projects.editor.renderReady')}
                  </a>
                )}
                {renderRow.status === 'failed' &&
                  t('pages.projects.editor.renderFailed')}
              </div>
            )}
            <Button
              size="sm"
              onClick={() => void doRender()}
              loading={renderBusy}
              disabled={renderBusy}
            >
              {t('pages.projects.editor.renderNow')}
            </Button>
          </section>

          <section className="space-y-2 rounded border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium text-fg-muted">
              {t('pages.projects.editor.history')}
            </div>
            {state.history.length === 0 ? (
              <p className="text-xs text-fg-subtle">—</p>
            ) : (
              <ul className="space-y-1 text-xs text-fg-muted">
                {state.history.slice(-6).reverse().map((h, i) => (
                  <li key={`${h.at}-${i}`} className="border-t border-border pt-1">
                    <span dir="ltr" className="text-fg-subtle">
                      {h.at.slice(0, 19).replace('T', ' ')}
                    </span>{' '}
                    · {h.from} → {h.to}
                    {h.actorId === null && (
                      <span className="ms-2 text-fg-subtle">
                        ({t('pages.projects.editor.systemActor')})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Revisions dialog */}
      <Dialog
        open={revsOpen}
        onClose={() => {
          setRevsOpen(false);
          setRevView(null);
        }}
        titleKey="pages.projects.revisions.title"
      >
        {revView ? (
          <div className="space-y-2">
            <div className="text-xs text-fg-subtle">
              {t('pages.projects.revisions.reconstructed')}:
            </div>
            <pre
              dir="ltr"
              className="max-h-[50vh] overflow-auto rounded border border-border bg-surface-2 p-3 text-[11px]"
            >
              {JSON.stringify(revView.reconstructedState, null, 2)}
            </pre>
            <Button variant="ghost" size="sm" onClick={() => setRevView(null)}>
              ←
            </Button>
          </div>
        ) : revsLoading ? (
          <p className="text-xs text-fg-subtle">…</p>
        ) : revs.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            {t('pages.projects.revisions.empty')}
          </p>
        ) : (
          <Table
            columns={revColumns}
            rows={revs}
            getRowKey={(r) => r.id}
            emptyKey="pages.projects.revisions.empty"
          />
        )}
      </Dialog>

      {/* Restore dialog */}
      <Dialog
        open={restoreRev !== null}
        onClose={() => {
          setRestoreRev(null);
          setRestoreReason('');
          setRestoreErrorKey(null);
        }}
        titleKey="pages.projects.revisions.restoreTitle"
        confirmKey="pages.projects.revisions.restoreConfirm"
        variant="danger"
        onConfirm={doRestore}
      >
        <div className="space-y-3">
          {restoreErrorKey && <Alert kind="danger" titleKey={restoreErrorKey} />}
          <Field labelKey="pages.projects.revisions.restoreReason" htmlFor="restore-reason" required>
            <Textarea
              id="restore-reason"
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
