// 300-DEMO-IDENTITY §٦.٢ — لقطات مَرافئ · ٣ عناوين × ٤ مقاسات = ١٢ لقطة.
//
// المخرَج: `out/300-marafi/<caseId>-<size>.png` (مؤقّت). إن ثبت صلاحها
// تُنقَل يدويّاً إلى `demo/marafi/` مع سطر في demo/README.md.
//
// **لا يلمس snapshots/*.** إنتاج لقطات جديدة فقط.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MARAFI_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, renderFrame } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/300-marafi');
mkdirSync(OUT_DIR, { recursive: true });

const { Canvas, FontLibrary } = await import('skia-canvas');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(MARAFI_BRAND);
const fixture = JSON.parse(
  readFileSync(join(ROOT, 'fixtures/300-demo-identity/headlines.json'), 'utf-8'),
);
const template = JSON.parse(
  readFileSync(join(ROOT, 'packages/templates/src/templates/breaking.json'), 'utf-8'),
);

const SIZES = [
  { key: 'x',         w: 1080, h: 1080 },
  { key: 'instagram', w: 1080, h: 1440 },
  { key: 'feed',      w: 1080, h: 1350 },
  { key: 'reel',      w: 1080, h: 1920 },
];

console.log('═══════════════════════════════════════════════════════════');
console.log('300-DEMO-IDENTITY · لقطات مَرافئ (٣ عناوين × ٤ مقاسات)');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

let total = 0;
let succeeded = 0;
const results = [];
const today = new Date().toISOString().slice(0, 10);

for (const c of fixture.cases) {
  console.log(`── ${c.id} · ${c.purpose.slice(0, 60)}…`);
  for (const size of SIZES) {
    total++;
    const dims = { w: size.w, h: size.h };
    const content = {
      headline: c.headline,
      source: c.source,
      timestamp: today,
      location: 'عالميّ',
    };
    try {
      const canvas = new Canvas(dims.w, dims.h);
      const ctx = canvas.getContext('2d');
      renderFrame({ ctx, size: dims, template, brand, content });
      const buf = await canvas.toBuffer('png');
      const outPath = join(OUT_DIR, `${c.id}-${size.key}.png`);
      writeFileSync(outPath, buf);
      succeeded++;
      results.push({ id: c.id, size: size.key, bytes: buf.length, ok: true });
      console.log(`  ✓ ${size.key.padEnd(10)} ${dims.w}×${dims.h} · ${buf.length} B`);
    } catch (e) {
      results.push({ id: c.id, size: size.key, err: e.message, ok: false });
      console.log(`  ✗ ${size.key.padEnd(10)} ${dims.w}×${dims.h} · ${e.message.slice(0, 60)}`);
    }
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log(`الخلاصة: ${succeeded}/${total} لقطة`);
console.log(`مسار المخرَج: ${OUT_DIR}`);
console.log('═══════════════════════════════════════════════════════════');

if (succeeded < total) process.exit(1);
