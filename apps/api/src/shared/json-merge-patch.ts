/**
 * RFC 7396 — JSON Merge Patch.
 *
 * قواعد:
 *   • patch = null → target مُحذوف بالكامل.
 *   • patch = scalar/array → target مُستبدَل بالكامل (لا merge داخل arrays).
 *   • patch = object:
 *     - إن لم يكن target كائناً، target = {}.
 *     - لكل key في patch:
 *       * قيمة null → delete target[key].
 *       * أيّ قيمة أخرى → target[key] = merge(target[key], patch[key]).
 *     - keys في target ليست في patch → تبقى كما هي.
 *
 * لماذا داخلي لا مكتبة: 20 سطراً، لا تبعية إضافية، سلوك مضمون.
 */
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue }

export function mergePatch(target: JsonValue, patch: JsonValue): JsonValue {
  if (patch === null) return null;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;

  const result: JsonObject =
    typeof target === 'object' && target !== null && !Array.isArray(target)
      ? { ...target as JsonObject }
      : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = mergePatch(result[key] as JsonValue, value) as JsonValue;
    }
  }
  return result;
}

/**
 * يفحص أن patch لا يلمس مسارات محظورة (dot-notation).
 * يرمي IMMUTABLE_FIELD عند أوّل مطابقة.
 *
 * مثال: hasBlockedPath(patch, 'assets.version') يعود true إن كان
 * patch = { assets: { version: 'x' } }.
 */
export function findBlockedPath(patch: JsonValue, blockedPaths: string[]): string | null {
  for (const path of blockedPaths) {
    if (patchTouches(patch, path.split('.'))) return path;
  }
  return null;
}

function patchTouches(patch: JsonValue, path: string[]): boolean {
  if (path.length === 0) return true;   // أيّ patch عند هذه النقطة يلمسها
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return false;
  const [head, ...rest] = path;
  if (head === undefined) return false;
  if (head === '*') {
    // wildcard على كل مفاتيح المستوى
    for (const v of Object.values(patch as JsonObject)) {
      if (patchTouches(v, rest)) return true;
    }
    return false;
  }
  if (!(head in patch)) return false;
  return patchTouches((patch as JsonObject)[head]!, rest);
}
