// tts/security — حماية المفتاح من التسرّب.
//
// **القاعدة:** apiKey لا يظهر في:
//   • رسائل الخطأ (redactKey على كل throw)
//   • السجلات (المستدعي يمرّر redact-aware logger)
//   • JSON serialization (safeInputForLog يحذف apiKey)
//   • البيانات المُخزَّنة (BullMQ job data — apiKeyRef بدلاً)
//
// **مبدأ:** «المفتاح يمرّ ثم يُنسى» — لا يبقى بعد انتهاء
// synthesize().

import type { TtsInput } from './types.js';

/**
 * يستبدل كل ظهور للمفتاح بـ`[REDACTED]`. يجب أن يمرّ به كل نصّ يخرج
 * من الخدمة (رسائل خطأ، سجلات، بيانات مُلقاة للتشخيص).
 */
export function redactKey(text: string, key: string): string {
  if (!key || key.length < 4) return text;
  // نحمي أيّ سطر يشبه المفتاح كاملاً أو أوّل 4+ محارف منه (كي لا
  // يتسرّب حتى شظاياً مطبوعة في تشخيص شبكة).
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'g');
  return text.replace(pattern, '[REDACTED]');
}

/**
 * يُنتج نسخة من TtsInput آمنة للتسجيل — apiKey مُستبدَل بطول المفتاح
 * فقط. النصّ الكامل يبقى (قد يكون مطلوباً للتشخيص) — إن كان النصّ
 * حسّاساً، على المستدعي عدم تسجيله من البداية.
 */
export function safeInputForLog(input: TtsInput): Omit<TtsInput, 'apiKey'> & { readonly apiKeyLen: number } {
  const { apiKey, ...rest } = input;
  return { ...rest, apiKeyLen: apiKey.length };
}
