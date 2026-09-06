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
  annotations as annotationsApi,
  ApiError,
  brandKits,
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
import type { Annotation } from '@/src/api/endpoints/annotations';
import type { BrandKitFull } from '@/src/api/endpoints/brand-kits';
import {
  createDebouncedScheduler,
  drawPreview,
} from '@/src/preview/live';

// S12 — محرّر المشروع. حقول المحتوى مُشتقّة من template.definition.fields.
// PATCH يمرّر updatedAt كـIf-Match (§12). 409 STALE_UPDATE يعيد التحميل
// ويحرّر واجهة نظيفة (لا يمحو تعديلات المستخدم — يعرض تنبيه).
// 428 IF_MATCH_REQUIRED رسالة صريحة (لا ينبغي أن يحدث — يعني حذف الرأس).
//
// **العقد المرجعي:** docs/16 §7 · §8 · §10 · §11.
//
// **S13 (المعاينة الحيّة) خارج نطاق هذه التذكرة —** انظر PHASES-studio.
// «تصدير الآن» يستدعي POST /renders ويستطلع الحالة كل ثانية حتى ينتهي.

// حقل قالب — مطابق لـpackages/templates TemplateFieldBase: مفتاح
// «key» (لا id). الأنواع الفعلية المُرجَعة من mk-api: text · richtext ·
// image · range · medialist — نقتصر هنا على النصّية للتعبئة.
interface FieldDef {
  readonly key: string;
  readonly label?: string;
  readonly type: string;
  readonly required?: boolean;
}

function extractFields(tpl: Template | null): FieldDef[] {
  if (!tpl) return [];
  const def = tpl.definition as { fields?: FieldDef[] };
  return Array.isArray(def?.fields) ? def.fields : [];
}

function isTextField(t: string): boolean {
  return t === 'text' || t === 'richtext';
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

  // S15 — رفض ثلاثيّ برسائل مميزة:
  //   409 ⇒ الحالة تغيّرت (نعيد التحميل ونعرض تنبيه)
  //   403 ⇒ الدور غير كافٍ (رسالة تذكر الدور المطلوب من err.field)
  //   400 ⇒ ينقص سبب (نفتح حقل السبب inline — لا بانر خطأ)
  const [transitionBusyId, setTransitionBusyId] = useState<string | null>(null);
  // خطأ لكل انتقال — يُعرض تحت الصف. القيمة `{ kind, ... }`.
  type TrnError =
    | { kind: 'stale' }
    | { kind: 'role'; requiredRole: string }
    | { kind: 'reason' }
    | { kind: 'other'; messageKey: string };
  const [errByTrn, setErrByTrn] = useState<Record<string, TrnError>>({});
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

  // S13 — المعاينة الحيّة. brand.config من mk-api الحقيقي (لا mock
  // stack يخترع بالقيم — القاعدة الثالثة). scheduler = debounce 200ms
  // + rAF. عتبة الأداء المُعلَنة: ≤50ms لرسم 1080×1080 بعد آخر ضغطة.
  const [brandCfg, setBrandCfg] = useState<Record<string, unknown> | null>(null);
  const [previewSize] = useState<{ w: number; h: number }>({ w: 1080, h: 1080 });
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewScheduler = useRef(createDebouncedScheduler(200));

  // S16 — التعليقات. الطبقات مقروءة من template.definition.fields،
  // لا قائمة مثبَّتة في الواجهة.
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [annsLoading, setAnnsLoading] = useState(false);
  const [annFilter, setAnnFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [annBody, setAnnBody] = useState('');
  const [annLayer, setAnnLayer] = useState<string>('');
  const [annSeg, setAnnSeg] = useState<number>(0);
  const [annErrorKey, setAnnErrorKey] = useState<string | null>(null);
  const [annErrorField, setAnnErrorField] = useState<string | null>(null);
  const [annBusy, setAnnBusy] = useState(false);

  const fields = useMemo(() => extractFields(tpl), [tpl]);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const p = await projects.get(id);
      setProject(p);
      const [tt, st, bk] = await Promise.all([
        templates.get(p.template_id),
        projects.getState(id),
        brandKits.get(p.brand_kit_id).catch<null>(() => null),
      ]);
      setTpl(tt);
      setState(st);
      setBrandCfg((bk as BrandKitFull | null)?.config ?? {});
      const content = (p.content ?? {}) as Record<string, string>;
      const initial: Record<string, string> = {};
      const defs = extractFields(tt);
      for (const f of defs) initial[f.key] = String(content[f.key] ?? '');
      setDraft(initial);
      setDirty(false);
      if (defs.length > 0 && annLayer === '') {
        const first = defs[0];
        if (first) setAnnLayer(first.key);
      }
      void refreshAnns();
    } catch (err) {
      setLoadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  async function refreshAnns(): Promise<void> {
    setAnnsLoading(true);
    try {
      const page = await annotationsApi.list(id);
      setAnns([...page.data]);
    } catch {
      setAnns([]);
    } finally {
      setAnnsLoading(false);
    }
  }

  async function doCreateAnn(): Promise<void> {
    setAnnBusy(true);
    setAnnErrorKey(null);
    setAnnErrorField(null);
    try {
      const created = await annotationsApi.create(id, {
        body: annBody.trim(),
        target: { kind: 'layer', layer: annLayer, segmentIndex: annSeg },
      });
      setAnns([created, ...anns]);
      setAnnBody('');
    } catch (err) {
      if (err instanceof ApiError) {
        setAnnErrorKey(err.messageKey);
        setAnnErrorField(err.field ?? null);
      } else {
        setAnnErrorKey('errors.UNKNOWN');
      }
    } finally {
      setAnnBusy(false);
    }
  }

  async function toggleAnnResolved(a: Annotation): Promise<void> {
    try {
      const updated = await annotationsApi.patch(id, a.id, {
        resolved: !a.resolved,
      });
      setAnns(anns.map((x) => (x.id === a.id ? updated : x)));
    } catch { /* تجاهل */ }
  }

  async function removeAnn(a: Annotation): Promise<void> {
    try {
      await annotationsApi.remove(id, a.id);
      setAnns(anns.filter((x) => x.id !== a.id));
    } catch { /* تجاهل */ }
  }

  useEffect(() => {
    void load();
    return (): void => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      previewScheduler.current.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── S13 preview scheduler ──
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !tpl || brandCfg === null) return;
    previewScheduler.current.schedule(() => {
      void (async (): Promise<void> => {
        try {
          const res = await drawPreview(canvas, {
            template: tpl.definition,
            brandConfig: brandCfg,
            content: draft,
            size: previewSize,
          });
          setPreviewMs(res.durationMs);
          setPreviewWarning(res.warning ?? null);
        } catch (err) {
          setPreviewWarning(err instanceof Error ? err.message : 'preview-error');
        }
      })();
    });
    return (): void => previewScheduler.current.cancel();
  }, [tpl, brandCfg, draft, previewSize]);

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
    setErrByTrn((prev) => {
      const next = { ...prev };
      delete next[trnId];
      return next;
    });
    try {
      const input: { transitionId: string; reason?: string } = { transitionId: trnId };
      if (trn.requiresReason) {
        const reason = (reasonById[trnId] ?? '').trim();
        if (reason.length > 0) input.reason = reason;
        // لا نمنع الإرسال محلياً — نتركه للخادم كي يعطي 400 field=reason
        // (نفس نمط S8/S10: نعتمد الخادم مصدر الحقيقة، الواجهة تُترجم).
      }
      const next = await projects.transition(id, input);
      setState(next);
      const fresh = await projects.get(id);
      setProject(fresh);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setErrByTrn((prev) => ({ ...prev, [trnId]: { kind: 'other', messageKey: 'errors.UNKNOWN' } }));
        return;
      }
      if (err.code === 'TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE') {
        // 409 — الحالة تغيّرت. أعِد التحميل + اعرض تنبيه ذا معنى.
        setErrByTrn((prev) => ({ ...prev, [trnId]: { kind: 'stale' } }));
        try {
          const st = await projects.getState(id);
          setState(st);
        } catch { /* تجاهل */ }
      } else if (err.code === 'TRANSITION_ROLE_REQUIRED') {
        // 403 — err.field يحمل الدور المطلوب.
        setErrByTrn((prev) => ({
          ...prev,
          [trnId]: { kind: 'role', requiredRole: err.field ?? trn.id },
        }));
      } else if (err.code === 'REASON_REQUIRED_FOR_THIS_TRANSITION') {
        // 400 — ينقص سبب. لا بانر خطأ — نفتح الحقل inline (رسالة رمادية
        // تذكيرية) والحقل موجود أصلاً حين requiresReason=true.
        setErrByTrn((prev) => ({ ...prev, [trnId]: { kind: 'reason' } }));
      } else {
        setErrByTrn((prev) => ({
          ...prev,
          [trnId]: { kind: 'other', messageKey: err.messageKey },
        }));
      }
    } finally {
      setTransitionBusyId(null);
    }
  }

  async function doAssignSelf(): Promise<void> {
    if (!project) return;
    try {
      const res = await projects.assign(project.id, { assigneeId: 'usr_mock' });
      setProject({ ...project, assigneeId: res.assigneeId });
    } catch {
      /* تجاهل — الرسالة تعرض عبر Alert لاحقاً إن لزم */
    }
  }
  async function doUnassign(): Promise<void> {
    if (!project) return;
    try {
      const res = await projects.assign(project.id, { assigneeId: null });
      setProject({ ...project, assigneeId: res.assigneeId });
    } catch { /* تجاهل */ }
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
          {fields.map((f) => {
            const multi = f.type === 'richtext' || f.type === 'multiline';
            if (!isTextField(f.type) && f.type !== 'multiline') return null;
            return (
              <div key={f.key} className="space-y-1.5">
                <label
                  htmlFor={`fld-${f.key}`}
                  className="block text-xs font-medium text-fg-muted"
                >
                  {f.label ?? f.key}
                  {f.required && <span className="ms-1 text-danger">*</span>}
                </label>
                {multi ? (
                  <Textarea
                    id={`fld-${f.key}`}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => {
                      setDraft({ ...draft, [f.key]: e.target.value });
                      setDirty(true);
                      setSavingNoticeKey(null);
                    }}
                    rows={4}
                  />
                ) : (
                  <Input
                    id={`fld-${f.key}`}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => {
                      setDraft({ ...draft, [f.key]: e.target.value });
                      setDirty(true);
                      setSavingNoticeKey(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* سير العمل + التصدير — يسار ضيّق */}
        <div className="space-y-6">
          {/* S13 — المعاينة الحيّة */}
          <section
            className="space-y-2 rounded border border-border bg-surface-2 p-4"
            data-testid="live-preview"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-fg-muted">
                {t('pages.projects.preview.title')}
              </div>
              {previewMs !== null && (
                <span
                  dir="ltr"
                  className="text-[10px] text-fg-subtle"
                  data-testid="preview-ms"
                >
                  {previewMs.toFixed(1)}ms · {previewSize.w}×{previewSize.h}
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded border border-border bg-black">
              <canvas
                ref={previewCanvasRef}
                className="block w-full"
                style={{ aspectRatio: `${previewSize.w} / ${previewSize.h}` }}
              />
            </div>
            {previewWarning && (
              <p
                dir="ltr"
                className="text-[11px] text-warning"
                data-testid="preview-warning"
              >
                {previewWarning}
              </p>
            )}
            <p className="text-[11px] text-fg-subtle">
              {t('pages.projects.preview.hint')}
            </p>
          </section>

          <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium text-fg-muted">
              {t('pages.projects.editor.workflow')}
            </div>
            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <span>
                {t('pages.projects.editor2.assignee')}:{' '}
                <span className="text-fg-muted">
                  {project.assigneeId ?? t('pages.projects.editor2.unassigned')}
                </span>
              </span>
              <div className="flex gap-1">
                {project.assigneeId ? (
                  <Button size="sm" variant="ghost" onClick={() => void doUnassign()}>
                    {t('pages.projects.editor2.unassign')}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void doAssignSelf()}>
                    {t('pages.projects.editor2.assignSelf')}
                  </Button>
                )}
              </div>
            </div>
            <div className="text-xs text-fg-subtle">
              {t('pages.projects.editor.transitions')}:
            </div>
            {state.availableTransitions.length === 0 && (
              <p className="text-xs text-fg-subtle">
                {t('pages.projects.editor.noTransitions')}
              </p>
            )}
            {state.availableTransitions.map((tr) => {
              const trnErr = errByTrn[tr.id];
              return (
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
                      invalid={trnErr?.kind === 'reason'}
                    />
                  )}
                  {trnErr?.kind === 'reason' && (
                    <p className="text-[11px] text-fg-muted">
                      {t('pages.projects.editor2.transitionReasonInline')}
                    </p>
                  )}
                  {trnErr?.kind === 'role' && (
                    <Alert kind="danger" titleKey="errors.TRANSITION_ROLE_REQUIRED">
                      <p className="text-xs text-fg-muted">
                        {t('pages.projects.editor2.transitionRoleRequired', {
                          role: trnErr.requiredRole,
                        })}
                      </p>
                    </Alert>
                  )}
                  {trnErr?.kind === 'stale' && (
                    <Alert
                      kind="warning"
                      titleKey="errors.TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE"
                    />
                  )}
                  {trnErr?.kind === 'other' && (
                    <Alert kind="danger" titleKey={trnErr.messageKey} />
                  )}
                </div>
              );
            })}
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

          <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium text-fg-muted">
              {t('pages.projects.annotations.title')}
            </div>
            <p className="text-[11px] text-fg-subtle">
              {t('pages.projects.annotations.hintLayerFromTemplate')}
            </p>
            {annErrorKey && !annErrorField && (
              <Alert kind="danger" titleKey={annErrorKey} />
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <Field
                labelKey="pages.projects.annotations.layer"
                htmlFor="ann-layer"
                {...(annErrorField === 'target.layer'
                  ? { errorKey: 'errors.LAYER_NOT_FOUND' }
                  : {})}
              >
                <select
                  id="ann-layer"
                  value={annLayer}
                  onChange={(e) => setAnnLayer(e.target.value)}
                  className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
                >
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.key}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                labelKey="pages.projects.annotations.segmentIndex"
                htmlFor="ann-seg"
                {...(annErrorField === 'target.segmentIndex'
                  ? { errorKey: 'errors.INVALID_SEGMENT_INDEX' }
                  : {})}
              >
                <Input
                  id="ann-seg"
                  type="number"
                  min={0}
                  value={annSeg}
                  invalid={annErrorField === 'target.segmentIndex'}
                  onChange={(e) => setAnnSeg(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field labelKey="pages.projects.annotations.body" htmlFor="ann-body">
              <Textarea
                id="ann-body"
                value={annBody}
                rows={2}
                onChange={(e) => setAnnBody(e.target.value)}
              />
            </Field>
            <Button
              size="sm"
              onClick={() => void doCreateAnn()}
              loading={annBusy}
              disabled={annBusy || !annBody.trim() || !annLayer}
            >
              {t('pages.projects.annotations.add')}
            </Button>

            <div className="flex items-center gap-2 pt-2 text-xs">
              {(['all', 'open', 'resolved'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAnnFilter(k)}
                  className={
                    'rounded border px-2 py-0.5 ' +
                    (annFilter === k
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-surface-2 text-fg-muted hover:text-fg')
                  }
                >
                  {t(
                    k === 'all'
                      ? 'pages.projects.annotations.filterAll'
                      : k === 'open'
                        ? 'pages.projects.annotations.filterOpen'
                        : 'pages.projects.annotations.filterResolved'
                  )}
                </button>
              ))}
            </div>

            {annsLoading ? (
              <p className="text-xs text-fg-subtle">…</p>
            ) : anns.length === 0 ? (
              <p className="text-xs text-fg-subtle">
                {t('pages.projects.annotations.empty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {anns
                  .filter((a) =>
                    annFilter === 'all'
                      ? true
                      : annFilter === 'open'
                        ? !a.resolved
                        : a.resolved
                  )
                  .map((a) => (
                    <li
                      key={a.id}
                      className="space-y-1 border-t border-border pt-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-fg-subtle">
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">{a.target.layer}</Badge>
                          <span dir="ltr" className="text-[10px]">
                            #{a.target.segmentIndex}
                          </span>
                          <Badge tone={a.resolved ? 'success' : 'warning'}>
                            {t(
                              a.resolved
                                ? 'pages.projects.annotations.resolvedTag'
                                : 'pages.projects.annotations.openTag'
                            )}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void toggleAnnResolved(a)}
                          >
                            {t(
                              a.resolved
                                ? 'pages.projects.annotations.unresolve'
                                : 'pages.projects.annotations.resolve'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeAnn(a)}
                          >
                            {t('pages.projects.annotations.remove')}
                          </Button>
                        </div>
                      </div>
                      <div className="text-fg">{a.body}</div>
                      <div className="text-[10px] text-fg-subtle" dir="ltr">
                        {a.createdAt.slice(0, 19).replace('T', ' ')} ·{' '}
                        {a.authorId ?? t('pages.projects.editor.systemActor')}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
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
                  <li key={`${h.at}-${i}`} className="space-y-0.5 border-t border-border pt-1">
                    <div>
                      <span dir="ltr" className="text-fg-subtle">
                        {h.at.slice(0, 19).replace('T', ' ')}
                      </span>{' '}
                      · {h.from} → {h.to} ·{' '}
                      <span className="text-fg">
                        {h.actorId ?? t('pages.projects.editor.systemActor')}
                      </span>
                    </div>
                    {h.reason && (
                      <div className="ps-3 text-[11px] text-fg-subtle">
                        “{h.reason}”
                      </div>
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
