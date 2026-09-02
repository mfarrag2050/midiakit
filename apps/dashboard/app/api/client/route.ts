// GET /api/client?tenantId=X
// يعيد كل مهام المستأجر + حالة النظام. للـpolling كل 3 ثوانٍ من الواجهة.

import { NextResponse } from 'next/server';

import { tenantJobs, systemStatus, queueDepth } from '@pf-mediakit/renderer/observe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId')?.trim();
  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId required in query string' },
      { status: 400 }
    );
  }

  try {
    const [jobs, sys, depths] = await Promise.all([
      tenantJobs(tenantId),
      systemStatus(),
      queueDepth(),
    ]);
    return NextResponse.json(
      {
        tenantId,
        jobs,
        system: sys,
        totalWaiting: depths.reduce((s, d) => s + d.waiting, 0),
        totalActive: depths.reduce((s, d) => s + d.active, 0),
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
