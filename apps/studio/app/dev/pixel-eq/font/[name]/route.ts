// /dev/pixel-eq/font/[name] — أداة قياس مؤقّتة (PIXEL-EQ-M).
// تخدم ملف الخط الحقيقي من assets/fonts/ لتضمن أنّ المتصفح يستعمل
// نفس البايتات التي يحمّلها skia-canvas في preview.mjs.
//
// **ليست ميزة إنتاج.** للحذف بعد اكتمال القياس.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..', '..', 'assets', 'fonts');
const ALLOWED = new Set([
  'IBMPlexSansArabic-Bold.ttf',
  'IBMPlexSansArabic-Regular.ttf',
  'IBMPlexSansArabic-Light.ttf',
  'Almarai-Bold.ttf',
  'Almarai-Regular.ttf',
  'Almarai-Light.ttf',
  'Almarai-ExtraBold.ttf',
]);

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
): Promise<Response> {
  if (!ALLOWED.has(params.name)) {
    return new Response('font-name-not-allowed', { status: 400 });
  }
  const p = join(ROOT, params.name);
  const buf = await readFile(p);
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'font/ttf',
      'content-length': String(buf.length),
      'cache-control': 'no-store',
      // نُعلن مصدر الملف في header — أداة قياس، لا حساسية أمنية.
      'x-pixeleq-source-path': p,
    },
  });
}
