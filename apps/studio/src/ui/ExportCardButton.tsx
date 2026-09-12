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
      setStepKey('pages.brandKits.editor.export.runningStep');
      // 3. استطلع.
      let final: Awaited<ReturnType<typeof renders.get>> | null = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
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
