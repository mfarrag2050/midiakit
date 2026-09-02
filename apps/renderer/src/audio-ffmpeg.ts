// apps/renderer/src/audio-ffmpeg — ترجمة AudioPlan إلى FFmpeg args.
//
// **العلّة (docs/10 §هـ):** AudioPlan قيمة خالصة. هذا الملف Node-only
// يحوّلها إلى:
//   • قائمة `-f lavfi -i "sine=..."` أو `-f lavfi -i "anoisesrc=..."`
//     لكل عنصر synth (بلا ملفات خارجية للاختبار)
//   • filter_complex يجمع: atrim + adelay + volume + afade +
//     sidechaincompress (ducking) + amix النهائي
//
// **التزامن مع الفيديو (ADR-008):** الفيديو من stdin (input 0 كـrawvideo).
// كل مدخلات الصوت تبدأ من index 1 فصاعداً. filter_complex يبني قناة
// صوتية واحدة `[aout]` تُدمج مع `[0:v]` في المخرج النهائي.
//
// **الدقة:** كل الأزمنة بالثواني، تُحوَّل إلى ms داخل filter_complex
// (adelay يقبل ms). خطأ 1ms مقبول لكن لا نتساهل — نتحقق ببصمة waveform.

import type { AudioPlan, AudioSource, AudioItemPlan, DuckingRule } from '@pf-mediakit/engine';

// ── مصادر lavfi ───────────────────────────────────

/** يحوّل AudioSource إلى تعبير lavfi لـFFmpeg. */
export function lavfiExpression(source: AudioSource): string {
  switch (source.type) {
    case 'synth-sine':
      // sine=frequency=220:duration=8:sample_rate=44100
      return `sine=frequency=${source.frequency}:duration=${source.duration}:sample_rate=44100`;
    case 'synth-noise': {
      // anoisesrc=color=pink:amplitude=0.3:duration=2:sample_rate=44100
      // colors: white=0, pink=1, brown=2, blue=3, violet=4
      const colorCode = source.color === 'white' ? 'white'
        : source.color === 'brown' ? 'brown'
        : 'pink';
      return `anoisesrc=color=${colorCode}:amplitude=${source.amplitude}:duration=${source.duration}:sample_rate=44100`;
    }
    case 'asset':
      // للأصول الحقيقية، المستدعي يوفّر مسار ملف بديلاً — هنا نُبلّغ.
      throw new Error(`asset:${source.key} يحتاج مسار ملف — synth فقط في الاختبار`);
  }
}

// ── بناء filter_complex ──────────────────────────

interface BuildResult {
  /** قائمة `-i` قبل filter_complex (مصادر lavfi). */
  readonly inputs: readonly string[];
  /** سلسلة filter_complex الكاملة. */
  readonly filterComplex: string;
  /** map الصوت النهائي — عادةً `[aout]`. */
  readonly audioMap: string;
}

/**
 * يبني كل ما يحتاجه FFmpeg للصوت: مدخلات lavfi، سلسلة الفلاتر،
 * ومخرج mapped. المستدعي (renderer) يضيف هذه إلى أوامر ffmpeg قبل
 * ملف المخرج.
 *
 * **الترتيب:**
 * 1. لكل عنصر: atrim (قصّ المصدر) → adelay (تأخير على الخط الزمني) →
 *    volume (kgain) → afade in/out (اختياري). المخرج مسمّى
 *    `[i0], [i1], …`.
 * 2. كل مسار يمرّ بـamix لعناصره → `[t0], [t1], …`.
 * 3. لكل ducking: sidechaincompress يأخذ target كأولي وtrigger كسايد
 *    → يستبدل target بـ `[t{i}_ducked]`.
 * 4. amix نهائي يجمع كل المسارات → `[aout]`.
 */
export function buildAudioFilterGraph(
  plan: AudioPlan,
  videoInputCount: number
): BuildResult {
  const inputs: string[] = [];
  const filterParts: string[] = [];

  // (١) مدخلات lavfi لكل عنصر — index يبدأ من videoInputCount.
  //     نبني خريطة (trackId, itemId) → inputIndex.
  const itemInputIdx = new Map<string, number>();
  let nextIdx = videoInputCount;
  for (const track of plan.tracks) {
    for (const item of track.items) {
      inputs.push('-f', 'lavfi', '-i', lavfiExpression(item.source));
      itemInputIdx.set(`${track.id}:${item.id}`, nextIdx);
      nextIdx++;
    }
  }

  // (٢) لكل عنصر: atrim + adelay + volume + afade
  const itemLabels: string[] = [];
  for (const track of plan.tracks) {
    for (const item of track.items) {
      const idx = itemInputIdx.get(`${track.id}:${item.id}`)!;
      const label = `i${idx}`;
      itemLabels.push(label);
      const chain: string[] = [];

      // atrim: قصّ داخل المصدر
      if (item.trimIn !== undefined || item.trimOut !== undefined) {
        const start = item.trimIn ?? 0;
        const end = item.trimOut;
        chain.push(end !== undefined
          ? `atrim=start=${start}:end=${end}`
          : `atrim=start=${start}`);
        chain.push('asetpts=PTS-STARTPTS');
      }

      // volume: kgain
      if (item.gain !== 1) chain.push(`volume=${item.gain}`);

      // afade in/out
      if (item.fadeIn !== undefined && item.fadeIn > 0) {
        chain.push(`afade=t=in:st=0:d=${item.fadeIn}`);
      }
      if (item.fadeOut !== undefined && item.fadeOut > 0) {
        const trimmedDur = (item.trimOut ?? item.end - item.start) - (item.trimIn ?? 0);
        const outStart = Math.max(0, trimmedDur - item.fadeOut);
        chain.push(`afade=t=out:st=${outStart}:d=${item.fadeOut}`);
      }

      // adelay: تأخير على الخط الزمني (ms، stereo يحتاج قناتين)
      const delayMs = Math.round(item.start * 1000);
      if (delayMs > 0) {
        chain.push(`adelay=${delayMs}|${delayMs}`);
      }

      // filter_complex: `[in]filter1,filter2,...[out]` — بلا فاصلة أولى.
      // إن لم يكن هناك أيّ filter نستعمل anull للنسخ (مطلوب لإعادة التسمية).
      const chainStr = chain.length > 0 ? chain.join(',') : 'anull';
      filterParts.push(`[${idx}:a]${chainStr}[${label}]`);
    }
  }

  // (٣) amix لكل مسار (إن كان فيه أكثر من عنصر)، ثم apad إلى plan.duration.
  //
  // **قاعدة duration الحرجة:** sidechaincompress ينقطع حين ينتهي أيّ من
  // مدخلَيه — حتى مع duration=longest في amix اللاحق. النتيجة: الموسيقى
  // تسكت بعد نهاية التعليق (سُلوك رُصد ذاتياً في اختبار L-17). العلاج:
  // نضمن أن كل مسار يمتد فعلياً إلى plan.duration بـapad + atrim.
  const trackLabels: string[] = [];
  const trackLabelById = new Map<string, string>();
  plan.tracks.forEach((track, ti) => {
    const items = track.items;
    if (items.length === 0) return;
    const rawLabel = `t${ti}_raw`;
    const tLabel = `t${ti}`;
    trackLabelById.set(track.id, tLabel);
    if (items.length === 1) {
      const idx = itemInputIdx.get(`${track.id}:${items[0]!.id}`)!;
      filterParts.push(`[i${idx}]anull[${rawLabel}]`);
    } else {
      const inputsStr = items.map((it) => {
        const idx = itemInputIdx.get(`${track.id}:${it.id}`)!;
        return `[i${idx}]`;
      }).join('');
      filterParts.push(`${inputsStr}amix=inputs=${items.length}:duration=longest:dropout_transition=0[${rawLabel}]`);
    }
    // ضمان المدة على مستوى المسار — يبقى المسار مفتوحاً بصمت حتى
    // نهاية الخط الزمني، فلا يقطع sidechaincompress أو amix النهائي.
    filterParts.push(`[${rawLabel}]apad,atrim=0:${plan.duration},asetpts=PTS-STARTPTS[${tLabel}]`);
    trackLabels.push(tLabel);
  });

  // (٤) ducking: sidechaincompress لكل قاعدة
  //     يستبدل tLabel المستهدف بنسخة مضغوطة sidechain.
  for (let di = 0; di < plan.duckings.length; di++) {
    const d = plan.duckings[di]!;
    const targetLabel = trackLabelById.get(d.targetTrackId);
    const triggerLabel = trackLabelById.get(d.triggerTrackId);
    if (!targetLabel || !triggerLabel) continue;

    // sidechaincompress params:
    //   threshold: تحته لا ضغط. amount=0.7 يعني الخفض بـ70%، فنستعمل
    //              threshold منخفضاً (0.05) وratio عالية (8).
    //   attack/release بالـms.
    const thresh = 0.05;
    const ratio = 4 + d.amount * 12; // 0.5→10, 0.7→12.4, 1→16
    const attackMs = Math.round(d.attack * 1000);
    const releaseMs = Math.round(d.release * 1000);
    const duckedLabel = `${targetLabel}_d${di}`;
    // نستعمل asplit ليصبح trigger متاحاً لكل من sidechain وamix النهائي.
    // البسيطة: نجعل trigger asplit=2، واحد يذهب لـsidechain والآخر
    // يبقى في الخط الرئيسي.
    filterParts.push(`[${triggerLabel}]asplit=2[${triggerLabel}_sc][${triggerLabel}_main]`);
    filterParts.push(`[${targetLabel}][${triggerLabel}_sc]sidechaincompress=threshold=${thresh}:ratio=${ratio}:attack=${attackMs}:release=${releaseMs}[${duckedLabel}]`);
    // نُحدّث خريطة المسار: من الآن، targetTrack هو duckedLabel، وtrigger هو trigger_main.
    trackLabelById.set(d.targetTrackId, duckedLabel);
    trackLabelById.set(d.triggerTrackId, `${triggerLabel}_main`);
  }

  // (٥) amix نهائي يجمع كل المسارات
  //
  // **قيد ضمان المدة:** sidechaincompress + amix قد تقصر المخرج إلى طول
  // أقصر مسار (رغم duration=longest في amix، بعض مصادر lavfi تُنهي
  // النقل حين تنتهي). نضيف apad + atrim على المخرج النهائي لضمان أن
  // المدة تطابق plan.duration تماماً — العلاج القياسي في FFmpeg.
  const finalInputs = plan.tracks
    .map((t) => trackLabelById.get(t.id))
    .filter((l): l is string => !!l)
    .map((l) => `[${l}]`);
  const mixLabel = 'aout_raw';
  if (finalInputs.length === 0) {
    filterParts.push(`anullsrc=r=44100:cl=stereo:d=${plan.duration}[${mixLabel}]`);
  } else if (finalInputs.length === 1) {
    filterParts.push(`${finalInputs[0]}anull[${mixLabel}]`);
  } else {
    filterParts.push(`${finalInputs.join('')}amix=inputs=${finalInputs.length}:duration=longest:dropout_transition=0[${mixLabel}]`);
  }
  // apad ثم atrim = ضمان المدة الدقيقة (docs/10 §هـ: انزلاق 100ms مسموع).
  filterParts.push(`[${mixLabel}]apad,atrim=0:${plan.duration},asetpts=PTS-STARTPTS[aout]`);

  return {
    inputs,
    filterComplex: filterParts.join(';'),
    audioMap: '[aout]',
  };
}
