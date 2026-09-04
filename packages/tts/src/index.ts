// tts — الواجهة العامة لبوابة TTS.
//
// الاستخدام:
//   import { synthesize } from '@pf-mediakit/tts';
//   const out = await synthesize({
//     provider: 'mock', text: '...', voiceId: 'ar-01',
//     apiKey: process.env.TTS_KEY!, // من التخزين الآمن
//   });

import type { TtsInput, TtsOutput, TtsProvider, TtsProviderName } from './types.js';
import { TtsError } from './types.js';
import { mockTts } from './adapters/mock.js';
import { elevenLabsTts } from './adapters/elevenlabs.js';
import { googleTts } from './adapters/google.js';
import { azureTts } from './adapters/azure.js';

export type {
  TtsInput,
  TtsOutput,
  TtsProvider,
  TtsProviderName,
} from './types.js';
export { TtsError } from './types.js';
export { redactKey, safeInputForLog } from './security.js';

const PROVIDERS: Record<TtsProviderName, TtsProvider> = {
  mock: mockTts,
  elevenlabs: elevenLabsTts,
  google: googleTts,
  azure: azureTts,
};

/**
 * واجهة موحّدة — اختر المزوّد وسلّم النصّ. المفتاح يمرّ ويُنسى.
 */
export async function synthesize(
  input: TtsInput & { readonly provider: TtsProviderName }
): Promise<TtsOutput> {
  const provider = PROVIDERS[input.provider];
  if (!provider) {
    throw new TtsError(`مزوّد غير معروف: ${input.provider}`, input.provider);
  }
  const { provider: _p, ...rest } = input;
  return provider.synthesize(rest);
}

/** لكشف المزوّدين المتاحين (للـUI في Phase 4). */
export function availableProviders(): readonly TtsProviderName[] {
  return Object.keys(PROVIDERS) as TtsProviderName[];
}
