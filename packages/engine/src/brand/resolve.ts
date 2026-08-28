// brand/resolve — يحلّ المراجع النصية داخل BrandKit إلى قيمها الحرفية.
// المرجع: docs/03-brand-kit-spec.md §«قواعد التحقق».
//
// السلوك المطلوب (بترتيب الأهمية):
//   1. **يرمي عند مرجع مفقود.** لا يعيد السلسلة كما هي.
//      السبب: Canvas يبتلع اللون غير الصالح صامتاً ويحتفظ بآخر قيمة،
//      فيظهر لون عشوائي في مخرج عميل بلا خطأ ظاهر — كارثة تشخيصية.
//   2. **يكشف الحلقات.** a→b→a يرمي، لا يعلق حلقة لانهائية.
//   3. **يحلّ متعدياً.** المرجع قد يشير إلى مرجع آخر.
//   4. **القيم غير المرجعية تمرّ كما هي.** '#C1012F'، 48، true،
//      'sans-serif'، Arabic text — كلها ليست مراجع.
//
// الاستدعاء:
//   • `resolve(brand, path)` — يقرأ قيمة عند مسار ويحلّ متعدياً.
//   • `resolveBrand(brand)` — يُطبَّق مرة واحدة قبل الرندر، يعيد
//     BrandKit مسطّحاً بلا مراجع. يجب استدعاؤه في نقطة التحميل، لا في
//     كل نداء طبقة (الفيديو ينادي الطبقات آلاف المرات، والخطأ يجب أن
//     يُكشف عند التحميل لا في منتصف إطار).

import type { BrandKit } from '@pf-mediakit/shared';

/**
 * نمط المرجع: سلسلة تحمل مسار نقطي فقط (`colors.urgentBadge`،
 * `logo.watermark.tint`). حرف أول أبجدي أو `_`/`$`، ثم أبجدي/رقمي،
 * ثم `.` وقسم آخر — بحد أدنى قسمان.
 *
 * لا يُطابق:
 *   • ألوان hex (`#RRGGBB`) — تبدأ بـ`#`.
 *   • rgba/rgb/hsl (`rgba(...)`) — تحتوي أقواس.
 *   • أسماء أسر الخطوط (`IBM Plex Sans Arabic`) — تحتوي فراغات.
 *   • URLs (`https://…`) — تحتوي `:` و`/`.
 *   • كلمة واحدة بلا نقطة (`sans-serif`, `عاجل`) — لا نقاط.
 */
const REF_PATTERN =
  /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)+$/;

/**
 * يحدّد إن كانت قيمة مرجعاً يحتاج إلى حل.
 * الفحص شكلي (regex) — لا يفتّش داخل brand.
 */
export function isBrandReference(value: unknown): value is string {
  return typeof value === 'string' && REF_PATTERN.test(value);
}

export class BrandRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandRefError';
  }
}

/**
 * ينزل مسار نقطي إلى قيمة داخل brand.
 * يرمي عند أي جزء مفقود — لا `undefined` صامت.
 */
function lookupPath(brand: BrandKit, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = brand;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      throw new BrandRefError(
        `resolve: مرجع مفقود «${path}» — الجزء «${p}» يُدخل قيمة غير كائن`
      );
    }
    const rec = cur as Record<string, unknown>;
    if (!(p in rec)) {
      throw new BrandRefError(
        `resolve: مرجع مفقود «${path}» — الجزء «${p}» غير موجود`
      );
    }
    cur = rec[p];
  }
  return cur;
}

/**
 * يحلّ مرجعاً واحداً متعدياً بدءاً من `path`.
 * يكشف الحلقات: زيارة نفس المسار مرتين ترمي.
 */
export function resolve(brand: BrandKit, path: string): unknown {
  const visited = new Set<string>();
  let cur = path;
  // حد أقصى للأمان — لا نتوقّع أكثر من 32 قفزة في التصميم العادي.
  for (let hop = 0; hop < 32; hop++) {
    if (visited.has(cur)) {
      const trail = [...visited, cur].join(' → ');
      throw new BrandRefError(`resolve: حلقة مراجع «${path}»: ${trail}`);
    }
    visited.add(cur);
    const value = lookupPath(brand, cur);
    if (isBrandReference(value)) {
      cur = value;
      continue;
    }
    return value;
  }
  throw new BrandRefError(`resolve: عمق مراجع مفرط بدءاً من «${path}»`);
}

/**
 * يمشي شجرة القيم ويستبدل كل مرجع بقيمته الحرفية.
 * يستدعي `resolve` لكل مرجع يجده — كشف الحلقات موروث.
 */
function walkAndResolve(brand: BrandKit, node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((n) => walkAndResolve(brand, n));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = walkAndResolve(brand, v);
    }
    return out;
  }
  if (isBrandReference(node)) {
    return resolve(brand, node);
  }
  return node;
}

/**
 * يعيد BrandKit مسطّحاً — كل المراجع مستبدلة بقيمها الحرفية.
 * يجب استدعاؤه **مرة واحدة قبل الرندر**، لا داخل كل طبقة.
 */
export function resolveBrand(brand: BrandKit): BrandKit {
  return walkAndResolve(brand, brand) as BrandKit;
}
