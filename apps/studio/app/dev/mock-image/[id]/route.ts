// /dev/mock-image/[id] — يخدم صورة اختباريّة ثابتة لتحقّق IMAGE-VERTICAL
// في وضع mock. **ليست ميزة إنتاج.** للحذف حين يتّحد التطوير مع mk-api.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..', '..');
const IMG = join(ROOT, 'demo', 'studio', 'design-ar.png');

export async function GET(): Promise<Response> {
  try {
    const buf = await readFile(IMG);
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response('image-not-found', { status: 404 });
  }
}
