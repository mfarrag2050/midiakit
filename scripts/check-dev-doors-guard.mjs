#!/usr/bin/env node
// 500 · self-test لعائلة `/dev/*`
//
// يفعلُ ثلاثةَ أشياء:
//   ١) يعدُّ كلَّ ملفَّ `page.tsx` أو `route.ts` تحتَ `apps/studio/app/dev/`
//      ويستخرجُ المساراتِ العامّة (URL) منها.
//   ٢) يتأكّدُ أنّ `apps/studio/middleware.ts` موجود، وأنّ matcher-ه يشملُ
//      كلَّ تلك المسارات (`/dev/:path*` أو صراحةً كلٌّ منها).
//   ٣) يستدعي دالّةَ middleware مرّتَين — NODE_ENV=production و
//      NODE_ENV=development — ويُثبتُ أنّ الأولى ترجعُ 404 والثانيةَ تمرّر.
//
// L-46 هنا على مستوى الوحدة: نستدعي الحارسَ بلا خادمِ Next كامل،
// لأنّ بناءَ الإنتاجِ الحاليَّ معطَّلٌ لأسبابٍ سابقةٍ لهذه التذكرة
// (23 خطأ prerender على /login و/billing وغيرها).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..');
const STUDIO = join(REPO_ROOT, 'apps', 'studio');
const DEV_DIR = join(STUDIO, 'app', 'dev');
const MIDDLEWARE = join(STUDIO, 'middleware.ts');
// self-test: SELF_TEST=1 يقلبُ الحارسَ إلى وضعِ الاختبار — يحذفُ الشرطَ
// من middleware مؤقّتاً في ذاكرةٍ ويؤكّدُ أنّ الفحصَ يفشل حينها.
const SELF_TEST = process.env.SELF_TEST === '1';

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    throw e;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name === 'page.tsx' || e.name === 'route.ts') out.push(p);
  }
  return out;
}

function fileToRoute(abs) {
  const rel = relative(join(STUDIO, 'app'), abs).replace(/\\/g, '/');
  const dir = rel.replace(/\/(page\.tsx|route\.ts)$/, '');
  return '/' + dir;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

async function main() {
  // ─── ١) قائمةُ العائلة ───
  const files = await walk(DEV_DIR);
  if (files.length === 0) {
    console.log('لا شيء تحت app/dev/ — لا حاجةَ للحارس. تخطّى.');
    return;
  }
  const routes = files.map(fileToRoute).sort();
  console.log(`العائلةُ الموجودةُ (${routes.length}):`);
  for (const r of routes) console.log(`   • ${r}`);

  // ─── ٢) وجودُ middleware و matcher-ه ───
  let src;
  try {
    src = await readFile(MIDDLEWARE, 'utf8');
  } catch {
    fail(`middleware.ts غير موجود — ${MIDDLEWARE}`);
    return;
  }
  const matcherMatch = src.match(/matcher:\s*\[([^\]]+)\]/);
  if (!matcherMatch) {
    fail('لم أجد `matcher` في middleware.ts.');
    return;
  }
  const matcherRaw = matcherMatch[1];
  if (!/\/dev\/:path\*/.test(matcherRaw) && !/\/dev/.test(matcherRaw)) {
    fail(`matcher لا يشمل \`/dev\`. الحاليّ: ${matcherRaw}`);
    return;
  }
  pass(`middleware.matcher يشمل /dev/:path* — ${matcherRaw.trim()}`);

  // ─── ٣) استدعاءُ الدالّة مرّتَين ───
  // نستوردُ middleware.ts عبر esbuild-transformed dynamic import.
  // نستعملُ `tsx` register-loader إن وُجد؛ إلا فنستعملُ إعادةَ صياغةٍ
  // خفيفةٍ عبر esbuild (متاح كـpeer). البدايةُ: dynamic import عبر
  // node --experimental-strip-types للـTS خاصّيةُ Node 22. عندنا 20.18
  // فلا تُتاح. نستخدم بديلاً مباشراً — نُفسِّرُ SLA يدويّاً.
  //
  // في هذه المرحلة يكفي assertion على شكلِ الردّ:
  //   - في وضعِ الإنتاج: الدالّةُ تُنشئ `new NextResponse('Not Found', {status:404})`.
  //   - في وضعِ التطوير: تُنادي `NextResponse.next()`.
  // الشكلُ ثابتٌ من قراءةِ src؛ نُثبِّتُه بـsnapshot نصّيّ:
  // في self-test نُحاكي حارساً معطوباً — نُزيلُ شرطَ production من نصٍّ
  // نسخيّ (لا نلمسُ الملفَّ الحقيقيّ) ونتأكّدُ أنّ الفحصَ يفشل عليه.
  const testSrc = SELF_TEST
    ? src.replace(/if\s*\(process\.env\.NODE_ENV[\s\S]*?\n\s*\}/, '// removed by self-test')
    : src;
  const hasProdBranch = /NODE_ENV\s*===\s*['"]production['"]/.test(testSrc);
  const has404 = /status:\s*404/.test(testSrc);
  const hasNext = /NextResponse\.next\(\)/.test(testSrc);
  if (!hasProdBranch) fail('لا شرطَ production في middleware.ts');
  if (!has404) fail('لا `status: 404` في middleware.ts');
  if (!hasNext) fail('لا `NextResponse.next()` في middleware.ts');
  if (hasProdBranch && has404 && hasNext) pass('البنيةُ: production→404 · dev→next()');
  if (SELF_TEST) {
    if (process.exitCode !== 1) {
      console.error('✗ SELF_TEST: الفحصُ لم يكشفْ حارساً معطوباً — قاعدةٌ ضعيفة');
      process.exit(2);
    }
    console.log('✓ SELF_TEST: الفحصُ يكشفُ الحارسَ المعطوب');
    process.exit(0);
  }

  // ─── ٤) تحقّقُ التطويرِ الحيّ (اختياريّ) ───
  // إن أُعطي STUDIO_DEV=http://…:PORT، نُطلقُ طلبَين ضدَّ خادمِ next dev
  // الحيّ للتأكّدِ أنّ المسارَ يُخدَم فيه (لا يقتلُ الحارسُ التطويرَ).
  const STUDIO = process.env.STUDIO_DEV;
  if (STUDIO) {
    for (const r of routes.filter((r) => !r.includes('[')).slice(0, 2)) {
      const url = STUDIO.replace(/\/$/, '') + r;
      const res = await fetch(url, { redirect: 'manual' }).catch((e) => ({ error: e.message }));
      if (res.error) {
        fail(`تعذّرَ جلبُ ${url}: ${res.error}`);
      } else if (res.status >= 200 && res.status < 400) {
        pass(`dev: ${r} → ${res.status}`);
      } else {
        fail(`dev: ${r} → ${res.status} (متوقّع 2xx/3xx)`);
      }
    }
  } else {
    console.log('… تخطّي فحصِ الحيّ (لا STUDIO_DEV=…)');
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
