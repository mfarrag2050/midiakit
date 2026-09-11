'use client';

// /dev/pixel-eq?sample=<name> — أداة قياس مؤقّتة (PIXEL-EQ-M).
// تُنشئ canvas بمقاس العيّنة، تنتظر تحميل الخط من /dev/pixel-eq/font/
// (نفس ملف skia)، ثم تستدعي `buildRenderPlan` و`renderFrame`. تُعرض
// النتيجة على window.__pixelEq للـpuppeteer.
//
// **ليست ميزة إنتاج.** لا نصّ للمستخدم — أداة قياس فقط.

import { useEffect, useRef, useState } from 'react';
import {
  applyLocaleToBrand,
  buildRenderPlan,
  renderFrame,
  resolveBrand,
} from '@pf-mediakit/engine';
import type { BrandKit } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

interface SamplePayload {
  brand: { __useDefault?: boolean } | BrandKit;
  template: unknown;
  content: Record<string, unknown>;
  size: { w: number; h: number };
  fontFile: string;
}

declare global {
  interface Window {
    __pixelEq?: {
      status: 'loading' | 'font-ready' | 'drawn' | 'error';
      error?: string;
      plan?: unknown;
      pixels?: string; // base64 من ImageData.data
      pixelLength?: number;
      pixelSample?: number[]; // أوّل 16 قناة للتحقّق البصري السريع
      canvasSize?: { w: number; h: number };
      fontFamilyDeclared?: string;
      fontURL?: string;
      // §PIXEL-EQ-M2 §1 — بصمات المدخلات الأربعة **بعد**
      // applyLocaleToBrand + resolveBrand، **قبل** الرسم.
      fingerprints?: {
        brand: string;
        template: string;
        content: string;
        size: string;
      };
    };
  }
}

// ترتيب مفاتيح مستقرّ للتسلسل — كي تكون البصمة قابلة للمقارنة عبر
// البيئات (JSON.stringify مع مفاتيح مرتَّبة).
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',') + '}';
}

async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8ClampedArray): string {
  // نُخرج base64 من bytes بلا مكتبة جديدة.
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

export default function PixelEqPage(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [msg, setMsg] = useState('init');

  useEffect(() => {
    (async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search);
      const sampleName = params.get('sample') ?? 'preview-default-plain';
      window.__pixelEq = { status: 'loading' };

      // ── 1) جلب العيّنة ─────────────────────────────
      let payload: SamplePayload;
      try {
        const r = await fetch(`/dev/pixel-eq/sample/${encodeURIComponent(sampleName)}`);
        if (!r.ok) throw new Error(`sample fetch failed: ${r.status}`);
        payload = (await r.json()) as SamplePayload;
      } catch (e) {
        window.__pixelEq = { status: 'error', error: (e as Error).message };
        setMsg('sample-error');
        return;
      }

      // ── 2) حقن @font-face بنفس ملفات الخط التي تحمّلها skia ─
      // preview.mjs: brand.fonts.primary.weights.*.url → FontLibrary.use.
      // للـDEFAULT_BRAND الحقول فارغة، يستعمل IBM Plex كتراجع.
      // للـclient-demo الحقول محدّدة (Almarai). نُقلّد نفس السلوك.
      type Weight = { url?: string; value?: number };
      const brandForFont = (payload.brand as { __useDefault?: boolean }).__useDefault
        ? DEFAULT_BRAND
        : (payload.brand as BrandKit);
      const family = brandForFont.fonts.primary.family;
      const weights = brandForFont.fonts.primary.weights as Record<string, Weight>;
      // لكل وزن: إن كانت URL محدَّدة، نستخرج basename ونضعه في route.
      // إن كانت فارغة (DEFAULT_BRAND)، نُقلّد التراجع في preview.mjs:
      // IBM Plex Sans Arabic weights الثلاثة.
      function urlFor(weightUrl: string | undefined, weightKey: 'light' | 'regular' | 'bold'): string {
        if (weightUrl) {
          const base = weightUrl.split('/').pop() ?? '';
          return `/dev/pixel-eq/font/${base}`;
        }
        const fallback: Record<string, string> = {
          light: 'IBMPlexSansArabic-Light.ttf',
          regular: 'IBMPlexSansArabic-Regular.ttf',
          bold: 'IBMPlexSansArabic-Bold.ttf',
        };
        return `/dev/pixel-eq/font/${fallback[weightKey]}`;
      }
      const style = document.createElement('style');
      style.textContent = `
        @font-face { font-family: '${family}'; src: url('${urlFor(weights.regular?.url, 'regular')}') format('truetype'); font-weight: 400; font-display: block; }
        @font-face { font-family: '${family}'; src: url('${urlFor(weights.bold?.url, 'bold')}') format('truetype'); font-weight: 700; font-display: block; }
        @font-face { font-family: '${family}'; src: url('${urlFor(weights.light?.url, 'light')}') format('truetype'); font-weight: 300; font-display: block; }
      `;
      document.head.appendChild(style);

      // ADR-006: لا measureText قبل load الخط.
      await document.fonts.load(`80px "${family}"`);
      await document.fonts.load(`bold 80px "${family}"`);
      await document.fonts.load(`300 80px "${family}"`);
      window.__pixelEq = {
        ...window.__pixelEq,
        status: 'font-ready',
        fontFamilyDeclared: family,
        fontURL: urlFor(weights.regular?.url, 'regular'),
      };
      setMsg('font-ready');

      // ── 3) canvas ─────────────────────────────────
      const canvas = canvasRef.current;
      if (!canvas) {
        window.__pixelEq = { ...window.__pixelEq, status: 'error', error: 'no-canvas-ref' };
        return;
      }
      // dpr = 1 حرفياً — نُلزم CSS pixels = device pixels.
      canvas.width = payload.size.w;
      canvas.height = payload.size.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        window.__pixelEq = { ...window.__pixelEq, status: 'error', error: 'no-2d-context' };
        return;
      }

      // ── 4) brand + template + content — resolveBrand ثم applyLocaleToBrand
      const brandBase = payload.brand && ('__useDefault' in payload.brand ?? false)
        ? DEFAULT_BRAND
        : (payload.brand as BrandKit);
      const brandLocaled = applyLocaleToBrand(
        brandBase,
        (payload.content.locale as 'ar' | 'en' | undefined) ?? 'ar'
      );
      const brand = resolveBrand(brandLocaled);

      // ── 4.5) بصمات المدخلات الأربعة بعد كل التحويلات، قبل أيّ رسم ─
      const [fpBrand, fpTemplate, fpContent, fpSize] = await Promise.all([
        sha256Hex(stableStringify(brand)),
        sha256Hex(stableStringify(payload.template)),
        sha256Hex(stableStringify(payload.content)),
        sha256Hex(stableStringify(payload.size)),
      ]);
      window.__pixelEq = {
        ...window.__pixelEq,
        fingerprints: { brand: fpBrand, template: fpTemplate, content: fpContent, size: fpSize },
      };

      // ── 5) buildRenderPlan — يعرض الخطة قبل الرسم ─
      const plan = buildRenderPlan({
        ctx: ctx as Parameters<typeof buildRenderPlan>[0]['ctx'],
        size: payload.size,
        template: payload.template as Parameters<typeof buildRenderPlan>[0]['template'],
        brand,
        content: payload.content,
      });

      // ── 6) renderFrame — رسم ──
      renderFrame({
        ctx: ctx as Parameters<typeof renderFrame>[0]['ctx'],
        size: payload.size,
        template: payload.template as Parameters<typeof renderFrame>[0]['template'],
        brand,
        content: payload.content,
      });

      // ── 7) استخراج البكسلات ────────────────────────
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const b64 = toBase64(img.data);
      window.__pixelEq = {
        ...window.__pixelEq,
        status: 'drawn',
        plan,
        pixels: b64,
        pixelLength: img.data.length,
        pixelSample: Array.from(img.data.subarray(0, 16)),
        canvasSize: { w: canvas.width, h: canvas.height },
      };
      setMsg('drawn');
    })().catch((e: Error) => {
      window.__pixelEq = { status: 'error', error: e.message };
      setMsg('error: ' + e.message);
    });
  }, []);

  return (
    <div style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
      <div>pixel-eq · status: {msg}</div>
      <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%', border: '1px solid #333' }} />
    </div>
  );
}
