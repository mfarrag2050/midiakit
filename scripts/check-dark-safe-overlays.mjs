#!/usr/bin/env node
// check-dark-safe-overlays — يمنع القيمَ الضوئيّةَ الحرفيّة (#fff ·
// rgba(255,255,255,*) · bg-white) داخل خلفياتٍ مركّبة (linear-gradient
// · radial-gradient · مواضع overlay ثابتة) في تطبيقٍ ذي وضعٍ داكن
// مفروض (`color-scheme: dark` في `packages/ui/styles/tokens.css`).
//
// **٤٥٠ §٣ · العائلة:** ٤١٠ §٣ استعمل `#fff` كقناعٍ لتدرّج Roman
// Komarov فوق جدولٍ داكن، فمحا عمودَ «القالب» بدل أن يلمّح إلى تمرير.
// العطبُ عائلةٌ لا مفرد: أيّ قيمة ضوءٍ حرفيّةٍ داخل تراكبٍ في هذا
// المنتَج تفترض وضعاً فاتحاً غيرَ موجود.
//
// **ما يفحصه:**
//   ١) داخل `linear-gradient(…)` / `radial-gradient(…)` — أيُّ:
//      `#fff` · `#ffffff` · `rgba(255,` · `rgb(255,255,255)`
//   ٢) `className` يحوي `bg-white` أو `from-white`/`to-white`/`via-white`
//      داخل عنصرٍ overlay (فيه `absolute`/`fixed`/`inset-0`) — استثناء
//      عناصر `<img>` (شعارُ الوكالة يُعرَض على أبيض عمداً · معلَّل).
//
// **الاستثناءات المصرَّحة:**
//   · `packages/ui/src/Table.tsx` — سطر ٤٥٠ §١ ذكرَ `#fff` في تعليقٍ
//     (شرحاً للتاريخ). يُتَجاهَل التعليقُ.
//   · `apps/studio/src/api/mock.ts` — قيم `#FFFFFF` داخل تعريف هويّةٍ
//     تجريبيّةٍ بيضاء (test brand kit) لا تُرندَر إلى الواجهة.
//   · شعارُ الوكالة `<img>` مع `bg-white` — قرارُ تصميمٍ يعرض الشعار
//     كما سيُطبع على مادّةٍ بيضاء.
//
// **الاستعمال:**
//   node scripts/check-dark-safe-overlays.mjs [--strict]
//
// **الخروج:** 0 نظيف · 1 عند خرقٍ (مع `--strict`).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCOPES = [
  join(ROOT, 'apps', 'studio', 'app'),
  join(ROOT, 'apps', 'studio', 'src'),
  join(ROOT, 'packages', 'ui', 'src'),
];

const SELF_TEST = process.env.SELF_TEST === '1';

// استثناءات المسار: ملفّاتٌ لا نفحصها.
const PATH_ALLOW = [
  'apps/studio/src/api/mock.ts', // هويّات تجريبيّة
];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(tsx?|css)$/.test(e)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (_, pre) => pre);
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

function scanFile(rel, src) {
  const clean = stripComments(src);
  const hits = [];

  // (١) داخل التدرّجات: أبحث عن نمطٍ متعدّد الأسطر (?:linear|radial)-gradient(...).
  const gradRe = /(linear|radial)-gradient\s*\(([^)]{0,600})\)/g;
  let m;
  while ((m = gradRe.exec(clean))) {
    const body = m[2];
    const has =
      /#fff\b/i.test(body) ||
      /#ffffff\b/i.test(body) ||
      /rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(body) ||
      /rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i.test(body);
    if (has) {
      hits.push({
        rule: 'gradient-hardcoded-white',
        line: lineOf(src, m.index),
        snippet: m[0].replace(/\s+/g, ' ').slice(0, 120),
      });
    }
  }

  // (٢) className overlay: `absolute` أو `fixed` أو `inset-0` مع `bg-white`
  //     أو `from-white`/`to-white`/`via-white`. نستثني عناصر <img>.
  const jsxRe = /<(\w+)\b([^>]{0,500})>/g;
  while ((m = jsxRe.exec(clean))) {
    const tag = m[1];
    const attrs = m[2];
    if (tag === 'img') continue;
    const clsMatch = attrs.match(/className\s*=\s*(?:"([^"]+)"|\{[^}]*"([^"]+)"[^}]*\})/);
    if (!clsMatch) continue;
    const cls = clsMatch[1] ?? clsMatch[2] ?? '';
    const isOverlay = /\b(absolute|fixed|inset-0)\b/.test(cls);
    if (!isOverlay) continue;
    if (
      /\bbg-white(\/\d+)?\b/.test(cls) ||
      /\b(from|to|via)-white(\/\d+)?\b/.test(cls)
    ) {
      hits.push({
        rule: 'overlay-hardcoded-white',
        line: lineOf(src, m.index),
        snippet: cls.slice(0, 120),
      });
    }
  }

  return hits;
}

async function main() {
  const files = [];
  for (const s of SCOPES) files.push(...(await walk(s)));

  const failures = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (PATH_ALLOW.includes(rel)) continue;
    const src = readFileSync(f, 'utf8');
    const hits = scanFile(rel, src);
    for (const h of hits) {
      failures.push({ file: rel, ...h });
    }
  }

  if (SELF_TEST) {
    // زرعُ حرفيّةٍ داخل تدرّجٍ في نصٍّ اختباريٍّ ونتحقّق أنّ الحارس يرصده.
    const fake = 'style={{background:"linear-gradient(to right, #fff, transparent)"}}';
    const hits = scanFile('__self__', fake);
    if (hits.length !== 1) {
      console.error(`  ✗ self-test: توقّعت خرقاً واحداً، وجدتُ ${hits.length}`);
      process.exit(2);
    }
    console.log('  ✓ self-test: الحارس رصد التدرّج المزروع');
  }

  if (failures.length > 0) {
    console.error(
      `check:dark-safe-overlays ✗ — ${failures.length} خرقاً (وضعٌ داكنٌ مفروض):`
    );
    for (const f of failures) {
      console.error(`  ${f.file}:${f.line} · ${f.rule}`);
      console.error(`    ${f.snippet}`);
    }
    console.error(
      '\n  القاعدة: التطبيقُ ذو `color-scheme: dark` (packages/ui/styles/tokens.css).' +
        ' القيمُ الضوئيّةُ الحرفيّة (#fff · rgba(255,...) · bg-white على overlay) تفترض ' +
        'وضعاً فاتحاً غير موجود، فتمحو ما تحتها.' +
        '\n  الإصلاح: استعمل `var(--surface)`/`var(--bg)` بدل الحرفيّة.'
    );
    process.exit(1);
  }

  console.log(
    `check:dark-safe-overlays ✓ — ${files.length} ملفّاً، لا خرق.`
  );
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
