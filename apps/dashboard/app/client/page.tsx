'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';
import { Ltr } from '@/src/i18n/Ltr';

interface JobRow {
  jobId: string;
  queue: 'urgent' | 'normal' | 'edit' | 'batch';
  status:
    | 'active'
    | 'waiting'
    | 'prioritized'
    | 'delayed'
    | 'completed'
    | 'failed'
    | 'unknown';
  position: number | null;
  expectedStartSec: number | null;
  progress: number | null;
}

interface ClientPayload {
  tenantId: string;
  jobs: JobRow[];
  system: { status: 'normal' | 'degraded' | 'maintenance'; reason: string };
  totalWaiting: number;
  totalActive: number;
  ts: string;
}

const REFRESH_MS = 3000;

function useTenantId(): [string, (id: string) => void] {
  const [tenantId, setTenantId] = useState<string>('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTenantId(params.get('tenantId') ?? '');
  }, []);
  const update = (id: string): void => {
    setTenantId(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('tenantId', id);
    else params.delete('tenantId');
    const q = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${q ? `?${q}` : ''}`
    );
  };
  return [tenantId, update];
}

function useHumanSec(): (s: number | null) => string {
  const { t } = useLocale();
  return (s) => {
    if (s === null) return '—';
    if (s < 1) return t('time.now');
    if (s < 60) return `${Math.round(s)} ${t('time.sec')}`;
    return `${(s / 60).toFixed(1)} ${t('time.min')}`;
  };
}

function usePrimaryLine(): (jobs: JobRow[]) => string {
  const { t } = useLocale();
  const human = useHumanSec();
  return (jobs) => {
    const active = jobs.find((j) => j.status === 'active');
    if (active) {
      if (active.progress !== null) {
        return t('client.jobRunningPct', { pct: Math.round(active.progress) });
      }
      return t('client.jobRunning');
    }
    const waiting = jobs
      .filter((j) => j.status === 'waiting' || j.status === 'prioritized')
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))[0];
    if (waiting) {
      const pos = waiting.position ?? 0;
      const eta = waiting.expectedStartSec ?? 0;
      return t('client.jobPositioned', { n: pos, eta: human(eta) });
    }
    const delayed = jobs.find((j) => j.status === 'delayed');
    if (delayed) return t('client.jobDelayed');
    return t('client.noJobs');
  };
}

function statusStyle(status: JobRow['status']): string {
  if (status === 'active') return 'text-emerald-300';
  if (status === 'waiting' || status === 'prioritized') return 'text-amber-300';
  if (status === 'failed') return 'text-rose-300';
  return 'text-white/60';
}

function systemPillClass(status: ClientPayload['system']['status']): string {
  if (status === 'normal') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'degraded') return 'bg-amber-500/20 text-amber-300';
  return 'bg-rose-500/20 text-rose-300';
}

export default function ClientDashboard(): JSX.Element {
  const { t } = useLocale();
  const [tenantId, setTenantId] = useTenantId();
  const [data, setData] = useState<ClientPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState<string>('');
  const humanSec = useHumanSec();
  const primary = usePrimaryLine();

  useEffect(() => {
    if (!tenantId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/client?tenantId=${encodeURIComponent(tenantId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'error');
          return;
        }
        setError(null);
        setData(json);
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tenantId]);

  const systemLabel = useMemo(() => {
    if (!data) return '';
    return t(`system.${data.system.status}`);
  }, [data, t]);

  if (!tenantId) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <p className="mb-3 text-sm text-white/70">{t('client.tenantPrompt')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputVal.trim()) setTenantId(inputVal.trim());
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
            placeholder={t('client.placeholder')}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
          >
            {t('client.viewButton')}
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">{t('client.urlHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/40">
            {tenantId}
          </span>
          {data && (
            <span
              className={`rounded-full px-3 py-1 text-xs ${systemPillClass(data.system.status)}`}
            >
              {systemLabel}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold leading-relaxed tabular">
          {data ? primary(data.jobs) : t('client.loading')}
        </p>
        {data && data.system.status !== 'normal' && (
          <p className="mt-2 text-sm text-white/60">{data.system.reason}</p>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/70">
          {t('client.currentJobs')}
        </h2>
        {data && data.jobs.length === 0 && (
          <p className="text-sm text-white/50">{t('client.emptyJobs')}</p>
        )}
        {data && data.jobs.length > 0 && (
          <table className="w-full text-sm tabular">
            <thead className="text-xs text-white/50">
              <tr className="border-b border-white/10">
                <th className="py-2 text-start font-normal">{t('client.col.jobId')}</th>
                <th className="py-2 text-start font-normal">{t('client.col.queue')}</th>
                <th className="py-2 text-start font-normal">{t('client.col.status')}</th>
                <th className="py-2 text-start font-normal">{t('client.col.position')}</th>
                <th className="py-2 text-start font-normal">{t('client.col.eta')}</th>
                <th className="py-2 text-start font-normal">{t('client.col.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.jobId} className="border-b border-white/5">
                  <td className="py-2 font-mono text-xs text-white/60">
                    <Ltr>{j.jobId}</Ltr>
                  </td>
                  <td className="py-2">{t(`queue.${j.queue}`)}</td>
                  <td className={`py-2 ${statusStyle(j.status)}`}>
                    {t(`status.${j.status}`)}
                  </td>
                  <td className="py-2">{j.position ?? '—'}</td>
                  <td className="py-2">{humanSec(j.expectedStartSec)}</td>
                  <td className="py-2">
                    {j.progress !== null ? (
                      <Ltr>{`${Math.round(j.progress)}%`}</Ltr>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-white/30">
        {t('footer.refresh', { n: REFRESH_MS / 1000 })}
        {data && (
          <>
            {' · '}
            {t('footer.lastUpdate', {
              time: new Date(data.ts).toLocaleTimeString(),
            })}
          </>
        )}
      </p>
    </div>
  );
}
