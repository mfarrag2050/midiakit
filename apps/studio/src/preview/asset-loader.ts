// asset-loader — يحوّل خرائط {field: assetId} إلى صور HTML جاهزة للرسم،
// عبر استدعاء API لرابط publicUrl الموقَّت ثمّ إنشاء صورة تحميل.
//
// SEC-1: الرابط يأتي من `assets.get()` (pre-signed من mk-api الموثوق).
// لا حقل هوية يُلمَس في هذا الملف.
//
// ذاكرة تخزين: مفتاح = assetId. لا نُعيد التحميل عند كل ضغطة مفتاح في
// المعاينة الحيّة (S13 debounce=200ms، بلا cache = طلب/ضغطة).

import { assets } from '../api';

type LoadedImage = HTMLImageElement;
const cache = new Map<string, LoadedImage>();

async function loadOne(assetId: string): Promise<LoadedImage> {
  const cached = cache.get(assetId);
  if (cached) return cached;
  const meta = await assets.get(assetId);
  const url = meta.publicUrl;
  if (!url) {
    throw new Error(`asset-no-public-url: ${assetId} — publicUrl missing from mk-api response`);
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const done = new Promise<LoadedImage>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`asset-load-failed: ${assetId} (${url})`));
  });
  img.src = url;
  const loaded = await done;
  cache.set(assetId, loaded);
  return loaded;
}

export async function resolveAssetImages(
  ids: Readonly<Record<string, string>>,
): Promise<Record<string, LoadedImage>> {
  const entries: Array<[string, LoadedImage]> = await Promise.all(
    Object.entries(ids).map(async ([field, id]) => {
      if (!id) throw new Error(`asset-id-empty: field=${field}`);
      const img = await loadOne(id);
      return [field, img];
    }),
  );
  const out: Record<string, LoadedImage> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}
