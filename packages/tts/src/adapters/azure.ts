// tts/adapters/azure — Azure Cognitive Services Speech (skeleton).
//
// **الحالة:** موثَّق لا مُنفَّذ. يتطلّب:
//   1. Subscription Key + Region.
//   2. اختبار على الأصوات العربية الفصحى (ar-EG-SalmaNeural,
//      ar-SA-ZariyahNeural, …).
//   3. Phase 4 UI + تخزين آمن (Key + Region).
//
// **API:** POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
//   Headers: Ocp-Apim-Subscription-Key: <apiKey>, Content-Type: application/ssml+xml
//   Body: SSML <speak><voice name="ar-EG-SalmaNeural">النصّ</voice></speak>
//   Response: audio/wav (RIFF)
//
// **الميّزة:** يقبل SSML — تحكم دقيق بالنبر والتوقف. مفيد للأخبار
// (توقف عند فواصل الجملة، تشديد على أسماء علم).

import type { TtsInput, TtsOutput, TtsProvider } from '../types.js';
import { TtsError } from '../types.js';

export const azureTts: TtsProvider = {
  name: 'azure',
  async synthesize(input: TtsInput): Promise<TtsOutput> {
    void input;
    throw new TtsError(
      'azure: skeleton — التنفيذ في Phase 4 مع Subscription Key العميل',
      'azure'
    );
  },
};
