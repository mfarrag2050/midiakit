// /api/fonts/[name] — يخدم ملفات خطوط الهوية للمعاينة الحيّة.
// في الإنتاج يجب أن تأتي روابط الخطوط من mk-api (S3/R2 موقَّعة)؛
// هذا المسار للتطوير المحلّي حيث الهويات المرجعية تحمل روابط نسبيّة
// (`assets/fonts/*.ttf`) — نستخرج اسم الملف ونخدمه من repo.
//
// **قائمة السماح ثابتة** — أيّ اسم خارجها → 400. لا فتح لمسار عشوائي.

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
  try {
    const buf = await readFile(p);
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'font/ttf',
        'content-length': String(buf.length),
        // خطوط الهوية ثابتة لكل نسخة hash — cache قوي مقبول.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('font-not-found', { status: 404 });
  }
}
