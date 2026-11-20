// 549 · `key` في ملخّص القالب: definition.id للعامّ فقط.
import { describe, it, expect } from 'vitest';
import { toSummary, type DbTemplateRow } from './mapper.js';

function row(over: Partial<DbTemplateRow>): DbTemplateRow {
  const d = new Date('2026-11-20T00:00:00Z');
  return {
    id: '00000000-0000-0000-0000-000000000549',
    tenant_id: null,
    scope: 'global',
    kind: 'static',
    name: 'بطاقة عاجل',
    definition: { id: 'breaking' },
    source_ref: null,
    definition_hash: null,
    deleted_at: null,
    created_at: d,
    updated_at: d,
    ...over,
  };
}

describe('549 · toSummary.key', () => {
  it('قالب عامّ ⇒ key = definition.id', () => {
    expect(toSummary(row({})).key).toBe('breaking');
  });
  it('قالب مستأجر ⇒ key = null حتّى لو حمل definition.id', () => {
    expect(toSummary(row({ scope: 'tenant', tenant_id: 'x' })).key).toBeNull();
  });
  it('قالب عامّ بلا definition.id نصّيّ ⇒ null', () => {
    expect(toSummary(row({ definition: {} })).key).toBeNull();
    expect(toSummary(row({ definition: { id: 7 } })).key).toBeNull();
  });
});
