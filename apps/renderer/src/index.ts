// apps/renderer — رندر الفيديو على Node.
//
// **ADR-004:** حلقة إطارات → drawTimelineAt → مخزن RGBA خام → FFmpeg.
// **ADR-008:** أنبوب مباشر — لا ملفات إطارات مؤقتة على القرص.
//
// **المسار (بعد حذف @legacy 2026-09-02):** timeline-v2 هو المسار الوحيد.
// `templateToTimeline` يحوّل قالباً بحقل `video.animation` الموروث إلى
// Timeline v2، ثم drawTimelineAt يستهلكها. أُثبت بايت-بايت مطابقاً
// لسلوك @legacy drawAt قبل الحذف.
//
// **العقد:**
//   renderVideo({ template, brand, content, size, outPath, fps?, ffmpegPath? })
//     يشغّل FFmpeg، يمرّر إليه إطاراً بإطار عبر stdin، ينتظر انتهاءه.
//     يرمي إن فشل FFmpeg (exit != 0) أو إن انقطع الأنبوب.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BrandKit } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import {
  buildRenderPlan,
  drawTimelineAt,
  templateToTimeline,
  type RenderPlan,
  type AudioPlan,
} from '@pf-mediakit/engine';
import { buildAudioFilterGraph } from './audio-ffmpeg.js';

// نستورد skia-canvas بشكل ديناميكي في العقدة لتفادي فرضه على المتصفح
// (وإن كان هذا الملف Node-only، فالحرص لا يضر).
import { Canvas } from 'skia-canvas';

export interface RenderVideoArgs {
  readonly template: Template;
  readonly brand: BrandKit;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size: { readonly w: number; readonly h: number };
  readonly outPath: string;
  readonly fps?: number;
  /** المسار الكامل لـffmpeg — الافتراضي `ffmpeg` من PATH. */
  readonly ffmpegPath?: string;
  /** يُستدعى بعد كل إطار لتتبّع التقدم (اختياري — بلا logging افتراضياً). */
  readonly onProgress?: (frame: number, total: number) => void;
  /**
   * خطة الصوت (اختياري). حين تُمرَّر، تُترجم إلى `-i` + filter_complex
   * وتُدمج مع فيديو stdin. حين تغيب: صوت صامت (السلوك القديم).
   */
  readonly audioPlan?: AudioPlan;
}

export interface RenderVideoResult {
  readonly outPath: string;
  readonly duration: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly sizeBytes: number;
}

/**
 * يبني وسائط FFmpeg بأسلوب أنبوب مباشر:
 *   • input 0: rawvideo RGBA بمقاس ومعدل محدَّدين، من stdin.
 *   • input 1: صوت صامت من anullsrc (لتوافق AAC لبعض المشغّلات).
 *   • output: H.264 (libx264) + yuv420p + faststart + bt709 (≈ sRGB) + AAC 128k.
 *   • `-shortest` يقصّ الصوت الصامت إلى مدة الفيديو تلقائياً.
 */
/**
 * يبني وسائط FFmpeg. حالتان:
 *   • بلا audioPlan: input 0 = rawvideo/stdin، input 1 = anullsrc (سلوك سابق).
 *   • مع audioPlan: input 0 = rawvideo/stdin، inputs 1..N = lavfi (synth)،
 *     filter_complex يجمع → [aout]، ثم map [0:v] + [aout].
 */
function ffmpegArgs(
  size: { w: number; h: number },
  fps: number,
  outPath: string,
  audioPlan?: AudioPlan
): readonly string[] {
  const args: string[] = [
    '-y', '-hide_banner', '-loglevel', 'error',
    // input 0: rawvideo من stdin
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${size.w}x${size.h}`, '-r', String(fps),
    '-i', 'pipe:0',
  ];

  if (audioPlan && audioPlan.tracks.length > 0) {
    const built = buildAudioFilterGraph(audioPlan, 1); // videoInputCount=1
    args.push(...built.inputs);
    args.push(
      '-filter_complex', built.filterComplex,
      '-map', '0:v',          // فيديو stdin بلا أقواس (مصدر مباشر)
      '-map', built.audioMap, // مخرج filter (بأقواس)
    );
  } else {
    // صوت صامت — السلوك السابق
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
    args.push('-shortest');
  }

  args.push(
    // output: H.264 + yuv420p + AAC 128k
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-c:a', 'aac',
    '-b:a', '128k',
    outPath,
  );
  return args;
}

/**
 * تحوّل ImageData RGBA من skia-canvas إلى Buffer صافٍ لإرساله عبر
 * stdin. `getImageData` يُعيد Uint8ClampedArray؛ نلفّه في Buffer بلا نسخ.
 */
function rgbaBufferOf(canvas: Canvas): Buffer {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
}

export async function renderVideo(args: RenderVideoArgs): Promise<RenderVideoResult> {
  const fps = args.fps ?? 30;

  const canvas = new Canvas(args.size.w, args.size.h);
  const ctx = canvas.getContext('2d');

  // **plan** (L-07): wrap/justify/anims تُحسب مرة قبل الحلقة. تعطي prep
  // العنوان (headlineLineCount) اللازم لـ templateToTimeline لحساب
  // توقيت `after: "headline"`.
  const plan: RenderPlan = buildRenderPlan({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: ctx as any,
    size: args.size,
    template: args.template,
    brand: args.brand,
    content: args.content,
    fps,
  });
  const headlineLineCount = plan.headline?.linesJustified.length ?? 1;

  // Timeline v2 من القالب الموروث.
  const timeline = templateToTimeline({
    template: args.template,
    brand: args.brand,
    content: args.content,
    headlineLineCount,
    fps,
  });
  const frameCount = Math.ceil(timeline.duration * fps);

  const ffmpeg: ChildProcessWithoutNullStreams = spawn(
    args.ffmpegPath ?? 'ffmpeg',
    ffmpegArgs(args.size, fps, args.outPath, args.audioPlan),
    { stdio: ['pipe', 'inherit', 'inherit'] }
  ) as unknown as ChildProcessWithoutNullStreams;

  const ffmpegDone = new Promise<number>((res, rej) => {
    ffmpeg.on('error', rej);
    ffmpeg.on('close', (code) => res(code ?? -1));
  });

  try {
    for (let f = 0; f < frameCount; f++) {
      ctx.clearRect(0, 0, args.size.w, args.size.h);
      const t = f / fps;
drawTimelineAt({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ctx: ctx as any,
        size: args.size,
        timeline,
        template: args.template,
        brand: args.brand,
        content: args.content,
        ...(plan.headline && { headlinePrep: plan.headline }),
        t,
      });
      const buf = rgbaBufferOf(canvas);
      const writable = ffmpeg.stdin.write(buf);
      if (!writable) {
        await new Promise<void>((resolve) => ffmpeg.stdin.once('drain', resolve));
      }
      if (args.onProgress) args.onProgress(f + 1, frameCount);
    }
    ffmpeg.stdin.end();
  } catch (err) {
    ffmpeg.kill('SIGKILL');
    throw err;
  }

  const exit = await ffmpegDone;
  if (exit !== 0) {
    throw new Error(`[renderVideo] فشل FFmpeg — رمز الخروج ${exit}`);
  }

  // حجم الملف
  const { stat } = await import('node:fs/promises');
  const s = await stat(args.outPath);

  return {
    outPath: args.outPath,
    duration: timeline.duration,
    frameCount,
    fps,
    sizeBytes: s.size,
  };
}
