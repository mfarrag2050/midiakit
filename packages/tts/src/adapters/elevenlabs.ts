// tts/adapters/elevenlabs — تكامل ElevenLabs (skeleton).
//
// **الحالة:** موثَّق لا مُنفَّذ في هذه الجلسة — التنفيذ يتطلّب:
//   1. مفتاح اختبار حقيقي (لا يظهر في CI)
//   2. اختبار على نصّ عربي فعلي لقياس الجودة
//   3. تكامل مع Phase 4 UI (اختيار voiceId من قائمة صوت العميل)
//
// **API:** POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
//   Headers: xi-api-key: <apiKey>, Content-Type: application/json
//   Body: { text, model_id: "eleven_multilingual_v2", voice_settings }
//   Response: audio/mpeg (MP3)
//
// **رخصة SDK رسمي:** MIT (@elevenlabs/elevenlabs-js) — لكن استعمال
// fetch مباشر أنظف (تحكم أكبر بالـheaders، رفض أيّ ملف تعليمات SDK).

import type { TtsInput, TtsOutput, TtsProvider } from '../types.js';
import { TtsError } from '../types.js';
import { redactKey } from '../security.js';

export const elevenLabsTts: TtsProvider = {
  name: 'elevenlabs',
  async synthesize(input: TtsInput): Promise<TtsOutput> {
    void input;
    void redactKey;
    throw new TtsError(
      'elevenlabs: skeleton — التنفيذ في Phase 4 مع مفتاح اختبار العميل الأول',
      'elevenlabs'
    );
  },
};
