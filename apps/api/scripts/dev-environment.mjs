import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import dotenv from 'dotenv';

export const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
export const devSpec = JSON.parse(readFileSync(new URL('../dev-env.json', import.meta.url), 'utf8'));

export class DevLaunchError extends Error {}

function assertDatabaseTarget(key, connectionString) {
  let target;
  try { target = new URL(connectionString); }
  catch { throw new DevLaunchError(`DEV_ENV_INVALID: ${key}`); }
  const expected = devSpec.database;
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
      || target.hostname !== expected.hostname || target.port !== expected.port
      || target.pathname !== expected.pathname || target.username !== expected.roles[key]
      || !target.password || target.search || target.hash) {
    throw new DevLaunchError(`DEV_ENV_MISMATCH: ${key} must target its dev role at mediakit@19041`);
  }
}

export function assertInheritedEnvironment(inherited) {
  for (const [key, expected] of Object.entries(devSpec.environment)) {
    if (inherited[key] !== undefined && inherited[key] !== expected) {
      throw new DevLaunchError(`DEV_ENV_CONFLICT: inherited ${key} differs from dev-env.json; refusing launch`);
    }
  }
  for (const key of Object.keys(devSpec.database.roles)) {
    if (inherited[key] !== undefined) assertDatabaseTarget(key, inherited[key]);
  }
}

export function readLocalEnvironment() {
  const local = {};
  for (const name of devSpec.localFiles) {
    const path = join(apiDirectory, name);
    if (existsSync(path)) Object.assign(local, dotenv.parse(readFileSync(path)));
  }
  return local;
}

export function cleanDevEnvironment(inherited, local) {
  assertInheritedEnvironment(inherited);
  const clean = { PATH: inherited.PATH, HOME: inherited.HOME, ...devSpec.environment };
  for (const key of devSpec.localKeys) {
    if (!local[key]) throw new DevLaunchError(`DEV_ENV_MISSING: ${key} in apps/api/.env or .env.local`);
    clean[key] = local[key];
  }
  // config.ts imports dotenv/config: prevent a second, unfiltered load in the child.
  clean.DOTENV_CONFIG_PATH = '/dev/null';
  assertDevEnvironment(clean);
  return clean;
}

export function assertDevEnvironment(environment) {
  for (const [key, expected] of Object.entries(devSpec.environment)) {
    if (environment[key] !== expected) throw new DevLaunchError(`DEV_ENV_MISMATCH: ${key}`);
  }
  for (const key of devSpec.localKeys) {
    if (!environment[key]) throw new DevLaunchError(`DEV_ENV_MISSING: ${key}`);
  }
  for (const key of Object.keys(devSpec.database.roles)) assertDatabaseTarget(key, environment[key]);
}

export function launchCertificate(environment) {
  return {
    PORT: environment.PORT,
    S3_ENDPOINT: environment.S3_ENDPOINT,
    S3_PUBLIC_ENDPOINT: environment.S3_PUBLIC_ENDPOINT,
    BULLMQ_PREFIX: environment.BULLMQ_PREFIX,
    DATABASE_URL_host: new URL(environment.DATABASE_URL_APP).host,
    DATABASE_URL_source: 'DATABASE_URL_APP',
    DATABASE_URL_PLATFORM_host: new URL(environment.DATABASE_URL_PLATFORM).host,
    REDIS_URL_host: new URL(environment.REDIS_URL).host,
  };
}

export function reportLaunchFailure(error) {
  // URL parser and SDK errors can contain credentials; only our name-only errors are printable.
  console.error(error instanceof DevLaunchError ? error.message : 'DEV_LAUNCH_FAILED: local configuration or process error');
  process.exitCode = 1;
}
