/**
 * schema — تحقّق states/transitions JSON (docs/16 §11.2).
 *
 * states:      [{id, label, assignableTo?: string[]}]
 * transitions: [{id, from, to, label, requiredRole?, requiresReason?}]
 *
 * قواعد:
 *   - كل transition.from + transition.to يجب أن يشير إلى state.id موجود
 *   - id فريد داخل states وفريد داخل transitions
 *   - يفشل بـWorkflowSchemaViolation مع field يشير إلى الموضع
 */
import { WorkflowSchemaViolation } from '../../../errors.js';

export interface WorkflowState {
  id: string;
  label: string;
  assignableTo?: string[];
}

export interface WorkflowTransition {
  id: string;
  from: string;
  to: string;
  label: string;
  requiredRole?: string;
  requiresReason?: boolean;
}

export interface WorkflowDefinition {
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function validateWorkflowDefinition(raw: unknown): WorkflowDefinition {
  if (!isObj(raw)) throw WorkflowSchemaViolation('');
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r['states']) || r['states'].length === 0) {
    throw WorkflowSchemaViolation('states');
  }
  if (!Array.isArray(r['transitions'])) {
    throw WorkflowSchemaViolation('transitions');
  }

  const stateIds = new Set<string>();
  const states: WorkflowState[] = [];
  const rawStates = r['states'] as unknown[];
  for (let i = 0; i < rawStates.length; i++) {
    const s = rawStates[i];
    if (!isObj(s)) throw WorkflowSchemaViolation(`states[${i}]`);
    const id = s['id'];
    const label = s['label'];
    if (typeof id !== 'string' || id.length === 0) throw WorkflowSchemaViolation(`states[${i}].id`);
    if (typeof label !== 'string' || label.length === 0) throw WorkflowSchemaViolation(`states[${i}].label`);
    if (stateIds.has(id)) throw WorkflowSchemaViolation(`states[${i}].id (duplicate)`);
    stateIds.add(id);
    const state: WorkflowState = { id, label };
    if (s['assignableTo'] !== undefined) {
      if (!Array.isArray(s['assignableTo'])) throw WorkflowSchemaViolation(`states[${i}].assignableTo`);
      state.assignableTo = s['assignableTo'] as string[];
    }
    states.push(state);
  }

  const transitionIds = new Set<string>();
  const transitions: WorkflowTransition[] = [];
  const rawTrans = r['transitions'] as unknown[];
  for (let i = 0; i < rawTrans.length; i++) {
    const t = rawTrans[i];
    if (!isObj(t)) throw WorkflowSchemaViolation(`transitions[${i}]`);
    const id = t['id'];
    const from = t['from'];
    const to = t['to'];
    const label = t['label'];
    if (typeof id !== 'string' || id.length === 0) throw WorkflowSchemaViolation(`transitions[${i}].id`);
    if (typeof from !== 'string' || !stateIds.has(from)) throw WorkflowSchemaViolation(`transitions[${i}].from`);
    if (typeof to !== 'string' || !stateIds.has(to)) throw WorkflowSchemaViolation(`transitions[${i}].to`);
    if (typeof label !== 'string' || label.length === 0) throw WorkflowSchemaViolation(`transitions[${i}].label`);
    if (transitionIds.has(id)) throw WorkflowSchemaViolation(`transitions[${i}].id (duplicate)`);
    transitionIds.add(id);
    const tr: WorkflowTransition = { id, from, to, label };
    if (t['requiredRole'] !== undefined) {
      if (typeof t['requiredRole'] !== 'string') throw WorkflowSchemaViolation(`transitions[${i}].requiredRole`);
      tr.requiredRole = t['requiredRole'];
    }
    if (t['requiresReason'] !== undefined) {
      if (typeof t['requiresReason'] !== 'boolean') throw WorkflowSchemaViolation(`transitions[${i}].requiresReason`);
      tr.requiresReason = t['requiresReason'];
    }
    transitions.push(tr);
  }

  return { states, transitions };
}
