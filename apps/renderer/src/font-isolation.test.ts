// 141-FONT-IDENTITY-BY-ASSET · اختبار حياة L-46
//
// **witness** — يُثبت أنّ نمط `family` كمفتاح تسجيل ينتج corruption في
// السيناريو المتزامن (فيديو يقلب خطّه في منتصف الرسم — 140 · صورتان).
// يبقى في السجلّ ليُذكِّر بأنّ الشكل القديم كان يفشل فعلاً.
//
// **guard** — يُثبت أنّ `deriveFontIdentity` يمنع التصادم بنيويّاً.
// حين يهبط `deriveFamily` في engine.resolveBrand عند mk، هذا الحارس
// يُحذَف مع الـshim في نفس commit (راجع رأس `font-identity.ts`).
import { describe, it, expect } from 'vitest';
import { Canvas, FontLibrary } from 'skia-canvas';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { deriveFontIdentity } from './lib/font-identity.js';

const ROOT = resolve(__dirname, '..', '..', '..');
const FONT_A = `${ROOT}/assets/fonts/Almarai-Regular.ttf`;
const FONT_B = `${ROOT}/assets/fonts/IBMPlexSansArabic-Regular.ttf`;

const ASSET_A = '11111111-1111-1111-1111-111111111111';
const ASSET_B = '22222222-2222-2222-2222-222222222222';
const DISPLAY_FAMILY = 'Cairo';

const W = 600;
const H = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function renderFrame(family: string, text: string): string {
  const c = new Canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#111';
  x.fillRect(0, 0, W, H);
  x.font = `bold 80px "${family}"`;
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, W / 2, H / 2);
  return createHash('md5').update(c.toBufferSync('png')).digest('hex');
}

async function runScenario(keyForA: string, keyForB: string): Promise<number> {
  FontLibrary.use(keyForA, [FONT_A]);
  // baseline قبل أيّ مقاطعة
  const baseA: string[] = [];
  for (let i = 0; i < 20; i++) baseA.push(renderFrame(keyForA, `A${i}`));

  const results: string[] = [];
  await Promise.all([
    (async () => {
      for (let i = 0; i < 20; i++) {
        await sleep(5);
        results.push(renderFrame(keyForA, `A${i}`));
      }
    })(),
    (async () => {
      await sleep(50);
      FontLibrary.use(keyForB, [FONT_B]);
    })(),
  ]);
  let corrupted = 0;
  for (let i = 0; i < 20; i++) if (results[i] !== baseA[i]) corrupted++;
  return corrupted;
}

describe('141 witness · نمط family-based (شكل قبل الـshim)', () => {
  it('نفس اسم العائلة لجوبَين ⇒ >= 5 إطار مفسود', async () => {
    // يستعمل نفس اسم العائلة العرضيّ لكلا الجوبَين — النمط الذي كان
    // في api-worker.ts:185 قبل هذا الالتزام. سُلوك skia-canvas يُنتج
    // corruption مضمون في scenario 20-إطار مع مقاطعة.
    const corrupted = await runScenario(DISPLAY_FAMILY, DISPLAY_FAMILY);
    expect(corrupted).toBeGreaterThanOrEqual(5);
  });
});

describe('141 guard · بعد deriveFontIdentity', () => {
  it('deriveFontIdentity: family+assetId ⇒ اسم فريد', () => {
    const a = deriveFontIdentity({ family: DISPLAY_FAMILY, assetId: ASSET_A });
    const b = deriveFontIdentity({ family: DISPLAY_FAMILY, assetId: ASSET_B });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^mk-11111111/);
  });

  it('deriveFontIdentity: مدمج (بلا assetId) ⇒ slug من family', () => {
    expect(deriveFontIdentity({ family: 'IBM Plex Sans Arabic' }))
      .toBe('mk-builtin-ibm-plex-sans-arabic');
  });

  it('deriveFontIdentity: بلا family ولا assetId ⇒ throws (لا سقوط صامت)', () => {
    expect(() =>
      deriveFontIdentity({} as { family?: string; assetId?: string }),
    ).toThrow(/FONT_IDENTITY_MISSING/);
  });

  it('اسمان مشتقّان لأصلَين مختلفَين ⇒ 0/20 إطار مفسود', async () => {
    const runtimeA = deriveFontIdentity({ family: DISPLAY_FAMILY, assetId: ASSET_A });
    const runtimeB = deriveFontIdentity({ family: DISPLAY_FAMILY, assetId: ASSET_B });
    const corrupted = await runScenario(runtimeA, runtimeB);
    expect(corrupted).toBe(0);
  });
});
