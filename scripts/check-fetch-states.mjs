#!/usr/bin/env node
// check-fetch-states — يحرس «الحالات الثلاث» لكلّ شاشةٍ تجلب من الـAPI.
//
// **٤٧٠ §٣:** الشاشةُ التي تجلب بياناتٍ تدين للمستخدم بثلاثة فروعٍ
// صريحة: انتظارٌ · فراغٌ · خطأ. غيابُ الأخيرَين هو أشدُّ العائلة —
// المستخدم يرى شاشةً بيضاء أو hang بلا رسالة.
//
// **الشرطُ الضيّق (يقلّل الإنذارات الكاذبة):**
//   لكلّ متغيّرٍ مصرَّح كـ`useState<string | null>(null)` واسمُه ينتهي
//   بـ`ErrorKey`، يجب أن يظهر اسمُه في `titleKey={<name>}` أو
//   `titleKey={<name>!}` داخل نفس الملفّ. أي: «إن رصدتَ الخطأ، اعرِضه».
//   هذا يمنع بالضبط عائلةَ «الفشل الصامت» التي جرَدها ٤٢٠ §١ (ج).
//
// **ما لا نفرضه:** وجود `EmptyState` — بعض الشاشات (composers, editors)
// ليست قوائم. حالةُ الفراغ فيها ذاتُ سياقٍ مختلف. جرَدُ ٤٧٠ §١
// الحاليّ يُظهر أنّ كلَّ القوائم الفعليّة تحمل EmptyState — لا فجوةَ
// تحتاج حارساً آليّاً هنا. حين تُضاف قائمةٌ بلا EmptyState سنراها
// في مراجعة كود عيْنيّة (L-16).
//
// **الاستعمال:** `node scripts/check-fetch-states.mjs`
// **الخروج:** 0 نظيف · 1 عند خرقٍ.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCOPE = join(ROOT, 'apps', 'studio');

const SELF_TEST = process.env.SELF_TEST === '1';

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
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
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

function scanFile(src) {
  const clean = stripComments(src);
  const failures = [];

  // ابحث عن كلّ `useState<string | null>(null)` بمتغيّرٍ ينتهي بـErrorKey.
  const declRe =
    /const\s*\[\s*(\w*ErrorKey)\s*,\s*set\w*ErrorKey\s*\]\s*=\s*useState<\s*string\s*\|\s*null\s*>\s*\(\s*null\s*\)/g;
  let m;
  const declared = [];
  while ((m = declRe.exec(clean))) {
    declared.push({ name: m[1], line: lineOf(src, m.index) });
  }

  for (const { name, line } of declared) {
    // ثلاثةُ أنماط عرضٍ مقبولة:
    //   ١) `<X titleKey={<name>[!]}>` — Alert القياسيّة أو Dialog.
    //   ٢) `t(<name>[!])` داخل JSX (نصٌّ مباشر) — بعض الشاشات تفضّل
    //      مربّعاً مخصَّصاً لأن الرسالة تصاحبها فعلٌ خاصّ (ai-settings
    //      §invocation error زرّ إعادة).
    //   ٣) تمريرٌ إلى prop آخر ينتهي بـ`Key` — نادر لكن مقبول.
    // ما دام الاسمُ يظهر داخل تعبيرٍ يُنتج شيئاً على الشاشة، فالحارس يمرّ.
    const patterns = [
      new RegExp(`titleKey\\s*=\\s*\\{[^}]*\\b${name}\\b`),
      new RegExp(`\\bt\\s*\\(\\s*${name}\\b`),
      new RegExp(`\\w+Key\\s*=\\s*\\{[^}]*\\b${name}\\b`),
    ];
    const rendered = patterns.some((p) => p.test(clean));
    if (!rendered) {
      failures.push({ line, name });
    }
  }

  return failures;
}

async function main() {
  const files = await walk(SCOPE);
  const allFails = [];

  for (const f of files) {
    const rel = relative(ROOT, f);
    const src = readFileSync(f, 'utf8');
    const fails = scanFile(src);
    for (const x of fails) {
      allFails.push({ file: rel, ...x });
    }
  }

  if (SELF_TEST) {
    // زرع: صرّح errorKey ثمّ لا ترنده — الحارس يرصد.
    const fake = [
      'const [fetchErrorKey, setFetchErrorKey] = useState<string | null>(null);',
      'return <div>Hello</div>;',
    ].join('\n');
    const fails = scanFile(fake);
    if (fails.length !== 1) {
      console.error(`  ✗ self-test: توقّعتُ خرقاً واحداً، وجدتُ ${fails.length}`);
      process.exit(2);
    }
    // زرع مضاد: صرّح ثمّ ارنده — الحارس يمرّ.
    const fakeOk = [
      'const [fetchErrorKey, setFetchErrorKey] = useState<string | null>(null);',
      'return <Alert titleKey={fetchErrorKey!} />;',
    ].join('\n');
    const okFails = scanFile(fakeOk);
    if (okFails.length !== 0) {
      console.error(`  ✗ self-test: توقّعتُ صفر خرق، وجدتُ ${okFails.length}`);
      process.exit(2);
    }
    console.log('  ✓ self-test: الحارس يرصد الصامتَ ويمرّ على المُرنَد');
  }

  if (allFails.length > 0) {
    console.error(
      `check:fetch-states ✗ — ${allFails.length} حالة فشلٍ صامتة:`
    );
    for (const f of allFails) {
      console.error(`  ${f.file}:${f.line} · ${f.name} مصرَّحٌ لكن لا يُرنَد في <Alert titleKey={${f.name}}>`);
    }
    console.error(
      '\n  القاعدة (٤٧٠ §٣): كلُّ حالةِ خطأٍ ترصدها يجب أن تُعرَض للمستخدم.\n' +
        '  الإصلاح: أضف `<Alert kind="danger" titleKey={' +
        allFails[0].name + '} />` في JSX،\n' +
        '  أو أعِد نظرَك في وجود الـstate أصلاً إن كان يُتَجاهَل عمداً.'
    );
    process.exit(1);
  }

  console.log(`check:fetch-states ✓ — ${files.length} ملفّاً، لا فشلَ صامتاً.`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
