'use client';

// /dev/font-check — تشخيص FONT-1 + مِرْقاب المعاينة الحقيقيّة.
// يستدعي `drawPreview` من apps/studio/src/preview/live.ts (المسار
// الحقيقي للمنتج) على عيّنة من /dev/pixel-eq/sample/[name]، ثم يُبلّغ:
//   - document.fonts.check / families
//   - measureText قبل/بعد
//   - base64 pixels على window.__fontCheck.pixels (لِمِرْقاب M3)
//
// **ليست ميزة إنتاج.** أداة تشخيص. تبقى تحت /dev/ خارج الملاحة.

import { useEffect, useRef, useState } from 'react';
import { drawPreview } from '../../../src/preview/live';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

interface SamplePayload {
  brand: { __useDefault?: boolean } | Record<string, unknown>;
  template: unknown;
  content: Record<string, unknown>;
  size: { w: number; h: number };
}

declare global {
  interface Window {
    __fontCheck?: {
      status: string;
      error?: string;
      checkBefore?: boolean;
      checkAfter?: boolean;
      familiesBefore?: string[];
      familiesAfter?: string[];
      measureBefore?: { width: number; asc: number; desc: number };
      measureAfter?: { width: number; asc: number; desc: number };
      drawResult?: unknown;
      pixels?: string;
      canvasSize?: { w: number; h: number };
    };
  }
}

function toBase64(bytes: Uint8ClampedArray): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))) as number[]
    );
  }
  return btoa(bin);
}

export default function FontCheckPage(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [msg, setMsg] = useState('init');

  useEffect(() => {
    (async (): Promise<void> => {
      window.__fontCheck = { status: 'loading' };
      const params = new URLSearchParams(window.location.search);
      const sampleName = params.get('sample') ?? 'preview-client-demo';
      const family = params.get('family') ?? 'Almarai';

      // قبل drawPreview: ما حال document.fonts؟
      const checkBefore = document.fonts.check(`80px "${family}"`);
      const familiesBefore = Array.from(document.fonts).map((f) => `${f.family}/${f.weight}/${f.status}`);
      const c0 = document.createElement('canvas');
      c0.width = 200; c0.height = 200;
      const ctx0 = c0.getContext('2d')!;
      ctx0.font = `bold 80px "${family}"`;
      const m0 = ctx0.measureText('ارتفاع');
      const measureBefore = {
        width: m0.width, asc: m0.actualBoundingBoxAscent, desc: m0.actualBoundingBoxDescent,
      };
      window.__fontCheck = { ...window.__fontCheck, checkBefore, familiesBefore, measureBefore, status: 'before-captured' };
      setMsg('before-captured');

      const canvas = canvasRef.current;
      if (!canvas) {
        window.__fontCheck = { ...window.__fontCheck, status: 'error', error: 'no-canvas-ref' };
        return;
      }

      // جلب العيّنة من نفس مسار pixel-eq — نفس المدخلات.
      const r = await fetch(`/dev/pixel-eq/sample/${encodeURIComponent(sampleName)}`);
      const payload = (await r.json()) as SamplePayload;
      const brandConfig = (payload.brand as { __useDefault?: boolean }).__useDefault
        ? DEFAULT_BRAND
        : (payload.brand as Record<string, unknown>);

      // استدعاء drawPreview كما تفعل صفحة المشروع الحقيقية.
      const res = await drawPreview(canvas, {
        template: payload.template,
        brandConfig,
        content: payload.content,
        size: payload.size,
      });

      // بعد drawPreview: هل تغيّر شيء؟
      const checkAfter = document.fonts.check(`80px "${family}"`);
      const familiesAfter = Array.from(document.fonts).map((f) => `${f.family}/${f.weight}/${f.status}`);
      const c1 = document.createElement('canvas');
      c1.width = 200; c1.height = 200;
      const ctx1 = c1.getContext('2d')!;
      ctx1.font = `bold 80px "${family}"`;
      const m1 = ctx1.measureText('ارتفاع');
      const measureAfter = {
        width: m1.width, asc: m1.actualBoundingBoxAscent, desc: m1.actualBoundingBoxDescent,
      };

      // pixel export
      const ctx = canvas.getContext('2d')!;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      window.__fontCheck = {
        ...window.__fontCheck,
        status: 'drawn',
        checkAfter, familiesAfter, measureAfter,
        drawResult: res,
        pixels: toBase64(img.data),
        canvasSize: { w: canvas.width, h: canvas.height },
      };
      setMsg('drawn');
    })().catch((e: Error) => {
      window.__fontCheck = { ...(window.__fontCheck ?? { status: 'init' }), status: 'error', error: e.message };
      setMsg('error: ' + e.message);
    });
  }, []);

  return (
    <div style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
      <div>font-check · status: {msg}</div>
      <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%', border: '1px solid #333' }} />
    </div>
  );
}
