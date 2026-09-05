/**
 * mapper — DB row → response shape (docs/16 §8).
 */

export interface DbRenderRow {
  id: string;
  tenant_id: string;
  project_id: string;
  size: string;
  format: string;
  status: string;
  output_storage_key: string | null;
  brand_snapshot: Record<string, unknown> | null;
  template_snapshot: Record<string, unknown> | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  requested_by: string | null;
  idempotency_key: string | null;
  cancel_requested_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * §8.2 list shape (بلا output_url في القائمة — يُطلَب عبر §8.4).
 * §8.1 uses brand_snapshot_id / template_snapshot_id — نستعمل render.id
 * كمعرّف اللقطة (deterministic).
 */
export interface RenderSummary {
  id: string;
  project_id: string;
  status: string;
  size: string;
  format: string;
  output_url: string | null;
  duration_ms: number | null;
  brand_snapshot_id: string;
  template_snapshot_id: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RenderFull extends RenderSummary {
  error?: { code: string; message: string | null };
  waitMs?: number;
}

export interface RenderCreated {
  id: string;
  status: 'queued';
  queuedAt: string;
  estimatedStartAt: string;
  brand_snapshot_id: string;
  template_snapshot_id: string;
}

export function toSummary(row: DbRenderRow): RenderSummary {
  return {
    id: row.id,
    project_id: row.project_id,
    status: row.status,
    size: row.size,
    format: row.format,
    output_url: null,  // §8.2 صراحةً بلا output_url في القائمة
    duration_ms: row.duration_ms,
    brand_snapshot_id: row.id,
    template_snapshot_id: row.id,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export function toFull(row: DbRenderRow): RenderFull {
  const base = toSummary(row);
  const out: RenderFull = { ...base };
  if (row.error_code) {
    out.error = { code: row.error_code, message: row.error_message };
  }
  if (row.started_at && row.created_at) {
    out.waitMs = row.started_at.getTime() - row.created_at.getTime();
  }
  return out;
}

/** Cursor (createdAt DESC) */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as { c?: string; i?: string };
    if (!p.c || !p.i) return null;
    return { createdAt: p.c, id: p.i };
  } catch { return null; }
}
