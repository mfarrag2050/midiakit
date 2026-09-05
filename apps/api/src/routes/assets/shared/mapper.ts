/**
 * mapper — DB row → response shape (docs/16 §9.2).
 *
 * يُنتَج publicUrl عند الطلب (§9.4 و §9.5)، لا مع كل قراءة قائمة.
 * قائمة §9.3 ترجع بلا publicUrl.
 */

export interface DbAssetRow {
  id: string;
  tenant_id: string;
  kind: string;
  storage_key: string;
  public_url: string | null;
  license_ack: boolean;
  metadata: Record<string, unknown>;
  faces: unknown[] | null;
  filename: string | null;
  size_bytes: string | number | null;   // pg يعيد bigint كسلسلة
  content_type: string | null;
  ack_by: string | null;
  ack_at: Date | null;
  warnings: unknown[] | null;
  finalized_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AssetResponse {
  id: string;
  kind: string;
  filename: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  licenseAck: boolean;
  ackBy: string | null;
  ackAt: string | null;
  meta: Record<string, unknown>;
  faces: unknown[] | null;
  warnings: unknown[] | null;
  publicUrl?: string;                    // يُضاف عند §9.2/9.4/9.5
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

export function toAssetResponse(row: DbAssetRow, publicUrl?: string): AssetResponse {
  const size = row.size_bytes == null ? null : Number(row.size_bytes);
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    sizeBytes: size,
    contentType: row.content_type,
    licenseAck: row.license_ack,
    ackBy: row.ack_by,
    ackAt: row.ack_at ? row.ack_at.toISOString() : null,
    meta: row.metadata ?? {},
    faces: row.faces,
    warnings: row.warnings,
    ...(publicUrl ? { publicUrl } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
  };
}

/** Cursor: base64url({createdAt, id}) — نفس نمط users/brand-kits */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      c?: string; i?: string;
    };
    if (!p.c || !p.i) return null;
    return { createdAt: p.c, id: p.i };
  } catch { return null; }
}
