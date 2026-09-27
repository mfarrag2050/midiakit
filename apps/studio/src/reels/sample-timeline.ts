import type { Timeline } from '@pf-mediakit/shared';

export const SAMPLE: Timeline = {
  duration: 32,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'trk-media',
      type: 'media',
      index: 0,
      items: [
        // 464: بلا `draw-media` لا ترسمُ الوسائطُ شيئاً — والصورُ
        // المولَّدةُ تصلُ المحرّكَ عبر assets.images بمفتاح src نفسِه.
        // 466: kenBurns بمعلمتَيها — زحفُ ٨٪ على مدى القطعة، وorigin
        // يختلفُ بين القطعتَين ليرى الفرقَ العينُ (بلا from/to يصيرُ
        // scale=NaN فتُسمَّمُ مصفوفةُ التحويل ويختفي ما بعدها — فراغُ 464).
        { id: 'clip-01', start: 0, end: 9.5, src: 'asset:reel-a',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:reel-a' },
          ] },
        { id: 'clip-02', start: 9.5, end: 18, src: 'asset:reel-b',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'topLeft' },
            { type: 'draw-media', assetKey: 'asset:reel-b' },
          ] },
        { id: 'clip-03', start: 18, end: 32, src: 'asset:reel-c',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:reel-c' },
          ] },
      ],
    },
    {
      id: 'trk-text',
      type: 'text',
      index: 1,
      items: [
        // 466: النصُّ يتحرّك — byWord كلمةً كلمةً (رقمان بالثانية)، ومعه
        // kenBurns زحفُ ٨٪ على مدى القطعة: نقلُها نصفَ ثانيةٍ يُزحزحُ
        // المشهدَ والقطعةُ داخلَ نافذة النشاط — اختبارُ الحساسيّة الذي
        // سقط في 464. والقيمةُ نصٌّ عربيٌّ من اختراع هذه الصفحة، لا
        // اسمَ جهةٍ ولا علامةً.
        // 469 §١: anchor صريحٌ لكلّ قطعة — بلاهُ يهبطُ الجميعُ إلى
        // المنتصف فيركبُ بعضُهم بعضاً عند أيّ تداخلٍ زمنيّ (هو عطبُ
        // اللقطة التي قُرئت بالعين). 0.2 · 0.5 · 0.8 متباعدةٌ عمداً.
        { id: 'title-01', start: 0.5, end: 7, anchor: 0.2,
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'text-item-byWord', stagger: 0.08, fadeDuration: 0.25 },
          ],
          value: 'الإيقاعُ السريعُ يشدُّ المشاهدَ من أوّلِ ثانية' },
        // 466 §٢: تُبقى هاتانِ ساكنتَين على text-item-lines — المشهدُ
        // الواحدُ يُري المتحرّكَ والساكنَ معاً للمقارنة.
        { id: 'title-02', start: 7, end: 14, anchor: 0.5,
          effects: [{ type: 'text-item-lines' }],
          value: 'كلُّ لقطةٍ تخدمُ الحكايةَ ولا تحيدُ عنها' },
        { id: 'title-03', start: 20, end: 28, anchor: 0.8,
          effects: [{ type: 'text-item-lines' }],
          value: 'النصُّ المكتوبُ جيّداً يصلُ قبلَ الصورة' },
      ],
    },
    {
      id: 'trk-audio',
      type: 'audio',
      index: 2,
      items: [
        { id: 'vo-main', start: 0, end: 18, gain: 0.9 },
        { id: 'sting-01', start: 18, end: 20.5 },
      ],
    },
  ],
};
