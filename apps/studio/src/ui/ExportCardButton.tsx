'use client';

import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { Alert, Button } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, projects, renders } from '@/src/api';

// ExportCardButton — نفس مكوّن `150-EXPORT-BUTTON` مغلَّف كي يُعاد
// استعماله في محرّر الهويّة والمؤلّف (`160-BREAKING-COMPOSER`) بلا
// نسخ ثانية للحالة أو التدفّق (قاعدة `160` §١).
//
// المسار (ثابت من §150 · لا يتغيّر بتغيّر النداء):
//   1. `projects.create` → مشروع مؤقّت باسم «تصدير — <اسم> — <تاريخ>»
//   2. `renders.create` بـidempotency-key فريد للضغطة
//   3. `renders.get` استطلاعاً كلّ 500ms · مهلة 30s
//   4. `renders.getOutput` → URL
//   5. `fetch(url).blob()` → `<a download>` → click → revoke
//   6. `success` **بعد** وصول البلوب — لا قبله
//
// الحارس `savingRef-pattern` (§130 §٢) يمنع سباق الكتابة على الضغط
// المزدوج داخل نفس microtask.

// 250-RENDER-NEVER-HANGS — قِيَم مسمّاة للمهل + backoff أُسّي.
//
// **جدول الاستطلاع (exponential backoff من 500ms إلى 4000ms · مضاعف 1.5):**
// 500ms · 750 · 1125 · 1687 · 2531 · 3796 · 4000 · 4000 · … (سقف 4s)
// تراكميّاً: أوّل استجابة عند 500ms · 1250 · 2375 · 4062 · 6593 · 10389 · 14389 …
//
// **لماذا backoff؟** قِستُه في اختبار الحياة (شجرة `mkst`، mkapi على
// 19040 بلا worker): استطلاع ثابت بـ500ms يفجّر rate-limiter افتراضيّ
// @fastify/rate-limit ⇒ 12 استطلاعاً في 6s ⇒ 429 ⇒ سبات 30s من client.ts
// (`Retry-After`) ⇒ الواجهة تظهر خطأً مضلِّلاً «تجاوزت حدّ المعدّل» بعد
// 38s. backoff يُخفّض الحمل الكلّي (< 20 استطلاع في 60s = 20/min · هامش
// كافٍ تحت أيّ حدّ افتراضيّ) بينما يبقي الاستجابة الأولى سريعة.
//
// **POLL_QUEUE_STUCK_MS = 10_000** — إن بقي `status = 'queued'` أكثر من هذا،
// نفترض أنّ عامل الرندَر لا يعمل. مقاييسي (شجرة `mkst` · §230): حين يعمل
// api-worker (شجرة `mkapi`)، الرندَر ينتقل إلى `running` قبل أوّل استطلاع
// (< 2s ‏· «poll 1: succeeded»). عشر ثوانٍ سقفٌ متحفّظ يضاعف ذلك خمس
// مرّات · كافٍ لاستيعاب تأخّر شبكة أو تدخّل fair-share.
//
// **POLL_TOTAL_TIMEOUT_MS = 60_000** — سقف كلّي إذا انتقل إلى `running`
// لكنّ الرسم أخذ وقتاً طويلاً. مقاييسي (شجرة `mkst` · §230): رندَر ناجح
// على mkapi's stub path (fillText) تمّ في أقلّ من ثانيتَين. **لكن لا
// أعرف زمن renderFrame الكامل** (النصّ الحقيقيّ + الشعار + الخطّ) على
// الإنتاج — لم يُقَس بعد لأنّ 109 لم يوصِل renderFrame أصلاً (§230).
// ٦٠ ثانية اختيارٌ **متحفّظ صراحةً** حتّى يتوفّر رقم إنتاج.
//
// **حالتان في الواجهة** — نميّز بين `queued` و`running` من status الخادم:
//  - queued  → step `waitingForWorkerStep` («انتظار عامل الرندَر…»)
//  - running → step `runningStep` («الرسم قيد التنفيذ…»)
// وإن بقي queued > 10s نُخرج `RENDER_QUEUE_STUCK` (خطأ مسمّى · client-only)
// كي لا يظنّ المستخدم أنّ الشبكة بطيئة بينما الأمر أنّ الخدمة لا تستجيب.
const POLL_INITIAL_MS = 500;
const POLL_MAX_INTERVAL_MS = 4_000;
const POLL_BACKOFF_FACTOR = 1.5;
const POLL_QUEUE_STUCK_MS = 10_000;
const POLL_TOTAL_TIMEOUT_MS = 60_000;

export interface ExportCardButtonProps {
  readonly brandKitId: string;
  readonly brandKitName: string;
  readonly templateId: string;
  readonly content: Readonly<Record<string, unknown>>;
  /** حين يعطّله الأب (مثلاً بسبب dirty في المحرّر). */
  readonly disabled?: boolean;
  /** مفتاح i18n يفسّر لماذا مُعطَّل. */
  readonly disabledReasonKey?: string | null;
  /** تلميح افتراضيّ حين لا يوجد سبب تعطيل. */
  readonly hintKey?: string;
  /** ref على canvas المعاينة — إن مُرِّر ومسار الخادم كان mock (يعيد صورة
   *  seed ثابتة)، نستبدل الملفّ المُنزَّل ببكسلات المعاينة الفعليّة. هذا
   *  يُصلح «الملفّ ≠ البطاقة المعروضة» في mock بلا لمس المحرّك أو الخادم
   *  الحقيقيّ (200-DEMO-FIX-2 §1·٢). */
  readonly previewCanvasRef?: RefObject<HTMLCanvasElement>;
}

/** «mock output URL» — الخادم في mock يعيد `/dev/mock-image/<id>` (صورة
 *  seed ثابتة). في هذه الحالة نُبدّل الملفّ بمخرج canvas المعاينة كي
 *  يتطابق «ما تراه» مع «ما تُنزِّل». في الإنتاج URL محاكاة S3 presigned
 *  حقيقيّة فيصل الملفّ كما هو. */
function isMockOutputUrl(url: string): boolean {
  return url.includes('/dev/mock-image/');
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}

export function ExportCardButton({
  brandKitId,
  brandKitName,
  templateId,
  content,
  disabled = false,
  disabledReasonKey = null,
  hintKey = 'pages.brandKits.editor.export.hint',
  previewCanvasRef,
}: ExportCardButtonProps): JSX.Element {
  const { t } = useLocale();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [stepKey, setStepKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  async function doExport(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErrorKey(null);
    setSuccessKey(null);
    setStepKey('pages.brandKits.editor.export.queuedStep');
    try {
      // 1. مشروع مؤقّت.
      const proj = await projects.create({
        title: `تصدير — ${brandKitName} — ${new Date().toISOString().slice(0, 10)}`,
        brand_kit_id: brandKitId,
        template_id: templateId,
        content,
        locale: 'ar',
      });
      // 2. طلب رندَر.
      const idempotencyKey = `bk-export-${brandKitId}-${Date.now()}`;
      const rnd = await renders.create(
        { project_id: proj.id, size: 'x', format: 'png' },
        idempotencyKey
      );
      // 3. استطلع — نميّز queued vs running · backoff أُسّي · مهلتان مسمّاتان.
      setStepKey('pages.brandKits.editor.export.waitingForWorkerStep');
      let final: Awaited<ReturnType<typeof renders.get>> | null = null;
      const pollStartedAt = Date.now();
      let queuedSince: number | null = pollStartedAt;
      let interval = POLL_INITIAL_MS;
      while (Date.now() - pollStartedAt < POLL_TOTAL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, interval));
        interval = Math.min(interval * POLL_BACKOFF_FACTOR, POLL_MAX_INTERVAL_MS);
        const row = await renders.get(rnd.id);
        if (row.status === 'succeeded') {
          final = row;
          break;
        }
        if (row.status === 'failed' || row.status === 'cancelled') {
          throw new ApiError({
            code: 'RENDER_FAILED',
            messageKey: 'errors.RENDER_FAILED',
            field: null,
            requestId: null,
            status: 500,
          });
        }
        // 250: تمييز `queued` (لم يبدأ العامل) عن `running` (يعمل الآن)
        if (row.status === 'queued') {
          setStepKey('pages.brandKits.editor.export.waitingForWorkerStep');
          if (queuedSince !== null && Date.now() - queuedSince >= POLL_QUEUE_STUCK_MS) {
            throw new ApiError({
              code: 'RENDER_QUEUE_STUCK',
              messageKey: 'errors.RENDER_QUEUE_STUCK',
              field: null,
              requestId: null,
              status: 504,
            });
          }
        } else {
          // انتقل إلى running (أو غيره) — لم يعد queued، نصفّر queuedSince
          queuedSince = null;
          setStepKey('pages.brandKits.editor.export.runningStep');
        }
      }
      if (!final) {
        throw new ApiError({
          code: 'RENDER_TIMEOUT',
          messageKey: 'errors.RENDER_TIMEOUT',
          field: null,
          requestId: null,
          status: 504,
        });
      }
      // 4. output URL.
      setStepKey('pages.brandKits.editor.export.downloadingStep');
      const output = await renders.getOutput(rnd.id);
      // 5. تنزيل — في mock (seed image) نستبدل ببكسلات المعاينة كي يتطابق
      // «ما تراه» مع «ما تُنزِّل». في الإنتاج نجلب URL الخادم كما هو.
      let blob: Blob;
      if (previewCanvasRef?.current && isMockOutputUrl(output.url)) {
        blob = await canvasToBlob(previewCanvasRef.current);
      } else {
        const resp = await fetch(output.url);
        if (!resp.ok) {
          throw new ApiError({
            code: 'EXPORT_DOWNLOAD_FAILED',
            messageKey: 'errors.EXPORT_DOWNLOAD_FAILED',
            field: null,
            requestId: null,
            status: resp.status,
          });
        }
        blob = await resp.blob();
      }
      const objectUrl = URL.createObjectURL(blob);
      const filename = `${brandKitName}-${new Date().toISOString().slice(0, 10)}.png`;
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      // 6. النجاح بعد وصول البلوب.
      setSuccessKey('pages.brandKits.editor.export.success');
      setStepKey(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorKey(err.messageKey);
      } else if (err instanceof TypeError) {
        setErrorKey('errors.NETWORK_ERROR');
      } else {
        setErrorKey('errors.UNKNOWN');
      }
      setStepKey(null);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const isDisabled = busy || disabled;
  const hintTextKey =
    isDisabled && disabledReasonKey ? disabledReasonKey : hintKey;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">{t(hintTextKey)}</p>
          {stepKey && (
            <p className="mt-1 text-xs text-fg-subtle">{t(stepKey)}</p>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={isDisabled}
          onClick={() => void doExport()}
        >
          {busy
            ? t('pages.brandKits.editor.export.busy')
            : t('pages.brandKits.editor.export.button')}
        </Button>
      </div>
      {successKey && (
        <div className="mt-3">
          <Alert kind="success" titleKey={successKey} />
        </div>
      )}
      {errorKey && (
        <div className="mt-3">
          <Alert kind="danger" titleKey={errorKey} />
        </div>
      )}
    </div>
  );
}
