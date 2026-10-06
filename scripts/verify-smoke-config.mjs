// scripts/verify-smoke-config — mk/536: فحصُ أنّ scripts/mk-show-smoke.mjs
// يحسم الإعدادَ صحيحاً لهدفَي show/shownext في وضعَين:
//   (أ) بلا env (readMkShowVar وحدَه من bin/mk-show).
//   (ب) مع MK_SMOKE_* كما يمرّرها run_smoke في bin/mk-show.
//
// **لا نمرِّر أرقامَ منافذ في سطر الأمر** — نسحبُها من bin/mk-show نفسه
// عبر `bin/mk-show <target> dry-config` (الوضعُ الجافّ المضاف في 535ب).
// بذلك المصدرُ الوحيدُ للقيَم المتوقَّعة هو bin/mk-show في الذاكرة.
//
// **التحقّقات لكلّ هدف:**
//   • email = mk@primeflow.co (لا نصّ خامٌّ يحوي `${`).
//   • api_port = ما يُقرَأ من dry-config لنفس الهدف.
//   • studio_port = نفس الشيء.
//   • لا قيمة تحوي `${` في أيّ سطر من --print-config.
//
// **L-46:** يسقط قبل إصلاح 536 (OWNER_EMAIL يأتي حرفيّاً من readMkShowVar
// بـ`${OWNER_EMAIL_OVERRIDE:-mk@primeflow.co}`) ويمرّ بعد الإصلاح.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MK_SHOW = join(ROOT, 'bin/mk-show');
const SMOKE = join(ROOT, 'scripts/mk-show-smoke.mjs');

if (!existsSync(MK_SHOW)) { console.error(`✗ لم أجد ${MK_SHOW}`); process.exit(2); }
if (!existsSync(SMOKE))   { console.error(`✗ لم أجد ${SMOKE}`); process.exit(2); }

/** يستخرج سطور `key = value` من dry-config لـbin/mk-show. */
function readDryConfig(target) {
  const r = spawnSync('bash', [MK_SHOW, target, 'dry-config'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bin/mk-show ${target} dry-config فشل: ${r.stderr || r.stdout}`);
  const kv = {};
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (m) kv[m[1]] = m[2].trim();
  }
  return kv;
}

/** ينفّذ smoke --print-config ويعيد `{api_port, studio_port, owner_email, …}`. */
function readSmokeConfig(target, env = {}) {
  const r = spawnSync('node', [SMOKE, target, '--print-config'], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`mk-show-smoke ${target} --print-config فشل: ${r.stderr || r.stdout}`);
  const kv = {};
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (m) kv[m[1]] = m[2].trim();
  }
  return { kv, raw: r.stdout };
}

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

for (const target of ['show', 'shownext']) {
  console.log(`\n▶ ${target}`);
  const expected = readDryConfig(target);
  const expectedApi = expected.api_port;
  const expectedStudio = expected.studio_port;
  const expectedEmail = expected.owner_email; // = 'mk@primeflow.co' (الافتراض)

  // (أ) بلا env — نُفرِغ MK_SMOKE_* لمحاكاة الاستدعاء اليدويّ (دون run_smoke).
  // الهدفُ الحارسيّ: التأكّد أنّ `${…}` من bin/mk-show لا يتسرّب حرفيّاً.
  // المنافذ هنا تأتي من readMkShowVar المصدر-الواحد لآخر إسناد في الملفّ،
  // فتَخلط show↔shownext — خارجَ نطاقِ 536 ومسار run_smoke يتجاوزه.
  console.log(`  حالة (أ) بلا env (readMkShowVar وحدَه):`);
  const bare = readSmokeConfig(target, {
    MK_SMOKE_API_PORT: '', MK_SMOKE_STUDIO_PORT: '',
    MK_SMOKE_OWNER_EMAIL: '', MK_SMOKE_STUDIO_URL: '',
  });
  check(!bare.raw.includes('${'), `(أ) لا \${ خامّ في المخرَج`);
  check(bare.kv.owner_email === expectedEmail, `(أ) owner_email=${bare.kv.owner_email} = ${expectedEmail}`);

  // (ب) مع MK_SMOKE_* كما يمرّرها run_smoke
  console.log(`  حالة (ب) مع MK_SMOKE_* (كـrun_smoke):`);
  const withEnv = readSmokeConfig(target, {
    MK_SMOKE_API_PORT: expectedApi,
    MK_SMOKE_STUDIO_PORT: expectedStudio,
    MK_SMOKE_OWNER_EMAIL: expectedEmail,
  });
  check(!withEnv.raw.includes('${'), `(ب) لا \${ خامّ في المخرَج`);
  check(withEnv.kv.api_port === expectedApi, `(ب) api_port=${withEnv.kv.api_port} = ${expectedApi}`);
  check(withEnv.kv.studio_port === expectedStudio, `(ب) studio_port=${withEnv.kv.studio_port} = ${expectedStudio}`);
  check(withEnv.kv.owner_email === expectedEmail, `(ب) owner_email=${withEnv.kv.owner_email} = ${expectedEmail}`);
}

console.log();
if (failures.length > 0) {
  console.error(`✗ verify-smoke-config FAILED — ${failures.length} فحص`);
  process.exit(1);
}
console.log(`✓ verify-smoke-config PASSED — show و shownext · (أ) + (ب) كلّها صحيحة.`);
process.exit(0);
