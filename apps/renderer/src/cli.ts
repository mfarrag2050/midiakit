// cli — واجهة سطر أوامر بسيطة لـ`pnpm render:mp4`.
//
// **الاستخدام:**
//   pnpm render:mp4 -- --brand=default --template=breaking
//   pnpm render:mp4 -- --brand=client-demo --template=breaking --out=my.mp4
//
// **الافتراضات:** brand=default · template=breaking · out=out/render-<brand>.mp4

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand } from '@pf-mediakit/engine';

// تسجيل الخط قبل استيراد أي شيء يستعمله (يجب أن يحدث قبل renderVideo).
import { FontLibrary } from 'skia-canvas';

import { renderVideo } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// نقفز إلى جذر المستودع (apps/renderer/src/ → ../../..).
const ROOT = pathResolve(__dirname, '..', '..', '..');

interface CliArgs {
  brand: string;
  template: string;
  out?: string;
  fps: number;
  ffmpegPath?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { brand: 'default', template: 'breaking', fps: 30 };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];
    if (key === 'brand') args.brand = value;
    else if (key === 'template') args.template = value;
    else if (key === 'out') args.out = value;
    else if (key === 'fps') args.fps = parseInt(value, 10);
    else if (key === 'ffmpeg') args.ffmpegPath = value;
  }
  return args;
}

async function loadBrandRaw(name: string): Promise<unknown> {
  if (name === 'default') return DEFAULT_BRAND;
  const path = join(ROOT, 'brands', `${name}.json`);
  if (!existsSync(path)) throw new Error(`brands/${name}.json غير موجود`);
  return JSON.parse(await readFile(path, 'utf8'));
}

function resolveFontPath(url: string | undefined): string | null {
  if (!url) return null;
  return isAbsolute(url) ? url : pathResolve(ROOT, url);
}

// ── main ─────────────────────────────────────────────

const cli = parseArgs();
const brandRaw = await loadBrandRaw(cli.brand);
// نستعمل resolveBrand من الـpackage — الأنواع الديناميكية للـJSON مقبولة.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const brand = resolveBrand(brandRaw as any);

// تسجيل الخط ديناميكياً — نفس منطق preview.mjs (تراجع IBM Plex إن غاب).
const FONTS_DIR = join(ROOT, 'assets/fonts');
const IBM_PLEX_FALLBACK = [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
];
const weights = brand.fonts.primary.weights;
const fontPaths = [weights.light.url, weights.regular.url, weights.bold.url]
  .map(resolveFontPath)
  .filter((p): p is string => p !== null);

if (fontPaths.length > 0) {
  FontLibrary.use(brand.fonts.primary.family, fontPaths);
} else {
  FontLibrary.use(brand.fonts.primary.family, IBM_PLEX_FALLBACK);
}

const template = TEMPLATES[cli.template];
if (!template) {
  throw new Error(
    `[render:mp4] template=${cli.template} غير معروف. المتاح: ${Object.keys(TEMPLATES).join(', ')}`
  );
}

const CONTENT: Record<string, unknown> = {
  breaking: {
    headline:
      'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
    source: 'مصدر طبي للأناضول',
  },
}[cli.template] ?? { headline: 'قمة عربية طارئة' };

const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
const outPath = cli.out
  ? (isAbsolute(cli.out) ? cli.out : pathResolve(ROOT, cli.out))
  : join(OUT_DIR, `render-${cli.brand}-${cli.template}.mp4`);

const SIZE = { w: 1080, h: 1350 };

console.log(
  `[render:mp4] brand=${cli.brand} · template=${cli.template} · قماش=${SIZE.w}×${SIZE.h} · fps=${cli.fps}`
);

const start = Date.now();
const result = await renderVideo({
  template,
  brand,
  content: CONTENT,
  size: SIZE,
  outPath,
  fps: cli.fps,
  ...(cli.ffmpegPath && { ffmpegPath: cli.ffmpegPath }),
  onProgress: (f, total) => {
    if (f === 1 || f === total || f % 30 === 0) {
      process.stderr.write(`\r[render:mp4] ${f}/${total} إطار`);
    }
  },
});
process.stderr.write('\n');

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(
  `[render:mp4] ✓ ${result.outPath}\n  مدة=${result.duration.toFixed(2)}s · إطارات=${result.frameCount} · fps=${result.fps} · حجم=${(result.sizeBytes / 1024).toFixed(0)}KB · وقت رندر=${elapsed}s`
);
