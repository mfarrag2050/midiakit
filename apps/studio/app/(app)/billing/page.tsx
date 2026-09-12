'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  PageHeader,
  Textarea,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, subscription, usage } from '@/src/api';
import type { Subscription, QuotaField } from '@/src/api/endpoints/subscription';
import type { UsageWindow } from '@/src/api/endpoints/usage';

// S20 — الاشتراك + الاستهلاك.
// **قاعدة العقد:** `limits` جزء من `usage/current` — لا نستدعي subscription
// لأجلها. subscription يعطي: خطة، مقاعد، quotas (used+limit). usage
// يعطي: العدّ الحيّ + limits تطبيقية.

function fmtLimit(v: number | 'unlimited', t: (k: string) => string): string {
  return v === 'unlimited' ? t('pages.billing.unlimited') : String(v);
}

function QuotaBar({ q, labelKey }: { q: QuotaField; labelKey: string }): JSX.Element {
  const { t } = useLocale();
  const pct =
    q.limit === 'unlimited' ? 0 : Math.min(100, Math.round((q.used / q.limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{t(labelKey)}</span>
        <span dir="ltr" className="text-fg-subtle">
          {q.used} / {fmtLimit(q.limit, t)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-surface-2">
        <div
          className={
            'h-full ' +
            (pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-accent')
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage(): JSX.Element {
  const { t } = useLocale();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [use, setUse] = useState<UsageWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelErrorKey, setCancelErrorKey] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErrorKey, setCheckoutErrorKey] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const [s, u] = await Promise.all([subscription.get(), usage.current()]);
      setSub(s);
      setUse(u);
    } catch (err) {
      setLoadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function doCheckout(): Promise<void> {
    setCheckoutBusy(true);
    setCheckoutErrorKey(null);
    try {
      const res = await subscription.checkout({
        plan: 'studio',
        returnUrl: window.location.href,
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setCheckoutErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function doCancel(): Promise<void> {
    setCancelBusy(true);
    setCancelErrorKey(null);
    try {
      const next = await subscription.cancel({ reason: cancelReason.trim() });
      setSub(next);
      setCancelOpen(false);
      setCancelReason('');
    } catch (err) {
      setCancelErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCancelBusy(false);
    }
  }

  async function doResume(): Promise<void> {
    try {
      const next = await subscription.resume();
      setSub(next);
    } catch {
      /* silent — لن نُظهر خطأ resume عادةً */
    }
  }

  if (loading) return <div className="p-8 text-fg-muted">{t('common.loading')}</div>;
  if (loadErrorKey) return <Alert kind="danger" titleKey={loadErrorKey} />;
  if (!sub || !use) return <div />;

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.billing.title"
        subtitleKey="pages.billing.subtitle"
        action={
          <div className="flex items-center gap-2">
            {sub.cancelAtPeriodEnd ? (
              <Button onClick={() => void doResume()}>
                {t('pages.billing.resumePlan')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                {t('pages.billing.cancelPlan')}
              </Button>
            )}
            <Button onClick={() => void doCheckout()} loading={checkoutBusy}>
              {t('pages.billing.upgrade')}
            </Button>
          </div>
        }
      />

      {checkoutErrorKey && <Alert kind="danger" titleKey={checkoutErrorKey} />}

      <section className="grid gap-6 md:grid-cols-3">
        <div className="space-y-3 rounded border border-border bg-surface-2 p-4">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.billing.planLabel')}
          </div>
          <div className="text-lg font-semibold">{sub.plan}</div>
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={sub.status === 'active' ? 'success' : 'warning'}>
              {sub.status}
            </Badge>
            {sub.cancelAtPeriodEnd && (
              <Badge tone="danger">{t('pages.billing.cancelsAt')}</Badge>
            )}
          </div>
          <div className="text-xs text-fg-subtle">
            {sub.cancelAtPeriodEnd
              ? t('pages.billing.cancelsAt')
              : t('pages.billing.renewsAt')}
            :{' '}
            <span dir="ltr">
              {sub.currentPeriodEnd ? sub.currentPeriodEnd.slice(0, 10) : '—'}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded border border-border bg-surface-2 p-4">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.billing.seats')}
          </div>
          <div dir="ltr" className="text-lg font-semibold">
            {sub.seats.used} / {fmtLimit(sub.seats.limit, t)}
          </div>
        </div>

        <div className="space-y-3 rounded border border-border bg-surface-2 p-4">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.billing.quotas')}
          </div>
          <QuotaBar q={sub.quotas.brandKits} labelKey="pages.billing.quota.brandKits" />
          <QuotaBar q={sub.quotas.videos} labelKey="pages.billing.quota.videos" />
          <QuotaBar q={sub.quotas.renders} labelKey="pages.billing.quota.renders" />
        </div>
      </section>

      <section className="space-y-3 rounded border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-fg-muted">
            {t('pages.billing.counts')}
          </div>
          <div dir="ltr" className="text-xs text-fg-subtle">
            {use.periodStart.slice(0, 10)} → {use.periodEnd.slice(0, 10)}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded border border-border bg-surface p-3">
            <div className="text-xs text-fg-subtle">
              {t('pages.billing.count.rendersTotal')}
            </div>
            <div dir="ltr" className="text-lg font-semibold text-fg">
              {use.counts.rendersTotal}
            </div>
          </div>
          <div className="rounded border border-border bg-surface p-3">
            <div className="text-xs text-fg-subtle">
              {t('pages.billing.count.videos')}
            </div>
            <div dir="ltr" className="text-lg font-semibold text-fg">
              {use.counts.videos}
            </div>
          </div>
          <div className="rounded border border-border bg-surface p-3">
            <div className="text-xs text-fg-subtle">
              {t('pages.billing.count.storageBytes')}
            </div>
            <div dir="ltr" className="text-lg font-semibold text-fg">
              {use.counts.storageBytes.toLocaleString('en-US')}
            </div>
          </div>
          <div className="rounded border border-border bg-surface p-3">
            <div className="text-xs text-fg-subtle">
              {t('pages.billing.count.aiTokens')}
            </div>
            <div dir="ltr" className="text-lg font-semibold text-fg">
              {(use.counts.aiTokensIn ?? 0) + (use.counts.aiTokensOut ?? 0)}
            </div>
            <p className="mt-1 text-[10px] text-fg-subtle">
              {t('pages.billing.aiHint')}
            </p>
          </div>
        </div>
      </section>

      <Dialog
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setCancelReason('');
          setCancelErrorKey(null);
        }}
        titleKey="pages.billing.cancelConfirm"
        confirmKey="pages.billing.cancelPlan"
        variant="danger"
        onConfirm={doCancel}
      >
        <div className="space-y-3">
          {cancelErrorKey && <Alert kind="danger" titleKey={cancelErrorKey} />}
          <Field labelKey="pages.billing.cancelReason" htmlFor="cancel-reason" required>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelBusy}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
