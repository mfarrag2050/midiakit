// timeline-v2/duration — timelineDuration(timeline) (docs/10 عقد المحرك).
//
// **العقد:** المدة الرسمية من حقل `timeline.duration`. الدالة هنا حرَس
// اتّساق: تتأكّد أن لا عنصر يتجاوز `duration` المُعلنة، وأن الأخير لا
// يقلّ عنها بفارق مقلق (تحذير غير قاتل).
//
// **لماذا ليس max(end)؟** لأن `duration` قد تشمل outro أو صمتاً نهائياً
// لا يحمله أيّ عنصر. الاعتماد على `max(end)` يبتلع تلك النية.

import type { Timeline } from '@pf-mediakit/shared';

/** المدة المُعلنة — القيمة النهائية للمخطّط الزمني. */
export function timelineDuration(timeline: Timeline): number {
  return timeline.duration;
}

/** أقصى نهاية بين كل العناصر في كل المسارات — قد يساوي duration أو يقلّ. */
export function timelineMaxItemEnd(timeline: Timeline): number {
  let max = 0;
  for (const track of timeline.tracks) {
    for (const item of track.items) {
      if (item.end > max) max = item.end;
    }
  }
  return max;
}
