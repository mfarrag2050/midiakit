/**
 * mapper — DB row → response shape (docs/16 §7).
 *
 * انحراف اسمي: DB يستعمل `name` (من A2)، العقد §7 يستعمل `title`.
 * الـmapper يوحّد على `title` في السلك (الاستوديو يقرأ title).
 */

export interface DbProjectRow {
  id: string;
  tenant_id: string;
  brand_kit_id: string;
  template_id: string;
  workflow_id: string | null;
  name: string;                          // مُعرَّض كـtitle (§7)
  content: Record<string, unknown>;
  state: string;                         // A14 — يبدأ 'draft'
  assignee_id: string | null;            // A14
  locale: string;                        // A14
  deleted_at: Date | null;               // A14 soft delete
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectSummary {
  id: string;
  title: string;
  brand_kit_id: string;
  template_id: string;
  currentState: string;
  assigneeId: string | null;
  updatedAt: string;
}

export interface ProjectFull extends ProjectSummary {
  content: Record<string, unknown>;
  locale: string;
  workflow_id: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function toSummary(row: DbProjectRow): ProjectSummary {
  return {
    id: row.id,
    title: row.name,
    brand_kit_id: row.brand_kit_id,
    template_id: row.template_id,
    currentState: row.state,
    assigneeId: row.assignee_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toFull(row: DbProjectRow): ProjectFull {
  return {
    ...toSummary(row),
    content: row.content,
    locale: row.locale,
    workflow_id: row.workflow_id,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

/** Cursor: base64url({updatedAt, id}) — الترتيب الافتراضي -updatedAt */
export function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ u: updatedAt.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      u?: string; i?: string;
    };
    if (!p.u || !p.i) return null;
    return { updatedAt: p.u, id: p.i };
  } catch { return null; }
}
