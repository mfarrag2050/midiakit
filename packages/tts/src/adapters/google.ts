// tts/adapters/google — Google Cloud Text-to-Speech (skeleton).
//
// **الحالة:** موثَّق لا مُنفَّذ. يتطلّب:
//   1. Service Account مفتاح JSON (لا مفتاح API بسيط) — التخزين الآمن
//      يجب أن يدعم الاثنين.
//   2. اختبار على أصوات عربية (ar-XA-Wavenet-A/B/C…).
//   3. Phase 4 UI: اختيار voiceId + معاينة.
//
// **API:** POST https://texttospeech.googleapis.com/v1/text:synthesize
//   Auth: Bearer <access_token> (مشتقّ من service account JSON)
//   Body: { input: { text }, voice: { languageCode, name }, audioConfig }
//   Response: { audioContent: base64 }
//
// **رخصة SDK رسمي:** Apache-2.0 (@google-cloud/text-to-speech) — نتجنّبه
// تفادياً لمكتبة auth ثقيلة، ونستعمل fetch + JWT مبسّط.

import type { TtsInput, TtsOutput, TtsProvider } from '../types.js';
import { TtsError } from '../types.js';

export const googleTts: TtsProvider = {
  name: 'google',
  async synthesize(input: TtsInput): Promise<TtsOutput> {
    void input;
    throw new TtsError(
      'google: skeleton — التنفيذ في Phase 4 مع Service Account العميل',
      'google'
    );
  },
};
