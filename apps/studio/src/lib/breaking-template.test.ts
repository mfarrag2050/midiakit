// 551 · قالب العاجل بمفتاحه. خادمٌ مزيّف يحاكي `templates/list.ts`:
// ترتيب created_at DESC · filter[scope] · limit افتراضيّ 20 وأقصى 100.
// كلّ حالة تُشغَّل على المنطق القديم (بالاسم) والجديد (بالمفتاح) معاً،
// فالاختبار يُثبت العطب قبل أن يُثبت الإصلاح.
import { describe, it, expect } from 'vitest';
import type { TemplateListItem } from '@/src/api/endpoints/templates';
import { loadBreakingTemplateId, pickBreakingTemplate } from './breaking-template';

const GLOBAL_BREAKING: TemplateListItem = {
  id: 'g-breaking', scope: 'global', name: 'بطاقة عاجل', key: 'breaking',
  kind: 'static', createdAt: '2026-01-01T00:00:00Z',
};
const GLOBAL_PLAIN: TemplateListItem = {
  id: 'g-plain', scope: 'global', name: 'بطاقة بسيطة', key: 'plain',
  kind: 'static', createdAt: '2026-01-01T00:00:01Z',
};

function tenant(i: number, name = `قالبي ${i}`): TemplateListItem {
  return {
    id: `t-${i}`, scope: 'tenant', name, key: null, kind: 'static',
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString(),
  };
}

function fakeServer(rows: readonly TemplateListItem[]) {
  const calls: Array<{ limit?: number; filter?: { scope?: string } } | undefined> = [];
  const list = async (opts?: { limit?: number; filter?: { scope?: string } }) => {
    calls.push(opts);
    const scope = opts?.filter?.scope ?? 'all';
    const limit = Math.min(opts?.limit ?? 20, 100);
    const data = rows
      .filter((r) => scope === 'all' || r.scope === scope)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return { data };
  };
  return { list, calls };
}

/** المنطق قبل 551 حرفيّاً (breaking/page.tsx · brand-kits/[id]/edit/page.tsx). */
async function legacyBreakingId(list: ReturnType<typeof fakeServer>['list']): Promise<string | null> {
  const page = await list();
  const b = page.data.find((t) => t.name.includes('عاجل') || t.name.toLowerCase().includes('breaking'));
  return b?.id ?? null;
}

describe('551 · قالب العاجل', () => {
  it('(١) نسخة مستأجر مكرَّرة أحدث: القديم يختار النسخة · الجديد يختار العامّ', async () => {
    const s = fakeServer([GLOBAL_BREAKING, GLOBAL_PLAIN, tenant(1, 'بطاقة عاجل — نسخة')]);
    expect(await legacyBreakingId(s.list)).toBe('t-1');
    expect(await loadBreakingTemplateId(s.list)).toBe('g-breaking');
  });

  it('(٢) أكثر من 20 قالب مستأجر أحدث: القديم null · الجديد يجده', async () => {
    const rows = [GLOBAL_BREAKING, GLOBAL_PLAIN, ...Array.from({ length: 25 }, (_, i) => tenant(i))];
    const s = fakeServer(rows);
    expect(await legacyBreakingId(s.list)).toBeNull();
    expect(await loadBreakingTemplateId(s.list)).toBe('g-breaking');
  });

  it('الجديد يطلب scope=global صراحةً', async () => {
    const s = fakeServer([GLOBAL_BREAKING]);
    await loadBreakingTemplateId(s.list);
    expect(s.calls.at(-1)?.filter?.scope).toBe('global');
  });

  it('الاسم لا يحسم: عامّ اسمه تغيّر يبقى · عامّ بلا key لا يُختار', () => {
    expect(pickBreakingTemplate([{ ...GLOBAL_BREAKING, name: 'Breaking card' }])?.id).toBe('g-breaking');
    expect(pickBreakingTemplate([{ ...GLOBAL_BREAKING, key: null }])).toBeNull();
  });

  it('غياب قالب العاجل ⇒ null (الزرّ يبقى معطَّلاً)', async () => {
    expect(await loadBreakingTemplateId(fakeServer([GLOBAL_PLAIN]).list)).toBeNull();
  });
});
