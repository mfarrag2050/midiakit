'use client';

import { useEffect, useRef, useState } from 'react';
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
  Textarea,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ai, ApiError } from '@/src/api';
import type { AiIntegration, AiProvider } from '@/src/api/endpoints/ai';

// S21 — تكاملات الذكاء (المفاتيح).
// **قاعدة أمن حاكمة (docs/16 §15):** الخادم لا يعيد المفتاح.
// الواجهة تقبله مرة عند الإضافة وترسله، **ثم تمسحه من الذاكرة**.
// - لا حفظ في useState أطول من المطلوب.
// - لا localStorage.
// - لا state بعد الإرسال — نُصفّرها فوراً.
// الحارس `check-no-brand-url-fetch` لا يغطّي هذا — التعليق هنا هو
// الحارس البشري.

const PROVIDERS: AiProvider[] = ['openai', 'anthropic', 'google', 'cohere', 'mistral'];

// **قدرة استدعاء داخل الإعدادات — لاختبار الدفق قبل استعمالها في المحرّر.**
const CAPABILITIES = [
  'text.completion',
  'headline.suggest',
  'summary.write',
  'image.tag',
];

export default function AiSettingsPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<AiIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addProvider, setAddProvider] = useState<AiProvider>('openai');
  // apiKey في useRef لا useState — لا يُخزَّن في React state بين renders.
  // يُقرأ من input عبر ref ثم يُمسح فوراً بعد الإرسال.
  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addErrorKey, setAddErrorKey] = useState<string | null>(null);
  const [addErrorField, setAddErrorField] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<AiIntegration | null>(null);
  const [delErrorKey, setDelErrorKey] = useState<string | null>(null);

  // ── Invoke drawer ──
  const [invokeOpen, setInvokeOpen] = useState(false);
  const [invCapability, setInvCapability] = useState<string>('text.completion');
  const [invInput, setInvInput] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [invOutput, setInvOutput] = useState<{
    output: unknown;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    provider: string;
  } | null>(null);
  const [invErrorKey, setInvErrorKey] = useState<string | null>(null);
  const [invLastPayload, setInvLastPayload] = useState<{
    capability: string;
    input: unknown;
  } | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const res = await ai.listIntegrations();
      setRows([...res.data]);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doAdd(): Promise<void> {
    setAddBusy(true);
    setAddErrorKey(null);
    setAddErrorField(null);
    const el = apiKeyRef.current;
    const apiKey = el?.value ?? '';
    try {
      await ai.upsertIntegration({ provider: addProvider, apiKey });
      // ── محو المفتاح فوراً بعد الإرسال ──
      if (el) el.value = '';
      // نحاول محو أي مرجع باقٍ (المتصفّح قد يحتفظ بنسخة من DOM value):
      setAddOpen(false);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setAddErrorKey(err.messageKey);
        setAddErrorField(err.field ?? null);
        // حتى عند الفشل نمحو المفتاح — الفرصة الوحيدة لتصحيح هي إعادة إدخاله.
        if (el) el.value = '';
      } else {
        setAddErrorKey('errors.UNKNOWN');
      }
    } finally {
      setAddBusy(false);
    }
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDelErrorKey(null);
    try {
      await ai.deleteIntegration(toDelete.provider);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDelErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  async function doInvoke(): Promise<void> {
    const payload = { capability: invCapability, input: { text: invInput } };
    setInvBusy(true);
    setInvErrorKey(null);
    setInvOutput(null);
    setInvLastPayload(payload);
    try {
      const res = await ai.invoke({ capability: invCapability, input: { text: invInput } });
      setInvOutput({
        output: res.output,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        durationMs: res.durationMs,
        provider: res.provider,
      });
    } catch (err) {
      // **502/504 ليسا خطأً في المستخدم** — نعرضهما كرسالة «المزوّد لم
      // يستجب» مع زرّ إعادة، لا بانراً «خطأ» عاماً.
      if (err instanceof ApiError && err.code === 'PROVIDER_ERROR') {
        setInvErrorKey('pages.ai.providerNotResponding');
      } else if (err instanceof ApiError && err.code === 'PROVIDER_TIMEOUT') {
        setInvErrorKey('pages.ai.providerTimeout');
      } else {
        setInvErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
      }
    } finally {
      setInvBusy(false);
    }
  }

  const columns: readonly Column<AiIntegration>[] = [
    {
      key: 'provider',
      headerKey: 'pages.ai.col.provider',
      render: (r) => <Badge tone="neutral">{r.provider}</Badge>,
    },
    {
      key: 'keyRef',
      headerKey: 'pages.ai.col.keyRef',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-muted">
          {r.apiKeyRef}
        </span>
      ),
    },
    {
      key: 'enabled',
      headerKey: 'pages.ai.col.enabled',
      render: (r) => (
        <Badge tone={r.enabled ? 'success' : 'neutral'}>
          {r.enabled ? '✓' : '—'}
        </Badge>
      ),
    },
    {
      key: 'capabilities',
      headerKey: 'pages.ai.col.capabilities',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.capabilities.map((c) => (
            <Badge key={c} tone="accent">
              {c}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'since',
      headerKey: 'pages.ai.col.since',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-subtle">
          {r.configuredAt.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'by',
      headerKey: 'pages.ai.col.by',
      render: (r) => (
        <span dir="ltr" className="text-xs text-fg-subtle">
          {r.configuredBy ?? t('pages.projects.editor.systemActor')}
        </span>
      ),
    },
    {
      key: 'actions',
      headerKey: 'pages.ai.col.actions',
      align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
          {t('pages.ai.delete')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.ai.title"
        subtitleKey="pages.ai.subtitle"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setInvokeOpen(true)}>
              {t('pages.ai.capabilityInvokeTitle')}
            </Button>
            <Button onClick={() => setAddOpen(true)}>{t('pages.ai.add')}</Button>
          </div>
        }
      />

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState titleKey="pages.ai.empty" bodyKey="pages.ai.emptyBody" />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.provider}
          loading={loading}
          emptyKey="pages.ai.empty"
        />
      )}

      {/* Add integration dialog */}
      <Dialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddErrorKey(null);
          if (apiKeyRef.current) apiKeyRef.current.value = '';
        }}
        titleKey="pages.ai.addTitle"
        confirmKey="pages.ai.submit"
        onConfirm={doAdd}
      >
        <div className="space-y-3">
          {addErrorKey && !addErrorField && <Alert kind="danger" titleKey={addErrorKey} />}
          <Field labelKey="pages.ai.provider" htmlFor="ai-provider" required>
            <select
              id="ai-provider"
              value={addProvider}
              onChange={(e) => setAddProvider(e.target.value as AiProvider)}
              disabled={addBusy}
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field
            labelKey="pages.ai.apiKey"
            htmlFor="ai-key"
            required
            helpKey="pages.ai.apiKeyHint"
            {...(addErrorField === 'apiKey'
              ? { errorKey: 'errors.API_KEY_VALIDATION_FAILED' }
              : {})}
          >
            {/* type=password + autocomplete=off + no state binding. */}
            <input
              id="ai-key"
              ref={apiKeyRef}
              type="password"
              autoComplete="off"
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
              disabled={addBusy}
            />
          </Field>
        </div>
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDelErrorKey(null);
        }}
        titleKey="pages.ai.confirmDelete"
        bodyKey="pages.ai.confirmDeleteBody"
        confirmKey="pages.ai.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {delErrorKey && <Alert kind="danger" titleKey={delErrorKey} />}
      </Dialog>

      {/* Invoke dialog (S22 مصغَّر — استدعاء قدرة داخل الإعدادات لاختبارها) */}
      <Dialog
        open={invokeOpen}
        onClose={() => {
          setInvokeOpen(false);
          setInvOutput(null);
          setInvErrorKey(null);
        }}
        titleKey="pages.ai.capabilityInvokeTitle"
      >
        <div className="space-y-3">
          <Field labelKey="pages.ai.capability" htmlFor="inv-cap">
            <select
              id="inv-cap"
              value={invCapability}
              onChange={(e) => setInvCapability(e.target.value)}
              className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
              disabled={invBusy}
            >
              {CAPABILITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field labelKey="pages.ai.invokeInput" htmlFor="inv-input">
            <Textarea
              id="inv-input"
              value={invInput}
              onChange={(e) => setInvInput(e.target.value)}
              rows={3}
              disabled={invBusy}
            />
          </Field>
          <Button onClick={() => void doInvoke()} loading={invBusy} disabled={invBusy}>
            {t('pages.ai.invoke')}
          </Button>

          {invErrorKey && (
            <div className="rounded border border-warning bg-warning/10 p-3 text-sm">
              <p className="font-medium text-fg">{t(invErrorKey)}</p>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void doInvoke()}
                  disabled={invBusy}
                >
                  {t('pages.ai.retry')}
                </Button>
              </div>
            </div>
          )}

          {invOutput && (
            <div className="space-y-2">
              <div className="text-xs text-fg-subtle">{t('pages.ai.output')}</div>
              <pre
                dir="ltr"
                className="max-h-[30vh] overflow-auto rounded border border-border bg-surface-2 p-3 text-[11px]"
              >
                {JSON.stringify(invOutput.output, null, 2)}
              </pre>
              <div className="grid grid-cols-4 gap-2 text-[11px] text-fg-muted">
                <div>
                  <div className="text-fg-subtle">{t('pages.ai.tokensIn')}</div>
                  <div dir="ltr">{invOutput.tokensIn}</div>
                </div>
                <div>
                  <div className="text-fg-subtle">{t('pages.ai.tokensOut')}</div>
                  <div dir="ltr">{invOutput.tokensOut}</div>
                </div>
                <div>
                  <div className="text-fg-subtle">{t('pages.ai.durationMs')}</div>
                  <div dir="ltr">{invOutput.durationMs}</div>
                </div>
                <div>
                  <div className="text-fg-subtle">provider</div>
                  <div dir="ltr">{invOutput.provider}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
