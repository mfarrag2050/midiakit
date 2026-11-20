# inbox · mk

## 2026-11-20T13:30Z · إيصال القراءة وبدء البند 1
قرأتُ حتّى 18b5e0b
- استلمتُ الدور والقائمة والقواعد. /loop مضبوط كلّ 30 دقيقة (cron f7e388ae).
- البند 1 بدأ: فرع fix/544-typecheck من main@d8dba2b · أعدّ أخطاء typecheck لكلّ حزمة من الستّ. السقوف المسجّلة مجموعها 162 (> 30) · سأقيس الفعليّ قبل القرار.

ما نُشر: — · ما يجري: البند 1 (عدّ الأخطاء) · ما أنتظره وممّن: — · التالي: قرار إصلاح/تمديد ثمّ CI.

## 2026-11-20T13:58Z · البند 1 و3 في المراجعة · البند 4 منجز · البند 2 يُقاس
قرأتُ حتّى 18b5e0b
- البند 1 (fix/544-typecheck@407f88e · PR #31): المقيس على main@d8dba2b = 124 خطأ (> 30) ⇒ مُدِّد expires إلى 2026-12-15 بسطر سبب، وخُفِّضت السقوف إلى المقيس (renderer 39→32 · api 37→26 · engine 28→21 · studio 26→23 · dashboard 25→15 · tts 7). check:typecheck محلّياً أخضر (6 استثناء مؤقّت). CI على PR معلّق الآن.
  قائمة الأخطاء لكلّ حزمة (بند لاحق):
  · مصدر packages/engine (13 خطأ فريداً، يتكرّر في api · dashboard · renderer · studio · engine): layout-balanced.ts TS2741 ×5 · layers/svg.ts TS7016 ×2 · render.ts TS2304 ×2 + TS2412 + TS2538 · layers/solid.ts TS2322 · text/index.ts TS2305. إصلاحها وحده يُسقط ~65 من 124. المحرّك مقفل عليّ ⇒ يحتاج تذكرة بإذن.
  · مصدر apps/renderer (يتكرّر في api · dashboard): queues.ts TS2322 ×2 · alerts.ts TS2783 · api-worker.ts TS2322 · validate.ts TS18048 ×2 (api · renderer). خاصّ بـrenderer: cli.ts TS2322 ×2 + TS2412 ×2 + TS2345 · observe.test.ts TS2322 ×4 · tenant-cap.test.ts TS18048 ×2 + TS2322 ×2.
  · apps/api: alerts-cron.ts TS2322 ×2 · empty-layers.test.ts TS2344 ×2 · export-limits.test.ts TS2375 · services/font-metrics.ts TS7016 · storage/index.ts TS2345.
  · apps/studio: timeline-ops.test.ts TS18048 ×6 · timeline-add*.test.ts TS2352 ×2 · api/mock.ts TS2352 · dev/pixel-eq/page.tsx TS2869.
  · apps/dashboard: لا أخطاء خاصّة — كلّ الـ15 مستوردة من engine وrenderer.
  · packages/tts: adapters/mock.ts TS2307 ×4 + TS2591 · types.ts TS2591 + TS4115.
- البند 2 (fix/545-deflake · لم يُلتزَم بعد): stack الـpuppeteer في CI لا يحمل سطر الاختبار ⇒ أضفتُ تسمية خطوة لكلّ انتظار، وجعلتُ كلّ نقرات التصدير الأربع تنتظر الزرّ ممكَّناً (611 أغلق واحدة فقط). حلقة flake ×20 تعمل الآن داخل mk-ci (حاوية colima-mediakit). سأنشر بعد النتيجة.
- البند 3 (fix/546-gate-latest@bdc4fc2 · PR #33): show_ci_verdict يحكم بآخر محاولة لكلّ اسم فحص (started_at ثمّ id)؛ آخر محاولة معلّقة تبقى حاجبة. test-show-ci.py +5 حالات (17): أحمر على مساعد main · أخضر بعده. ملاحظة: test-show-ci.py غير موصول بـCI أصلاً. لم أشغّل promote.
- البند 4 (جرد قراءة فقط · لم أقتل شيئاً):
  · mk-api: zsh ← claude --permission-mode acceptEdits في pf-mediakit-api · حيّة منذ 44 يوماً · آخر نشاط 2026-10-29.
  · mk-dev-api: نافذتان · dev-launch.mjs api (يستمع 127.0.0.1:19040) و dev-launch.mjs worker · من pf-mediakit-api · منذ 45 يوماً · آخر نشاط 2026-10-07.
  · mk-heal: sleep 2147483647 وحده · خامل منذ 2026-10-07 · لا عمل.
  · mkghost: claude/bin/mk-ghost-watch.sh (قارئ محض) حيّ · يكتب claude/reports/_ghost-watch.log (6.0MB · آخر كتابة 16:33 محلّي) · يراقب "mediakit mk-api mk-studio mkaudit mkci".
  · ملاحظة جانبيّة: 19080/19081 (api + next-server) أيتام PPID=1 منذ 45 يوماً — ليسا من هذه الجلسات؛ 19070/19071 بدأا قبل ~8 ساعات.

ينتظر المالك:
- قرار مصير mk-heal (خامل) و mk-dev-api (api dev قديم على 19040 منذ 45 يوماً) و mkghost (سجلّ 6MB ينمو). لن ألمسها.
- إذن تذكرة لإصلاح الـ13 خطأ في packages/engine (أكبر رافعة: ~65 من 124).

طلب مراجعة fix/546-gate-latest@bdc4fc2 (بعد اخضرار CI على PR #33).

ما نُشر: PR #31 · PR #33 · ما يجري: CI على #31/#33 · حلقة flake ×20 للبند 2 · ما أنتظره وممّن: CI من GitHub · مراجعة من mkrv · التالي: نشر 545 ثمّ طلب مراجعة 544 حين يخضرّ.
