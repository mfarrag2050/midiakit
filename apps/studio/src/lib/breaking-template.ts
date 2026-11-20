// 551 · اختيار قالب «بطاقة عاجل» العامّ بمفتاحه لا باسمه.
//
// كان: `find(t => t.name.includes('عاجل') || …'breaking')` على
// `templates.list()` بلا مرشّح. القائمة مرتّبة `created_at DESC` بحدّ 20:
//   (١) نسخة مستأجر «بطاقة عاجل — نسخة» أحدث ⇒ تأتي أوّلاً ⇒ تُختار.
//   (٢) أكثر من 20 قالب مستأجر أحدث ⇒ العامّ خارج الصفحة ⇒ null.
// الآن: `filter[scope]=global` (القوالب العامّة ستّة) + `key === 'breaking'`
// (`definition.id`، يثبت مهما تُرجم الاسم أو أُعيدت تسميته).

import type { TemplateListItem } from '@/src/api/endpoints/templates';

export const BREAKING_TEMPLATE_KEY = 'breaking';

type ListFn = (opts: {
  readonly limit: number;
  readonly filter: { readonly scope: 'global' };
}) => Promise<{ readonly data: readonly TemplateListItem[] }>;

export function pickBreakingTemplate(
  rows: readonly TemplateListItem[],
): TemplateListItem | null {
  return rows.find((t) => t.scope === 'global' && t.key === BREAKING_TEMPLATE_KEY) ?? null;
}

/** يجلب القوالب العامّة فقط ويعيد معرّف قالب العاجل، أو null إن غاب. */
export async function loadBreakingTemplateId(list: ListFn): Promise<string | null> {
  const page = await list({ limit: 100, filter: { scope: 'global' } });
  return pickBreakingTemplate(page.data)?.id ?? null;
}
