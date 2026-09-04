// tts/adapters/mock — يولّد نغمة sine بـFFmpeg بدل استدعاء مزوّد.
//
// **الغرض:** اختبارات وبوابات بلا مفتاح حقيقي (قاعدة المالك 2026-09-04).
// المدة مشتقّة حتمياً من طول النصّ — نفس المدخل ⇒ نفس المخرج.
//
// **التردّد** مشتقّ حتمياً من voiceId (hash → 200-500Hz) — أصوات
// وهمية مختلفة تُنتج نغمات مختلفة، فيظهر تأثير voiceId في التصحيح.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TtsInput, TtsOutput, TtsProvider } from '../types.js';
import { TtsError } from '../types.js';
import { redactKey } from '../security.js';

/** سرعة قراءة عربية تقديرية — كل حرف ~55ms، معدَّل بـspeed. */
function estimateDurationSec(text: string, speed: number): number {
  const base = text.length * 0.055;
  return Math.max(0.5, base / speed);
}

/** hash بسيط 32-bit خارج التشفير — يكفي لتحويل voiceId إلى تردّد. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** تردّد بين 200 و 500 Hz، حتمي من voiceId. */
function pickFrequency(voiceId: string): number {
  return 200 + (hashString(voiceId) % 300);
}

export const mockTts: TtsProvider = {
  name: 'mock',
  async synthesize(input: TtsInput): Promise<TtsOutput> {
    const speed = input.speed ?? 1.0;
    const duration = estimateDurationSec(input.text, speed);
    const freq = pickFrequency(input.voiceId);
    const sampleRate = 44100;

    // نكتب إلى مجلد مؤقّت ثم نقرأه بايتاً — كي يبقى المخرج Buffer
    // مثل بقيّة المزوّدين (لا مسار ملف).
    const dir = mkdtempSync(join(tmpdir(), 'pf-tts-mock-'));
    const out = join(dir, 'tone.wav');
    const ff = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', `sine=frequency=${freq}:duration=${duration.toFixed(3)}:sample_rate=${sampleRate}`,
      '-c:a', 'pcm_s16le',
      out,
    ]);
    if (ff.status !== 0) {
      // نُنقّي أيّ تسرّب محتمل للمفتاح (احترازي — mock لا يستعمله فعلياً).
      const msg = redactKey(ff.stderr.toString('utf8'), input.apiKey);
      try { rmdirSync(dir, { recursive: true } as never); } catch {}
      throw new TtsError(`mock: FFmpeg فشل — ${msg}`, 'mock', new Error(msg));
    }

    let audio: Buffer;
    try {
      audio = readFileSync(out);
    } finally {
      try { unlinkSync(out); } catch {}
      try { rmdirSync(dir); } catch {}
    }

    return {
      audio,
      format: 'wav',
      durationSec: duration,
      provider: 'mock',
      sampleRate,
    };
  },
};
