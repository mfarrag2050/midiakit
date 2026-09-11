/**
 * mapper — DB row → response shape (docs/16 §6).
 *
 * القائمة (§6.1) تُظهر بيانات ملخّصة (بلا definition).
 * التفاصيل (§6.2) تُعيد الكائن الكامل حسب docs/04.
 */

export interface DbTemplateRow {
  id: string;
  tenant_id: string | null;
  scope: 'global' | 'tenant';
  kind: string;
  name: string;
  definition: Record<string, unknown>;
  source_ref: string | null;
  definition_hash: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateSummary {
  id: string;
  scope: 'global' | 'tenant';
  name: string;
  kind: string;
  createdAt: string;
}

export interface TemplateFull extends TemplateSummary {
  definition: Record<string, unknown>;
  updatedAt: string;
}

export function toSummary(row: DbTemplateRow): TemplateSummary {
  return {
    id: row.id,
    scope: row.scope,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
  };
}

export function toFull(row: DbTemplateRow): TemplateFull {
  return {
    ...toSummary(row),
    definition: row.definition,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Cursor: base64url({createdAt, id}) — نفس نمط users/assets */
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
