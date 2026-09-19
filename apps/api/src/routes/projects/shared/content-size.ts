/**
 * 420 §١ · حدّ حجم projects.content — نقطةُ فحصٍ واحدة.
 *
 * كان الفحص في `create.ts` وحده. audit 850 كشف أنّ `PATCH /:id` يعبر
 * بحمولةٍ ضخمة (نفس المستأجر يستدرك بـUPDATE ما منعناه في INSERT).
 * الحلّ: نقطة نداءٍ واحدة يستدعيها المساران — «الحدُّ الذي يُفحَص في
 * مسارٍ واحدٍ ويُنسى في آخرَ ليس حدّاً» (L-138 · audit 850).
 *
 * القيمة نفسها التي كانت في create.ts:30 — لا تغيير سلوكيّ للـcreate.
 */
import { ContentTooLarge } from '../../../errors.js';

/** 256 KB يستوعب عنواناً + مصدراً + مقاطع + annotations دون نفخ الجدول. */
export const CONTENT_MAX_BYTES = 256 * 1024;

/**
 * يقيس حجم `content` بعد `JSON.stringify` (jsonb هو ما يُخزَّن)، ويعيد
 * السلسلة الجاهزة للـINSERT/UPDATE. تجاوز الحدّ ⇒ يرمي `ContentTooLarge()`.
 *
 * @param content — كائن `content` كما استلمناه من zod (قد يكون undefined).
 * @returns النصّ المُسَلْسَل — مرَّرْه مباشرةً للـSQL كي لا تُعاد serialize.
 */
export function serializeAndCheckContentSize(content: Record<string, unknown> | undefined): string {
  const contentJson = JSON.stringify(content ?? {});
  if (Buffer.byteLength(contentJson, 'utf8') > CONTENT_MAX_BYTES) {
    throw ContentTooLarge();
  }
  return contentJson;
}
