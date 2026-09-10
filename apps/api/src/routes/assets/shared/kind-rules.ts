/**
 * kind-rules — قواعد تحقّق mapping بين kind و content-type (docs/16 §9).
 *
 * القاعدة: UNSUPPORTED_KIND إن كان kind خارج القائمة السبعة،
 * UNSUPPORTED_CONTENT_TYPE_FOR_KIND إن كان contentType لا يناسب kind.
 */

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'logo' | 'svg' | 'lottie';

export const ASSET_KINDS: readonly AssetKind[] = [
  'image', 'video', 'audio', 'font', 'logo', 'svg', 'lottie',
] as const;

/**
 * mapping kind → allowed content types.
 * القوائم اشتُقّت من MIME registry الشائع + docs/03 §fonts/logo.
 * صورة SVG منفصلة عن image (السلوك يختلف — §9.2 warnings).
 */
const ALLOWED_CONTENT_TYPES: Record<AssetKind, readonly string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/aac'],
  font:  ['font/ttf', 'font/otf', 'font/woff2', 'font/woff',
          'application/font-woff', 'application/font-woff2',
          'application/x-font-ttf', 'application/x-font-otf'],
  logo:  ['image/png', 'image/svg+xml'], // logo قد يكون svg (خطّ محوَّل) أو png
  svg:   ['image/svg+xml'],
  lottie: ['application/json'],
};

export function isKind(k: string): k is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(k);
}

export function isContentTypeAllowedForKind(kind: AssetKind, contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES[kind].includes(contentType);
}
