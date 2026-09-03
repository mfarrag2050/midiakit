// مقارنة سريعة: قديم (snapshots/) مقابل جديد (out/) للقطات المتأثّرة.
import { Canvas, Image } from 'skia-canvas';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = '/Users/mdervis/MediaKit/pf-mediakit';
const files = [
  { name: 'default (nosemantic)', old: 'snapshots/preview-default.png', new: 'out/nosemantic/preview-default.png' },
  { name: 'client-demo (nosemantic)', old: 'snapshots/preview-client-demo.png', new: 'out/nosemantic/preview-client-demo.png' },
];

async function loadImg(p) {
  const img = new Image();
  const buf = await readFile(join(ROOT, p));
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = (e) => rej(e);
    img.src = buf;
  });
  return img;
}

const first = await loadImg(files[0].old);
const W = first.width, H = first.height;
const PAD = 60, GAP = 30, LABEL_H = 90;
const canvasW = W * 2 + GAP + PAD * 2;
const canvasH = (H + LABEL_H) * files.length + PAD * 2 + 60;

const canvas = new Canvas(canvasW, canvasH);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0B0B0B';
ctx.fillRect(0, 0, canvasW, canvasH);

// عنوان أعلى
ctx.fillStyle = '#F8F4E9';
ctx.font = '700 32px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.fillText('Snapshot diff — مصدر طبي للأناضول ← مصدر طبي — مراسلنا', canvasW / 2, 18);

for (let i = 0; i < files.length; i++) {
  const y = PAD + i * (H + LABEL_H) + 60;
  const oldImg = await loadImg(files[i].old);
  const newImg = await loadImg(files[i].new);

  // تسميات
  ctx.fillStyle = '#F8F4E9';
  ctx.font = '600 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${files[i].name} — old (snapshots/)`, PAD + W / 2, y);
  ctx.fillText(`${files[i].name} — new (out/)`, PAD + W + GAP + W / 2, y);

  ctx.drawImage(oldImg, PAD, y + 40);
  ctx.drawImage(newImg, PAD + W + GAP, y + 40);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(PAD, y + 40, W, H);
  ctx.strokeRect(PAD + W + GAP, y + 40, W, H);
}

const outPath = join(ROOT, 'out/anadolu-cleanup-snapshot-diff.png');
await writeFile(outPath, canvas.toBufferSync('png'));
console.log(`✓ ${outPath} (${canvasW}×${canvasH})`);
