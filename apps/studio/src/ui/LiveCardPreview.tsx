'use client';

import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Card } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { createDebouncedScheduler, drawPreview } from '@/src/preview/live';

// LiveCardPreview — نفس آليّة `140-LIVE-CARD-PREVIEW` مغلَّفة في مكوّن
// واحد. يستعمله محرّر الهويّة (`brand-kits/[id]/edit`) والمؤلّف
// (`/breaking`) بلا نسخ ثانية للحالة أو الجدولة (قاعدة `160` §١).
//
// المكوّن يمتلك:
//   - canvas ref (داخليّ إن لم يمرِّر الأب `canvasRef`)
//   - جدولة debounced (250ms افتراضاً)
//   - حالة warning + تمييز الحالة الفارغة عن الفشل
//   - يستدعي `drawPreview` عند كلّ تغيّر لأيّ من (template · brand · content · size)
//
// المكوّن **لا يمتلك**:
//   - جلب الهويّة أو القالب أو المحتوى — كلّها props من الأب
//   - أيّ حالة `patch`/`save` — الأب مسؤول
//
// **200-DEMO-FIX-2 §1·١**: قبل هذا الإصلاح، content فارغ ⇒ drawPreview
// يرمي، والالتقاط يعرض «تعذّرت المعاينة» كأنّ الأداة مكسورة. الآن نميّز
// الحالة الفارغة صراحةً ونعرض تلميحاً هادئاً بدل تنبيه أصفر.

export interface LiveCardPreviewProps {
  readonly template: unknown;
  readonly brandConfig: unknown;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size?: { readonly w: number; readonly h: number };
  readonly debounceMs?: number;
  /** يظهر أسفل canvas — مكان للأزرار كزرّ التصدير. */
  readonly children?: ReactNode;
  /** حين يمرّره الأب، نُلحقه بالـcanvas الداخليّ. يُتيح لـ`ExportCardButton`
   *  قراءة بكسلات المعاينة مباشرةً (200-DEMO-FIX-2 §1·٢). */
  readonly canvasRef?: RefObject<HTMLCanvasElement>;
}

const DEFAULT_SIZE = { w: 1080, h: 1350 } as const;

function isContentEmpty(content: Readonly<Record<string, unknown>>): boolean {
  const headline = content?.['headline'];
  if (typeof headline !== 'string') return true;
  return headline.trim().length === 0;
}

export function LiveCardPreview({
  template,
  brandConfig,
  content,
  size = DEFAULT_SIZE,
  debounceMs = 250,
  children,
  canvasRef: externalRef,
}: LiveCardPreviewProps): JSX.Element {
  const { t } = useLocale();
  const internalRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalRef ?? internalRef;
  const scheduler = useRef(createDebouncedScheduler(debounceMs));
  const [warning, setWarning] = useState<string | null>(null);
  const empty = isContentEmpty(content);

  useEffect(() => {
    // الحالة الفارغة ليست فشلاً — نُنظّف الـcanvas ولا نستدعي المحرّك.
    if (empty) {
      setWarning(null);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = size.w;
        canvas.height = size.h;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    scheduler.current.schedule(() => {
      void (async (): Promise<void> => {
        try {
          const res = await drawPreview(canvas, {
            template: template as Parameters<typeof drawPreview>[1]['template'],
            brandConfig,
            content,
            size,
          });
          setWarning(res.warning ?? null);
        } catch (err) {
          setWarning(
            err instanceof Error ? err.message : 'errors.PREVIEW_UNKNOWN'
          );
        }
      })();
    });
    return (): void => scheduler.current.cancel();
  }, [template, brandConfig, content, size, empty, canvasRef]);

  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">
          {t('pages.brandKits.editor.preview.title')}
        </h2>
      </div>
      <p className="mb-3 text-xs text-fg-subtle">
        {t('pages.brandKits.editor.preview.subtitle')}
      </p>
      {warning && (
        <div className="mb-3">
          <Alert kind="warning" titleKey={warning} />
        </div>
      )}
      <div
        className="relative mx-auto"
        style={{ maxWidth: '360px', aspectRatio: '1080 / 1350' }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded border border-fg-subtle/20 bg-surface-2"
          style={{ display: 'block' }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border border-dashed border-fg-subtle/30">
            <p className="max-w-[80%] text-center text-sm text-fg-muted">
              {t('pages.brandKits.editor.preview.emptyHint')}
            </p>
          </div>
        )}
      </div>
      {children && (
        <div className="mt-4 border-t border-fg-subtle/10 pt-4">{children}</div>
      )}
    </Card>
  );
}
