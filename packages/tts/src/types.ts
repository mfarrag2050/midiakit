// tts/types — العقد بين المستدعي (renderer/api) والمزوّد.
//
// **مبدأ الأمان:** apiKey يمرّ عبر واجهة `synthesize` ثم يُنسى فور
// انتهاء الاستدعاء. لا حفظ في state، لا في logs، لا في error messages.
// المستدعي مسؤول عن جلبه من التخزين الآمن (Phase 4 KMS/vault).
//
// **مبدأ BYO-key (docs/12 §10):** لا نستضيف نموذج TTS — العميل يجلب
// مزوّده ومفتاحه. نحن جسر لا محرّك.

export type TtsProviderName = 'mock' | 'elevenlabs' | 'google' | 'azure';

export interface TtsInput {
  /** النصّ المُنطَق. عربية أو مختلطة — تحضير BiDi مسؤولية المستدعي. */
  readonly text: string;
  /** معرّف الصوت لدى المزوّد (voiceId في ElevenLabs، name في Google/Azure). */
  readonly voiceId: string;
  /** سرعة النطق [0.5, 2.0]. الافتراضي 1.0. المزوّدون يفسّرونها مختلفاً. */
  readonly speed?: number;
  /**
   * مفتاح API الخاصّ بالعميل. **لا يُخزَّن، لا يُسجَّل** — يمرّ ثم يُنسى.
   * المستدعي يجلبه من التخزين الآمن ويمرّره لكل استدعاء.
   */
  readonly apiKey: string;
}

export interface TtsOutput {
  /** بيانات الصوت الخام (WAV أو MP3 حسب المزوّد). */
  readonly audio: Buffer;
  readonly format: 'wav' | 'mp3';
  /** المدة الفعلية بالثواني — يُقاس من المخرج، لا يُقدَّر. */
  readonly durationSec: number;
  readonly provider: TtsProviderName;
  /**
   * الـsample rate بالـHz — 44100 قياسي في المشروع. المزوّدون قد يعيدون
   * 22050/24000/48000؛ المستدعي مسؤول عن إعادة العيّنة إن اقتضت الحاجة.
   */
  readonly sampleRate: number;
}

/** واجهة موحّدة لكل محوّل مزوّد. */
export interface TtsProvider {
  readonly name: TtsProviderName;
  synthesize(input: TtsInput): Promise<TtsOutput>;
}

/**
 * الخطأ القياسي لكل مزوّد. **يمرّر عبر redactKey قبل الرمي** — الرسالة
 * الأصلية قد تحوي المفتاح (من HTTP request logs، إلخ).
 */
export class TtsError extends Error {
  constructor(
    message: string,
    public readonly provider: TtsProviderName,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
