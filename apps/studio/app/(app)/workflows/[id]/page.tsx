'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, workflows } from '@/src/api';
import type {
  WorkflowFull,
  WorkflowState,
  WorkflowTransition,
} from '@/src/api/endpoints/workflows';

// S14 محرّر — يعرض ويعدّل الحالات + الانتقالات. WORKFLOW_SCHEMA_VIOLATION
// من الخادم يحمل حقلاً (مثل `transitions[2].from`) — نُظهره **على الصف
// المعني** لا بانراً عاماً.

type MutableState = { id: string; label: string; assignableTo: string[] };
type MutableTrn = {
  id: string;
  from: string;
  to: string;
  label: string;
  requiredRole: string;
  requiresReason: boolean;
};

function toMutable(w: WorkflowFull): {
  name: string;
  states: MutableState[];
  transitions: MutableTrn[];
} {
  return {
    name: w.name,
    states: w.states.map((s) => ({
      id: s.id,
      label: s.label,
      assignableTo: [...s.assignableTo],
    })),
    transitions: w.transitions.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      label: t.label,
      requiredRole: t.requiredRole,
      requiresReason: t.requiresReason,
    })),
  };
}

const ROLES = ['writer', 'editor', 'reviewer', 'admin'];

export default function WorkflowEditorPage(): JSX.Element {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [wf, setWf] = useState<WorkflowFull | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    states: MutableState[];
    transitions: MutableTrn[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNoticeKey, setSavedNoticeKey] = useState<string | null>(null);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const w = await workflows.get(id);
      setWf(w);
      setDraft(toMutable(w));
    } catch (err) {
      setLoadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const stateIds = useMemo(
    () => new Set(draft?.states.map((s) => s.id) ?? []),
    [draft]
  );

  async function doSave(): Promise<void> {
    if (!draft) return;
    setSaving(true);
    setSaveErrorKey(null);
    setSavedNoticeKey(null);
    setErrorField(null);
    try {
      const updated = await workflows.patch(id, {
        name: draft.name,
        states: draft.states,
        transitions: draft.transitions,
      });
      setWf(updated);
      setSavedNoticeKey('pages.workflows.editor.saved');
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveErrorKey(err.messageKey);
        setErrorField(err.field ?? null);
      } else {
        setSaveErrorKey('errors.UNKNOWN');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-fg-muted">{t('common.loading')}</div>;
  if (loadErrorKey) {
    return (
      <div className="space-y-4">
        <Alert kind="danger" titleKey={loadErrorKey} />
        <Link href="/workflows" className="text-accent hover:underline">
          {t('pages.workflows.editor.backToList')}
        </Link>
      </div>
    );
  }
  if (!wf || !draft) return <div />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/workflows"
            className="text-xs text-fg-subtle hover:text-fg"
          >
            ← {t('pages.workflows.editor.backToList')}
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{wf.name}</h1>
          {wf.isDefault && (
            <Badge tone="success">{t('pages.workflows.isDefault')}</Badge>
          )}
        </div>
        <Button onClick={() => void doSave()} loading={saving} disabled={saving}>
          {t('pages.workflows.editor.save')}
        </Button>
      </div>

      {savedNoticeKey && <Alert kind="info" titleKey={savedNoticeKey} />}
      {saveErrorKey && !errorField && (
        <Alert kind="danger" titleKey={saveErrorKey} />
      )}

      <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.workflows.editor.statesTitle')}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDraft({
                ...draft,
                states: [
                  ...draft.states,
                  { id: `state_${draft.states.length + 1}`, label: '', assignableTo: [] },
                ],
              })
            }
          >
            {t('pages.workflows.editor.addState')}
          </Button>
        </div>
        <div className="space-y-3">
          {draft.states.map((s, i) => (
            <div
              key={i}
              className="grid gap-2 rounded border border-border bg-surface p-3 md:grid-cols-4"
            >
              <Field labelKey="pages.workflows.editor.stateId" htmlFor={`sid-${i}`}>
                <Input
                  id={`sid-${i}`}
                  value={s.id}
                  onChange={(e) => {
                    const next = [...draft.states];
                    next[i] = { ...s, id: e.target.value };
                    setDraft({ ...draft, states: next });
                  }}
                />
              </Field>
              <Field
                labelKey="pages.workflows.editor.stateLabel"
                htmlFor={`slabel-${i}`}
              >
                <Input
                  id={`slabel-${i}`}
                  value={s.label}
                  onChange={(e) => {
                    const next = [...draft.states];
                    next[i] = { ...s, label: e.target.value };
                    setDraft({ ...draft, states: next });
                  }}
                />
              </Field>
              <Field
                labelKey="pages.workflows.editor.assignableTo"
                htmlFor={`sassign-${i}`}
              >
                <Input
                  id={`sassign-${i}`}
                  value={s.assignableTo.join(',')}
                  onChange={(e) => {
                    const next = [...draft.states];
                    next[i] = {
                      ...s,
                      assignableTo: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    };
                    setDraft({ ...draft, states: next });
                  }}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      states: draft.states.filter((_, j) => j !== i),
                    })
                  }
                >
                  {t('pages.workflows.editor.removeRow')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.workflows.editor.transitionsTitle')}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDraft({
                ...draft,
                transitions: [
                  ...draft.transitions,
                  {
                    id: `trn_${draft.transitions.length + 1}`,
                    from: '',
                    to: '',
                    label: '',
                    requiredRole: 'writer',
                    requiresReason: false,
                  },
                ],
              })
            }
          >
            {t('pages.workflows.editor.addTransition')}
          </Button>
        </div>
        <div className="space-y-4">
          {draft.transitions.map((tr, i) => {
            const fromInvalid = tr.from !== '' && !stateIds.has(tr.from);
            const toInvalid = tr.to !== '' && !stateIds.has(tr.to);
            const fromErr =
              errorField === `transitions[${i}].from` ||
              (errorField ?? '').startsWith(`transitions[${i}].from`);
            const toErr =
              errorField === `transitions[${i}].to` ||
              (errorField ?? '').startsWith(`transitions[${i}].to`);
            return (
              <div
                key={i}
                className="grid gap-3 rounded border border-border bg-surface p-3 md:grid-cols-6"
              >
                <Field
                  labelKey="pages.workflows.editor.transitionId"
                  htmlFor={`tid-${i}`}
                >
                  <Input
                    id={`tid-${i}`}
                    value={tr.id}
                    onChange={(e) => {
                      const next = [...draft.transitions];
                      next[i] = { ...tr, id: e.target.value };
                      setDraft({ ...draft, transitions: next });
                    }}
                  />
                </Field>
                <Field
                  labelKey="pages.workflows.editor.transitionLabel"
                  htmlFor={`tlabel-${i}`}
                >
                  <Input
                    id={`tlabel-${i}`}
                    value={tr.label}
                    onChange={(e) => {
                      const next = [...draft.transitions];
                      next[i] = { ...tr, label: e.target.value };
                      setDraft({ ...draft, transitions: next });
                    }}
                  />
                </Field>
                <Field
                  labelKey="pages.workflows.editor.from"
                  htmlFor={`tfrom-${i}`}
                  {...(fromErr || fromInvalid
                    ? { errorKey: 'pages.workflows.editor.schemaHintUnknownState' }
                    : {})}
                >
                  <Input
                    id={`tfrom-${i}`}
                    value={tr.from}
                    invalid={fromErr || fromInvalid}
                    onChange={(e) => {
                      const next = [...draft.transitions];
                      next[i] = { ...tr, from: e.target.value };
                      setDraft({ ...draft, transitions: next });
                    }}
                  />
                </Field>
                <Field
                  labelKey="pages.workflows.editor.to"
                  htmlFor={`tto-${i}`}
                  {...(toErr || toInvalid
                    ? { errorKey: 'pages.workflows.editor.schemaHintUnknownState' }
                    : {})}
                >
                  <Input
                    id={`tto-${i}`}
                    value={tr.to}
                    invalid={toErr || toInvalid}
                    onChange={(e) => {
                      const next = [...draft.transitions];
                      next[i] = { ...tr, to: e.target.value };
                      setDraft({ ...draft, transitions: next });
                    }}
                  />
                </Field>
                <Field
                  labelKey="pages.workflows.editor.requiredRole"
                  htmlFor={`trole-${i}`}
                >
                  <select
                    id={`trole-${i}`}
                    value={tr.requiredRole}
                    onChange={(e) => {
                      const next = [...draft.transitions];
                      next[i] = { ...tr, requiredRole: e.target.value };
                      setDraft({ ...draft, transitions: next });
                    }}
                    className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={tr.requiresReason}
                      onChange={(e) => {
                        const next = [...draft.transitions];
                        next[i] = { ...tr, requiresReason: e.target.checked };
                        setDraft({ ...draft, transitions: next });
                      }}
                    />
                    {t('pages.workflows.editor.requiresReason')}
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        transitions: draft.transitions.filter((_, j) => j !== i),
                      })
                    }
                  >
                    {t('pages.workflows.editor.removeRow')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
