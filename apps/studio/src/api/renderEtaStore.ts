// ٥٦٠ · مخزَنُ ETA للرَندرات — الخادمُ يعيد `estimatedStartAt` مع POST
// /v1/renders فقط (`RenderCreated`)، ولا يعيدُه في GET/list. كي تعرض
// «لوحةُ العميل» زمنَ البدءِ حيّاً، نلتقط الحقلَ لحظةَ الإنشاء ونحفظُه
// في الذاكرةِ مرتبطاً بمعرِّف الرَندر.
//
// **حياةُ الحقل:** جلسةُ التبويبِ فقط. لا نستعمل localStorage لأنّ الرقمَ
// يفقدُ معناه لحظةَ فتحِ تبويبٍ آخرَ — الحسابُ الحيُّ يعتمدُ على `Date.now()`
// مقارَناً بلحظةِ الإنشاء التي شهدَها الخادم.
//
// **الحالةُ الخالية:** إذا سُئل المخزَنُ عن معرِّفٍ لا يعرفه (رَندرٌ أُنشئ
// في تبويبٍ آخرَ أو قبلَ إعادة التحميل)، يُعيدُ `null` — والواجهةُ تُخفي
// السطرَ بلا خطأ (قاعدةُ التذكرة §٥).

type EtaEntry = { readonly estimatedStartAt: string };

const store = new Map<string, EtaEntry>();
const listeners = new Set<() => void>();

export function record(renderId: string, estimatedStartAt: string | undefined): void {
  if (!estimatedStartAt) return;
  store.set(renderId, { estimatedStartAt });
  for (const l of listeners) l();
}

export function get(renderId: string): string | null {
  return store.get(renderId)?.estimatedStartAt ?? null;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** للاختبار — يُفرغ المخزَن. لا يُستدعى في الإنتاج. */
export function _reset(): void {
  store.clear();
}
