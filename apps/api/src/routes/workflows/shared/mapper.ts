/**
 * mapper — DB row → response shape (docs/16 §11).
 */
import type { WorkflowState, WorkflowTransition } from './schema.js';

export interface DbWorkflowRow {
  id: string;
  tenant_id: string;
  name: string;
  kind: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
}

export interface WorkflowFull extends WorkflowSummary {
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  createdAt: string;
  updatedAt: string;
}

export function toSummary(row: DbWorkflowRow): WorkflowSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isDefault: row.is_default,
  };
}

export function toFull(row: DbWorkflowRow): WorkflowFull {
  return {
    ...toSummary(row),
    states: row.states,
    transitions: row.transitions,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

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
