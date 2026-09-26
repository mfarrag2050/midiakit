import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  assertDevEnvironment, cleanDevEnvironment, devSpec, launchCertificate,
} from './dev-environment.mjs';

function localSecrets() {
  const local = Object.fromEntries(devSpec.localKeys.map(key => [key, randomBytes(32).toString('hex')]));
  for (const [key, role] of Object.entries(devSpec.database.roles)) {
    local[key] = `postgres://${role}:${randomBytes(32).toString('hex')}@127.0.0.1:19041/mediakit`;
  }
  return local;
}

test('461: child receives only declared local secrets and dev settings', () => {
  const local = localSecrets();
  const inherited = { PATH: process.env.PATH, HOME: process.env.HOME,
    SESSION_JWT_SECRET: randomBytes(32).toString('hex'), NODE_OPTIONS: '--inspect',
    DOTENV_CONFIG_PATH: '/wrong/file', AWS_PROFILE: 'unrelated' };
  const clean = cleanDevEnvironment(inherited, { ...local, AWS_PROFILE: 'also-unrelated' });
  const child = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(process.env)))'], {
    env: clean, encoding: 'utf8',
  });
  assert.equal(child.status, 0);
  assert.deepEqual(Object.keys(clean).sort(), [
    'PATH', 'HOME', 'DOTENV_CONFIG_PATH', ...Object.keys(devSpec.environment), ...devSpec.localKeys,
  ].sort());
  const childKeys = JSON.parse(child.stdout);
  for (const key of ['NODE_OPTIONS', 'AWS_PROFILE']) assert.ok(!childKeys.includes(key));
  assert.equal(clean.SESSION_JWT_SECRET, local.SESSION_JWT_SECRET);
  assert.equal(clean.DOTENV_CONFIG_PATH, '/dev/null');
  assert.equal(clean.NODE_OPTIONS, undefined);
  assert.equal(clean.AWS_PROFILE, undefined);
});

for (const [key, conflicting] of [
  ['S3_ENDPOINT', 'http://127.0.0.1:19064'],
  ['S3_PUBLIC_ENDPOINT', 'http://127.0.0.1:19064'],
  ['BULLMQ_PREFIX', 'wrong-lane'],
  ['REDIS_URL', 'redis://127.0.0.1:19063/0'],
]) {
  test(`461: inherited ${key} conflict fails before local secrets are read`, () => {
    const child = spawnSync(process.execPath, [new URL('./dev-launch.mjs', import.meta.url).pathname, 'api'], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, [key]: conflicting }, encoding: 'utf8',
    });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, new RegExp(`DEV_ENV_CONFLICT: inherited ${key}`));
  });
}

for (const key of ['DATABASE_URL_APP', 'DATABASE_URL_PLATFORM']) {
  test(`461: ${key} wrong database, role, port or URL override is refused without disclosure`, () => {
    const local = localSecrets();
    const credential = new URL(local[key]).password;
    const invalid = [local[key].replace('19041', '19062'), local[key].replace('/mediakit', '/other'),
      local[key].replace(devSpec.database.roles[key], 'wrong_role'),
      local[key] + '?host=127.0.0.1&port=19062', credential];
    for (const connection of invalid) {
      assert.throws(() => cleanDevEnvironment({}, { ...local, [key]: connection }), error => {
        assert.match(error.message, new RegExp(`DEV_ENV_(MISMATCH|INVALID): ${key}`));
        assert.ok(!error.message.includes(credential));
        return true;
      });
    }
  });
}

test('461: inherited secret never substitutes for a missing local secret', () => {
  const local = localSecrets();
  const inherited = { AI_KEY_ENCRYPTION_KEY: local.AI_KEY_ENCRYPTION_KEY };
  delete local.AI_KEY_ENCRYPTION_KEY;
  assert.throws(() => cleanDevEnvironment(inherited, local), /DEV_ENV_MISSING: AI_KEY_ENCRYPTION_KEY/);
});

test('461: startup guard rejects a changed child environment before starting the app', () => {
  const clean = cleanDevEnvironment({}, localSecrets());
  const child = spawnSync(process.execPath, ['--import', new URL('./dev-startup.mjs', import.meta.url).href,
    '-e', 'console.log("APP_STARTED")'], {
    env: { ...clean, S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:19064' }, encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.match(child.stderr, /DEV_ENV_MISMATCH: S3_PUBLIC_ENDPOINT/);
});

test('461: startup certificate reports actual database hosts and no local secret values', () => {
  const local = localSecrets();
  const clean = cleanDevEnvironment({}, local);
  assertDevEnvironment(clean);
  const certificate = launchCertificate(clean);
  assert.equal(certificate.DATABASE_URL_host, new URL(local.DATABASE_URL_APP).host);
  assert.equal(certificate.DATABASE_URL_source, 'DATABASE_URL_APP');
  assert.equal(certificate.DATABASE_URL_PLATFORM_host, new URL(local.DATABASE_URL_PLATFORM).host);
  for (const secret of Object.values(local)) assert.ok(!JSON.stringify(certificate).includes(secret));
});
