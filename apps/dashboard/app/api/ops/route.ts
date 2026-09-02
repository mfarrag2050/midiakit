// GET /api/ops — لوحة التشغيل. كل ما تحتاجه polling على 3s.

import { NextResponse } from 'next/server';

import {
  queueDepth,
  activeJobs,
  failureRate,
  resourceUsage,
  tenantDistribution,
  systemStatus,
} from '@pf-mediakit/renderer/observe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// عتبات docs/08 §المراقبة — تعرض «الموقع من كل عتبة»
const THRESHOLDS = {
  diskPct: 80,
  queueDepth: 10,
  workerAgeMs: 5 * 60 * 1000,
  peakLoadWaitSec: 45,
};

export async function GET(): Promise<NextResponse> {
  try {
    const [depths, active, fails, res, tenants, sys] = await Promise.all([
      queueDepth(),
      activeJobs(),
      failureRate(24),
      resourceUsage(),
      tenantDistribution(),
      systemStatus(),
    ]);

    const oldestActive = active.reduce((m, j) => Math.max(m, j.ageMs), 0);
    const currentMaxQueueDepth = depths.reduce(
      (m, d) => (d.waiting > m ? d.waiting : m),
      0
    );

    return NextResponse.json(
      {
        depths,
        active,
        failures: fails,
        resources: res,
        tenants,
        system: sys,
        thresholds: {
          ...THRESHOLDS,
          currentDiskPct: res.diskUsedPct,
          currentMaxQueueDepth,
          currentOldestActiveMs: oldestActive,
        },
        ts: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String((err as Error).message ?? err) },
      { status: 500 }
    );
  }
}
