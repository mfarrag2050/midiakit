// 500 · حارسُ العائلة `/dev/*` في بناءِ الإنتاج
//
// 970 قاس أنّ صفحاتِ التطويرِ الأربع (`render-errors` · `render-pending` ·
// `font-check` · `pixel-eq`) ورَاوترَ `mock-image` تُبنَى وتُخدَم في
// production بلا حارس. الشريكُ الذي يعبرُ Access يستطيعُ كتابةَ المسار
// ويرى شاشةَ تصحيحٍ داخليّة.
//
// السببُ في اختيارِ middleware — لا شرطٌ في كلِّ صفحة — أنّ العائلةَ
// تتوسّع (خمسةٌ الآن، وستزيد). حارسٌ واحدٌ يُغطّي ما لم يُكتَبْ بعد؛
// الحارسُ الفرديّ يُنسى مع أوّلِ صفحةٍ جديدة (970 §١.ه).
//
// السلوك:
//   - production (NODE_ENV=production) → 404 لكلِّ `/dev/*` وما تحته.
//   - development (NODE_ENV=development) → مرور — الأدواتُ في مكانها.
//   - أيّ NODE_ENV غير المعروفَين (test مثلاً) → مرور — لا نُعطّلُ اختباراً.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    // نُعيد 404 نصّاً — لا rewrite إلى `/404` كي لا نُسرِّبَ وجودَ المسار
    // في رأسِ `x-matched-path` أو مثله.
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.next();
}

// المُطابق: كلُّ ما يبدأُ بـ`/dev`. صياغةُ Next للمطابقة تسمحُ بـ
// path-to-regexp مع wildcard، فيغطّي `/dev` نفسه و`/dev/anything/…`.
export const config = {
  matcher: ['/dev/:path*'],
};
