/**
 * mapper — DB row → response shape (docs/16 §9.2).
 *
 * يُنتَج publicUrl عند الطلب (§9.4 و §9.5)، لا مع كل قراءة قائمة.
 * قائمة §9.3 ترجع بلا publicUrl.
 *
 * ── محاذاة الشكل (A11-SHAPE 2026-09-06) ──────────────────────────
 * §9.2 يعرّف:
 *   { id, kind, publicUrl, sizeBytes, meta{label, capabilities, faces},
 *     licenseAck, ackBy, ackAt, createdAt }
 *   وحقل إضافي `warnings` عند SVG_HAS_TEXT فقط.
 *
 * الشكل المُنفَّذ يوسّع العقد بأربعة حقول (يُعلَن، لا يُحذف حتى قرار):
 *   • filename       — الاستوديو يعرضه في القائمة (§9.1 يذكره في المدخلات).
 *   • contentType    — الاستوديو يميّز أنواع MIME في المعاينة.
 *   • updatedAt      — لعرض «آخر تعديل».
 *   • finalizedAt    — نيول أوّلاً (draft)، ثم يُملأ عند اكتمال §9.2.
 *                      الاستوديو يستعمله للتمييز.
 *
 * محاذاة صريحة:
 *   • `faces` صار داخل `meta.faces` (كما §9.2). لم يعد top-level.
 *   • `warnings` يُحذَف عند null (§9.2 يُظهره فقط عند وجوده — كذلك §9.2
 *     يقول «الاستجابة تحمل حقلاً إضافياً»).
 *   • `url` (S3 internal) لا يُكشَف للمتصفح (§9.2 نصّاً — «not exposed to browser»).
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
  filename: string | null;            // امتداد فوق §9.2 — الاستوديو يعرضه
  sizeBytes: number | null;
  contentType: string | null;         // امتداد فوق §9.2
  licenseAck: boolean;
  ackBy: string | null;
  ackAt: string | null;
  meta: Record<string, unknown>;      // يشمل meta.faces (§9.2)
  warnings?: unknown[];               // يظهر فقط عند وجوده (§9.2)
  publicUrl?: string;                 // يُضاف عند §9.2/9.4/9.5
  createdAt: string;
  updatedAt: string;                  // امتداد فوق §9.2
  finalizedAt: string | null;         // امتداد فوق §9.2 (draft/active)
}

export function toAssetResponse(row: DbAssetRow, publicUrl?: string): AssetResponse {
  const size = row.size_bytes == null ? null : Number(row.size_bytes);

  // meta يجمع metadata من DB + faces (§9.2 يضعها داخل meta لا top-level).
  const meta: Record<string, unknown> = { ...(row.metadata ?? {}) };
  if (row.faces != null) meta.faces = row.faces;

  const out: AssetResponse = {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    sizeBytes: size,
    contentType: row.content_type,
    licenseAck: row.license_ack,
    ackBy: row.ack_by,
    ackAt: row.ack_at ? row.ack_at.toISOString() : null,
    meta,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
  };
  // warnings يُحذَف عند null — §9.2 يعرضه فقط عند وجوده (لـSVG_HAS_TEXT).
  if (row.warnings != null) out.warnings = row.warnings;
  if (publicUrl) out.publicUrl = publicUrl;
  return out;
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
