'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Card } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { createDebouncedScheduler, drawPreview } from '@/src/preview/live';

// LiveCardPreview — نفس آليّة `140-LIVE-CARD-PREVIEW` مغلَّفة في مكوّن
// واحد. يستعمله محرّر الهويّة (`brand-kits/[id]/edit`) والمؤلّف
// (`/breaking`) بلا نسخ ثانية للحالة أو الجدولة (قاعدة `160` §١).
//
// المكوّن يمتلك:
//   - canvas ref
//   - جدولة debounced (250ms افتراضاً)
//   - حالة durationMs + warning (i18n key)
//   - يستدعي `drawPreview` عند كلّ تغيّر لأيّ من (template · brand · content · size)
//
// المكوّن **لا يمتلك**:
//   - جلب الهويّة أو القالب أو المحتوى — كلّها props من الأب
//   - أيّ حالة `patch`/`save` — الأب مسؤول

export interface LiveCardPreviewProps {
  readonly template: unknown;
  readonly brandConfig: unknown;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size?: { readonly w: number; readonly h: number };
  readonly debounceMs?: number;
  /** يظهر أسفل canvas — مكان للأزرار كزرّ التصدير. */
  readonly children?: ReactNode;
}

const DEFAULT_SIZE = { w: 1080, h: 1350 } as const;

export function LiveCardPreview({
  template,
  brandConfig,
  content,
  size = DEFAULT_SIZE,
  debounceMs = 250,
  children,
}: LiveCardPreviewProps): JSX.Element {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scheduler = useRef(createDebouncedScheduler(debounceMs));
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
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
          setDurationMs(res.durationMs);
          setWarning(res.warning ?? null);
        } catch (err) {
          setWarning(
            err instanceof Error ? err.message : 'errors.PREVIEW_UNKNOWN'
          );
        }
      })();
    });
    return (): void => scheduler.current.cancel();
  }, [template, brandConfig, content, size]);

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">
          {t('pages.brandKits.editor.preview.title')}
        </h2>
        {durationMs !== null && (
          <span
            className="font-mono text-xs text-fg-subtle"
            dir="ltr"
            title={t('pages.brandKits.editor.preview.durationHint')}
          >
            {durationMs.toFixed(0)}ms
          </span>
        )}
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
        className="mx-auto"
        style={{ maxWidth: '360px', aspectRatio: '1080 / 1350' }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded border border-fg-subtle/20 bg-surface-2"
          style={{ display: 'block' }}
        />
      </div>
      {children && (
        <div className="mt-4 border-t border-fg-subtle/10 pt-4">{children}</div>
      )}
    </Card>
  );
}
