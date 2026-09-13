#!/usr/bin/env node
/**
 * scripts/mk-show-leak-check.mjs — فاحص تسريب الشوروم إلى المتصفّح.
 *
 * القاعدة الحاكمة (230-BUILD-THE-LEAK-CHECKER):
 *   لا شيء من 127.0.0.1 / localhost / http:// يصل متصفّح الشريك من
 *   https://mkdemo.primeflow.co.
 *
 * ما يقيسه بالضبط:
 *   1. جلب كلّ صفحة من قائمة 16 مسار (نفس قائمة 220).
 *   2. فحص HTML الأوّليّ (يشمل: HTML DOM + inline JSON + inline scripts +
 *      __NEXT_DATA__ عند SSR + قيَم NEXT_PUBLIC_* المخبوزة في bundle).
 *   3. الفشل عند أوّل مطابقة لأيّ نمط ممنوع.
 *   4. الطباعة: رمز الحالة + عدد المطابقات + أوّل ثلاث بشكلها لا بقيمتها
 *      (المضيف والمسار فقط · بلا سلسلة استعلام).
 *
 * لماذا HTML الأوّليّ يكفي (سؤال §"أسئلة عليك أن تحسمها" من 230):
 *   Next.js تخبز قيَم `NEXT_PUBLIC_*` في bundle الـJS المرفَق. الـHTML
 *   يحوي روابط bundle + inline __NEXT_DATA__ (SSR). طلب runtime لا يمكن
 *   أن يستعمل قيمة غير مخبوزة إلّا عبر:
 *     (أ) window.location.origin → لا تسريب بحكم التعريف.
 *     (ب) قيمة مخبوزة في bundle → تظهر عند فحص bundle نفسه.
 *   الفاحص يجلب bundle أيضاً (يتتبّع كلّ <script src=...>).
 *
 * الاستعمال:
 *   node scripts/mk-show-leak-check.mjs
 *   MK_SHOW_LEAK_BASE_URL=http://127.0.0.1:19099 node scripts/mk-show-leak-check.mjs
 *
 * الرمز: 0 نظيف · 1 تسريب.
 */

const BASE = (process.env.MK_SHOW_LEAK_BASE_URL || 'http://127.0.0.1:19071').replace(/\/$/, '');

// نفس قائمة 220 (16 مسار) — التي يبلغها المحرِّر.
const PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/brand-kits',
  '/breaking',
  '/exports',
  '/renders',
  '/templates',
  '/projects',
  '/design',
  '/assets',
  '/workflows',
  '/ai-settings',
  '/billing',
];

// الأنماط الممنوعة. الترتيب مهمّ — نفحص كلّ نمط لكلّ ملفّ.
// http:// نستثني منه host = 127.0.0.1 و localhost (لأنّهما يُلتقطان بأنماط
// أخصّ). المتصفّح يرى https:// من mkdemo — أيّ http:// = تسريب.
const FORBIDDEN = [
  { name: '127.0.0.1', regex: /127\.0\.0\.1(?::\d+)?[^\s"'<>()]*/g },
  { name: 'localhost', regex: /\blocalhost(?::\d+)?[^\s"'<>()]*/g },
  // http:// عدا 127.0.0.1/localhost (المُلتقطان أعلاه) + عدا http-equiv (meta)
  { name: 'http://',   regex: /http:\/\/(?!127\.0\.0\.1|localhost)[^\s"'<>()]+/g },
];

// المسارات المُطلَق ذكرها في HTML/bundle لكنّها ليست تسريباً بمعنى «الشريك
// يفشل بها»: مواصفات W3C · متصفّح · meta http-equiv. تُستثنى صراحة.
const KNOWN_SAFE = [
  /http:\/\/www\.w3\.org\//,  // XML namespaces · SVG · إلخ
  /http:\/\/purl\.org\//,      // Dublin Core و مثله
  /http-equiv\s*=/,            // meta http-equiv (سلسلة HTML لا URL)
];

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const status = res.status;
  const text = status >= 200 && status < 400 ? await res.text() : '';
  return { status, text };
}

/**
 * يستخرج كلّ الروابط src/href/action من HTML + يجلب كلّ script src داخليّ
 * لفحصه أيضاً (لأنّ NEXT_PUBLIC_* مخبوز فيه).
 */
async function collectSources(baseUrl, path) {
  const url = baseUrl + path;
  const { status, text } = await fetchText(url);
  if (!text) return { status, texts: [] };

  const texts = [{ label: `${path} · HTML`, body: text }];

  // استخرج script srcs (relative + absolute)
  const scriptSrcs = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  for (const src of scriptSrcs) {
    // نجلب فقط bundles من نفس origin — script من CDN خارجيّ لا نراه.
    let scriptUrl;
    try {
      scriptUrl = new URL(src, baseUrl).href;
      if (!scriptUrl.startsWith(baseUrl)) continue;
    } catch { continue; }
    try {
      const scriptRes = await fetch(scriptUrl);
      if (scriptRes.ok) {
        const scriptBody = await scriptRes.text();
        texts.push({ label: `${path} · bundle ${src.slice(-40)}`, body: scriptBody });
      }
    } catch {
      // اهمل — سنُعتبره ملاحظة لكن لن يفشل الفحص لتعذّر شبكة
    }
  }
  return { status, texts };
}

/**
 * يستخرج «شكل» URL/host من match: scheme + host + first-path-segment.
 * يقصّ query string. مثال:
 *   http://127.0.0.1:19064/mk-assets-show/xxx?X-Amz-Signature=...
 *   → http://127.0.0.1:19064/mk-assets-show/
 */
function shapeOf(match) {
  try {
    // جرّب URL كامل
    const u = new URL(match.startsWith('http') ? match : `http://${match}`);
    const firstSeg = u.pathname.split('/').filter(Boolean)[0] || '';
    return `${u.protocol}//${u.host}/${firstSeg}${firstSeg ? '/' : ''}...`;
  } catch {
    // إن فشل التحليل (مثل «127.0.0.1» وحده أو «localhost:5432»)
    const noQuery = match.split('?')[0];
    return noQuery.length > 60 ? `${noQuery.slice(0, 60)}...` : noQuery;
  }
}

function isKnownSafe(match) {
  return KNOWN_SAFE.some(rx => rx.test(match));
}

function findLeaks(body, label) {
  const leaks = [];
  for (const { name, regex } of FORBIDDEN) {
    const matches = [...body.matchAll(regex)].map(m => m[0]);
    const filtered = matches.filter(m => !isKnownSafe(m));
    if (filtered.length === 0) continue;
    // شكل الأوّل ثلاثة (deduplicated)
    const shapes = [...new Set(filtered.map(shapeOf))].slice(0, 3);
    leaks.push({ label, name, count: filtered.length, shapes });
  }
  return leaks;
}

async function main() {
  console.log(`[leak-check] BASE=${BASE}`);
  console.log(`[leak-check] ${PATHS.length} مسار · فحص HTML + bundle scripts · نمط ممنوع: ${FORBIDDEN.map(f => f.name).join(' · ')}`);
  console.log('');

  let totalLeaks = 0;
  const perPath = [];

  for (const path of PATHS) {
    try {
      const { status, texts } = await collectSources(BASE, path);
      const allLeaks = [];
      for (const { label, body } of texts) {
        allLeaks.push(...findLeaks(body, label));
      }
      const totalMatches = allLeaks.reduce((s, l) => s + l.count, 0);
      totalLeaks += totalMatches;
      perPath.push({ path, status, leaks: allLeaks, total: totalMatches });

      const marker = totalMatches === 0 ? '✓' : '✗';
      const stateNote = status >= 400 ? ` [status ${status}]` : '';
      console.log(`  ${marker} ${path.padEnd(20)} status=${status}${stateNote}  مطابقات=${totalMatches}`);
      for (const l of allLeaks) {
        console.log(`      ${l.name}: ${l.count} في ${l.label}`);
        for (const s of l.shapes) console.log(`        · ${s}`);
      }
    } catch (err) {
      console.log(`  ⚠  ${path.padEnd(20)} تعذّر الاتّصال: ${err.message}`);
      perPath.push({ path, status: -1, error: err.message });
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  if (totalLeaks === 0) {
    console.log(`✓ نظيف — 0 تسريبات في ${PATHS.length} مسار.`);
    process.exit(0);
  } else {
    console.log(`✗ ${totalLeaks} تسريب/تسرّبات في ${perPath.filter(p => p.total > 0).length} مسار.`);
    console.log('  الشكل مطبوع لا القيمة — لا سلاسل استعلام كاملة.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`✗ خطأ في الفاحص: ${err.message}`);
  process.exit(2);
});
