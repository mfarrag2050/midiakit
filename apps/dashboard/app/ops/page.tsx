'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';
import { Ltr } from '@/src/i18n/Ltr';

type QueueName = 'urgent' | 'normal' | 'edit' | 'batch';

interface QueueDepth {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
  concurrency: number;
}

interface ActiveJob {
  jobId: string;
  queue: string;
  tenantId: string;
  templateId: string;
  ageMs: number;
  progress: number | null;
}

interface Failures {
  windowHours: number;
  totalFailures: number;
  totalCompleted: number;
  failureRate: number;
  reasons: Array<{ category: string; count: number }>;
}

interface Resources {
  cpuLoadAvg1m: number;
  cpuLoadAvg5m: number;
  cores: number;
  memTotalGB: number;
  memUsedGB: number;
  memUsedPct: number;
  diskTotalGB: number | null;
  diskUsedGB: number | null;
  diskUsedPct: number | null;
  diskPath: string;
}

interface Tenant {
  tenantId: string;
  waiting: number;
  active: number;
  delayed: number;
}

interface OpsPayload {
  depths: QueueDepth[];
  active: ActiveJob[];
  failures: Failures;
  resources: Resources;
  tenants: Tenant[];
  system: { status: string; reason: string };
  thresholds: {
    diskPct: number;
    queueDepth: number;
    workerAgeMs: number;
    peakLoadWaitSec: number;
    currentDiskPct: number | null;
    currentMaxQueueDepth: number;
    currentOldestActiveMs: number;
  };
  ts: string;
}

const REFRESH_MS = 3000;

function useHumanMs(): (ms: number) => string {
  const { t } = useLocale();
  return (ms) => {
    if (ms < 1000) return `${ms} ${t('time.ms')}`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} ${t('time.sec')}`;
    return `${(ms / 60_000).toFixed(1)} ${t('time.min')}`;
  };
}

function ThresholdBar({
  current,
  limit,
  label,
}: {
  current: number;
  limit: number;
  label: string;
}): JSX.Element {
  const pct = Math.min(100, (current / limit) * 100);
  const color =
    pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-white/60">
        <span>{label}</span>
        <Ltr className="tabular">
          {current.toFixed(1)} / {limit}
        </Ltr>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function OpsDashboard(): JSX.Element {
  const { t } = useLocale();
  const [data, setData] = useState<OpsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const humanMs = useHumanMs();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ops');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'error');
        return;
      }
      setError(null);
      setData(json);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const doAction = async (body: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/ops/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setActionMsg(
        res.ok
          ? `✓ ${JSON.stringify(json)}`
          : `✗ ${json.error ?? 'error'} (HTTP ${res.status})`
      );
      await load();
    } catch (e) {
      setActionMsg(`✗ ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        {error ? `error: ${error}` : t('client.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white/70">
          {t('ops.thresholds')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ThresholdBar
            current={data.thresholds.currentDiskPct ?? 0}
            limit={data.thresholds.diskPct}
            label={t('ops.thDisk')}
          />
          <ThresholdBar
            current={data.thresholds.currentMaxQueueDepth}
            limit={data.thresholds.queueDepth}
            label={t('ops.thDeepest')}
          />
          <ThresholdBar
            current={data.thresholds.currentOldestActiveMs / 1000}
            limit={data.thresholds.workerAgeMs / 1000}
            label={t('ops.thOldest')}
          />
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/70">
            {t('ops.queues')}
          </h2>
          <span className="text-xs text-white/40">
            {t('system.label')}: {t(`system.${data.system.status}`)} — {data.system.reason}
          </span>
        </div>
        <table className="w-full text-sm tabular">
          <thead className="text-xs text-white/50">
            <tr className="border-b border-white/10">
              <th className="py-2 text-start font-normal">{t('ops.col.name')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.workers')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.waiting')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.active')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.delayed')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.completed')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.failed')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.state')}</th>
              <th className="py-2 text-start font-normal">{t('ops.col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {data.depths.map((d) => (
              <tr key={d.name} className="border-b border-white/5">
                <td className="py-2 font-semibold">{t(`queue.${d.name}`)}</td>
                <td className="py-2">{d.concurrency}</td>
                <td className={`py-2 ${d.waiting > 10 ? 'text-amber-300' : ''}`}>
                  {d.waiting}
                </td>
                <td className="py-2">{d.active}</td>
                <td className="py-2">{d.delayed}</td>
                <td className="py-2 text-white/50">{d.completed}</td>
                <td className={`py-2 ${d.failed > 0 ? 'text-rose-300' : 'text-white/50'}`}>
                  {d.failed}
                </td>
                <td className="py-2">
                  {d.paused ? (
                    <span className="text-amber-300">{t('ops.state.paused')}</span>
                  ) : (
                    <span className="text-emerald-300">{t('ops.state.running')}</span>
                  )}
                </td>
                <td className="py-2">
                  <button
                    disabled={busy}
                    onClick={() =>
                      doAction({
                        type: d.paused ? 'resume' : 'pause',
                        queue: d.name,
                      })
                    }
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                  >
                    {d.paused ? t('ops.action.resume') : t('ops.action.pause')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/70">
          {t('ops.activeJobs', { n: data.active.length })}
        </h2>
        {data.active.length === 0 ? (
          <p className="text-sm text-white/50">{t('ops.noActive')}</p>
        ) : (
          <table className="w-full text-sm tabular">
            <thead className="text-xs text-white/50">
              <tr className="border-b border-white/10">
                <th className="py-2 text-start font-normal">{t('ops.activeCol.jobId')}</th>
                <th className="py-2 text-start font-normal">{t('ops.activeCol.queue')}</th>
                <th className="py-2 text-start font-normal">{t('ops.activeCol.tenant')}</th>
                <th className="py-2 text-start font-normal">{t('ops.activeCol.template')}</th>
                <th className="py-2 text-start font-normal">{t('ops.activeCol.age')}</th>
                <th className="py-2 text-start font-normal">{t('ops.activeCol.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {data.active.map((j) => (
                <tr key={`${j.queue}:${j.jobId}`} className="border-b border-white/5">
                  <td className="py-2 font-mono text-xs">
                    <Ltr>{j.jobId}</Ltr>
                  </td>
                  <td className="py-2">
                    {t(`queue.${j.queue as QueueName}`)}
                  </td>
                  <td className="py-2">{j.tenantId}</td>
                  <td className="py-2 text-white/60">{j.templateId}</td>
                  <td className={`py-2 ${j.ageMs > 5 * 60_000 ? 'text-rose-300' : ''}`}>
                    {humanMs(j.ageMs)}
                  </td>
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

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/70">
            {t('ops.failuresTitle', { n: data.failures.windowHours })}
          </h2>
          <p className="text-3xl font-bold tabular">
            <Ltr>{(data.failures.failureRate * 100).toFixed(1)}%</Ltr>
          </p>
          <p className="mt-1 text-xs text-white/50">
            {t('ops.failuresSubtitle', {
              fail: data.failures.totalFailures,
              total: data.failures.totalFailures + data.failures.totalCompleted,
            })}
          </p>
          {data.failures.reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {data.failures.reasons.map((r) => (
                <li
                  key={r.category}
                  className="flex justify-between border-b border-white/5 py-1"
                >
                  <span className="text-white/70">{r.category}</span>
                  <span className="tabular text-white/50">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/70">
            {t('ops.tenants')}
          </h2>
          {data.tenants.length === 0 ? (
            <p className="text-sm text-white/50">{t('ops.tenantsEmpty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.tenants.map((tn) => (
                <li
                  key={tn.tenantId}
                  className="flex justify-between border-b border-white/5 py-1"
                >
                  <span className="text-white/70">{tn.tenantId}</span>
                  <span className="tabular text-white/50">
                    {t('ops.tenantRow', {
                      waiting: tn.waiting,
                      active: tn.active,
                      delayed: tn.delayed,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/70">
          {t('ops.resources')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 text-sm tabular">
          <div>
            <div className="text-xs text-white/50">{t('ops.resCpu')}</div>
            <div className="text-lg font-semibold">
              <Ltr>
                {data.resources.cpuLoadAvg1m.toFixed(2)} /{' '}
                {data.resources.cpuLoadAvg5m.toFixed(2)}
              </Ltr>
            </div>
            <div className="text-xs text-white/40">
              {t('ops.resCpuOn', { n: data.resources.cores })}
            </div>
          </div>
          <div>
            <div className="text-xs text-white/50">{t('ops.resMem')}</div>
            <div className="text-lg font-semibold">
              <Ltr>
                {data.resources.memUsedGB.toFixed(1)} /{' '}
                {data.resources.memTotalGB.toFixed(1)} {t('units.gb')}
              </Ltr>
            </div>
            <div className="text-xs text-white/40">
              <Ltr>{data.resources.memUsedPct.toFixed(1)}%</Ltr>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/50">
              {t('ops.resDisk', { path: data.resources.diskPath })}
            </div>
            <div className="text-lg font-semibold">
              {data.resources.diskUsedGB !== null &&
              data.resources.diskTotalGB !== null ? (
                <Ltr>
                  {data.resources.diskUsedGB.toFixed(1)} /{' '}
                  {data.resources.diskTotalGB.toFixed(1)} {t('units.gb')}
                </Ltr>
              ) : (
                '—'
              )}
            </div>
            <div className="text-xs text-white/40">
              {data.resources.diskUsedPct !== null ? (
                <Ltr>{data.resources.diskUsedPct.toFixed(1)}%</Ltr>
              ) : (
                t('ops.resDiskUnavailable')
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/70">
          {t('ops.adminTitle')}
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            disabled={busy}
            onClick={() => doAction({ type: 'maintenance-on' })}
            className="rounded bg-amber-500/20 px-3 py-1.5 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
          >
            {t('ops.adminMaintOn')}
          </button>
          <button
            disabled={busy}
            onClick={() => doAction({ type: 'maintenance-off' })}
            className="rounded bg-emerald-500/20 px-3 py-1.5 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {t('ops.adminMaintOff')}
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const jobId = String(fd.get('jobId') ?? '').trim();
              const queue = String(fd.get('queue') ?? 'urgent');
              if (jobId) doAction({ type: 'kill-job', queue, jobId });
            }}
            className="flex items-center gap-1"
          >
            <select
              name="queue"
              className="rounded bg-black/30 px-2 py-1.5 text-xs"
            >
              <option value="urgent">{t('queue.urgent')}</option>
              <option value="normal">{t('queue.normal')}</option>
              <option value="edit">{t('queue.edit')}</option>
              <option value="batch">{t('queue.batch')}</option>
            </select>
            <input
              name="jobId"
              placeholder={t('ops.adminJobIdPh')}
              className="w-28 rounded bg-black/30 px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-rose-500/20 px-3 py-1.5 text-rose-200 hover:bg-rose-500/30 disabled:opacity-40"
            >
              {t('ops.adminKillJob')}
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const count = Number(fd.get('count') ?? '0');
              if (Number.isFinite(count)) doAction({ type: 'set-worker-count', count });
            }}
            className="flex items-center gap-1"
          >
            <input
              name="count"
              type="number"
              min={0}
              max={32}
              placeholder={t('ops.adminCountPh')}
              className="w-32 rounded bg-black/30 px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-white/10 px-3 py-1.5 hover:bg-white/20 disabled:opacity-40"
            >
              {t('ops.adminSetCount')}
            </button>
          </form>
        </div>
        {actionMsg && (
          <p className="mt-3 rounded bg-black/40 p-2 font-mono text-xs">{actionMsg}</p>
        )}
      </section>

      <p className="text-center text-xs text-white/30">
        {t('footer.refresh', { n: REFRESH_MS / 1000 })}
        {' · '}
        {t('footer.lastUpdate', {
          time: new Date(data.ts).toLocaleTimeString(),
        })}
      </p>
    </div>
  );
}
