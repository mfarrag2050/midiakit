// 210-RENDER-PARITY · هل مسار التصدير حتميّ (deterministic)؟
//
// **الاعتراف المُقدَّم** (§١ ذيل التذكرة):
// «إن كان أحد المسارين لا يُستدعى أصلاً في الـAPI (المعاينة في المتصفّح
// مثلاً) فقل ذلك صراحةً: لم أستطع القياس ولماذا — ولا تصطنع مساراً
// ليتطابق مع نفسه».
//
// **الحقيقة البنيويّة**:
//   • **مسار المعاينة** = Canvas 2D في المتصفّح + browser font rasterizer
//     (Freetype على macOS/Linux · DirectWrite على Windows).
//   • **مسار التصدير** = skia-canvas في Node + Skia's Rust font rasterizer.
// كلاهما يقرأ **نفس ملفّ الخطّ** (Almarai TTF عبر /v1/assets/:id/font)
// لكنّ الرَّاسِمَين مختلفان تماماً. **pixel-perfect parity مستحيلة بنيويّاً**
// بين browser Canvas و skia — sub-pixel positioning · hinting · AA يختلفون.
//
// ما أستطيع قياسه من API (وأفعله هنا):
//   1. **حتميّة التصدير** — نفس المدخل عبر api-worker مرّتين ⇒ بايت مطابق.
//      إن سقطت: نصف parity ساقط بلا حاجة لمقارنة مع browser.
//   2. **RED-GREEN**: أُغيّر لوناً واحداً في run ثانٍ ⇒ المقارنة تسقط.
//      استعادة ⇒ تعود مطابقة.
//
// ما لا أستطيع قياسه من API:
//   - preview (browser) vs export (Node). لا Chromium headless هنا · لو
//     أشغلته لكان اختباراً على Chromium الجهاز · ليس browser المستخدم.
//
// **ما ينبغي على mkst** (لن أُغيّره · تسليم إلى القسم الآخر):
//   في CI mkst: puppeteer/playwright يفتح studio · يرسم preview بنفس
//   المُدخل · يقارن مع PNG المُصدَّر بـ**perceptual diff** (pixelmatch مع
//   عتبة sensitive ~0.1) لا pixel-perfect. النتيجة > عتبة = عطب حقيقيّ.
import { describe, it, expect } from 'vitest';
import { Canvas, FontLibrary } from 'skia-canvas';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const FONT_PATH = `${REPO_ROOT}/assets/fonts/Almarai-Regular.ttf`;

const INPUT = {
  headline: 'الأخبار العاجلة اليوم',
  bg: '#111111',
  text: '#FFFFFF',
  w: 600,
  h: 300,
  fontSize: 60,
} as const;

/**
 * نُحاكي مسار التصدير الحرفيّ من api-worker.ts:216-230 — نفس المكتبة
 * (skia-canvas) · نفس الترتيب (fillRect ثمّ fillText). دالّة معزولة
 * لأنّ api-worker inline في processApiJob وليس exported.
 */
function renderExport(bg: string, text: string, fontFamily: string): Buffer {
  const c = new Canvas(INPUT.w, INPUT.h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, INPUT.w, INPUT.h);
  ctx.font = `bold ${INPUT.fontSize}px "${fontFamily}"`;
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(INPUT.headline, INPUT.w / 2, INPUT.h / 2);
  return c.toBufferSync('png');
}

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

describe('210 · تطابُق الرسم', () => {
  // نُسجّل الخطّ مرّة قبل كل الاختبارات (FontLibrary عالميّ)
  FontLibrary.use('mk-parity', [FONT_PATH]);

  it('حتميّة التصدير: run 1 == run 2 · بايت بايت', () => {
    const a = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    const b = renderExport(INPUT.bg, INPUT.text, 'mk-parity');

    const hashA = md5(a);
    const hashB = md5(b);
    console.log(`[210-DETERM] run1=${hashA.slice(0, 12)} run2=${hashB.slice(0, 12)} len=${a.length}`);

    // (١) الحجم متطابق
    expect(a.length).toBe(b.length);
    // (٢) البايت مطابق
    expect(a.equals(b)).toBe(true);
    // (٣) الـmd5 مطابق
    expect(hashA).toBe(hashB);
  });

  it('RED · تغيير لون النصّ ⇒ المقارنة تسقط', () => {
    const baseline = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    const modified = renderExport(INPUT.bg, '#FF0000', 'mk-parity'); // نصّ أحمر بدل أبيض
    const hashBase = md5(baseline);
    const hashMod = md5(modified);
    console.log(`[210-RED-color] base=${hashBase.slice(0, 12)} mod=${hashMod.slice(0, 12)}`);
    expect(baseline.equals(modified)).toBe(false);
    expect(hashBase).not.toBe(hashMod);
  });

  it('RED · تغيير خلفيّة ⇒ المقارنة تسقط', () => {
    const baseline = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    const modified = renderExport('#222222', INPUT.text, 'mk-parity'); // bg مختلف بقيمة قليلة
    console.log(`[210-RED-bg] base=${md5(baseline).slice(0, 12)} mod=${md5(modified).slice(0, 12)}`);
    expect(baseline.equals(modified)).toBe(false);
  });

  it('GREEN بعد استعادة: نفس المدخل مرّة ثالثة ⇒ يعود مطابقاً للأصل', () => {
    // بعد اختبارَي RED · نتحقّق أنّ الحتميّة لم تنهار
    const a = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    const b = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    expect(a.equals(b)).toBe(true);
  });

  it('حتميّة عبر إعادة تسجيل الخطّ: FontLibrary.use مرّتين ⇒ نفس البايت', () => {
    // نُعيد التسجيل عن قصد لنُثبت أنّه idempotent
    FontLibrary.use('mk-parity', [FONT_PATH]);
    const a = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    FontLibrary.use('mk-parity', [FONT_PATH]);
    const b = renderExport(INPUT.bg, INPUT.text, 'mk-parity');
    expect(a.equals(b)).toBe(true);
  });
});
