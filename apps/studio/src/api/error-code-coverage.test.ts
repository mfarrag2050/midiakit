// ٣٩٠ § ٤ · حارسُ التزامن بين `API_ERROR_CODES` و `ar.json.errors`
//
// **العطبُ الذي يحرسُه:** رمزٌ جديدٌ يُضاف إلى الاستوديو
// (`errors.ts`) وينسى المطوّرُ إضافةَ ترجمته في `packages/i18n/src/ar.json`.
// النتيجة الحيّة (٧٢٠ § ١ القناة F): المستخدم يرى `errors.SOMETHING_NEW`
// شفرةً على الشاشة، لأنّ `t()` يُعيد المفتاحَ عند الغياب.
//
// **RED (إن اختلّت الحقيقة):**
//   1. أَضِف رمزاً وهميّاً `FROBINATOR_EXPLODED` إلى `API_ERROR_CODES`
//      بلا مفتاحٍ في `ar.json.errors.FROBINATOR_EXPLODED` ⇒ يفشل.
//   2. أَحذفه ⇒ يمرّ.
//
// **نطاقٌ محدود:** يحرسُ رموزَ الاستوديو (`API_ERROR_CODES`) فقط.
// خادمُ `apps/api` يحمل ~٩٣ رمزاً (٧٢٠ § ١) — كثيرٌ منها لا يعرفها
// الاستوديو أصلاً. حين يعود الخادمُ برمزٍ غيرِ معروف، الاستوديو يقع
// على fallback من `RenderFailureAlert` (٣٩٠ §١): جملةٌ عربيّةٌ عامّةٌ
// + الرمزُ كرمز. **هذا الحارسُ حارسُ الاستوديو لا حارسُ السلسلة.**

import { describe, it, expect } from 'vitest';
import ar from '../../../../packages/i18n/src/ar.json';
import { API_ERROR_CODES } from './errors';

describe('ar.json يغطّي كلَّ API_ERROR_CODES', () => {
  const errors = (ar as { errors?: Record<string, unknown> }).errors ?? {};

  it('كلُّ رمزٍ في `API_ERROR_CODES` له مفتاحٌ في `ar.json.errors`', () => {
    const missing = API_ERROR_CODES.filter((code) => !(code in errors));
    // نطبع القائمةَ كاملةً — لا `expect(missing.length).toBe(0)` لأنّ
    // فرقاً كهذا يريدُ المطوّرُ أن يرى **أيَّ** رمزٍ غاب لا العدد فقط.
    expect(missing, `رموزٌ في الاستوديو بلا ترجمة عربيّة: ${JSON.stringify(missing)}`).toEqual([]);
  });
});
