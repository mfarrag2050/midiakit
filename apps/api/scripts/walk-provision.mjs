import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { apiDirectory, cleanDevEnvironment, readLocalEnvironment } from './dev-environment.mjs';

async function registerWalkTenant(environment, account) {
  const response = await fetch(`http://${environment.API_HOST}:${environment.PORT}/v1/auth/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...account, locale: 'ar' }),
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (response.status !== 201) throw new Error('signup failed');
  const registration = await response.json();
  const tenantId = registration.tenant?.id;
  // API authentication is Bearer JWT. The contract's apiKey stores the signup access token.
  const apiKey = registration.session?.accessToken;
  if (registration.tenant?.name !== account.tenantName || registration.user?.email !== account.email
      || typeof tenantId !== 'string' || typeof apiKey !== 'string' || !apiKey) {
    throw new Error('invalid signup response');
  }
  return { tenantId, apiKey, email: account.email, password: account.password };
}

async function raiseWalkQuota(connectionString, tenantId, tenantName) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  client.on('error', () => {}); // The awaited query reports failure without leaking connection details.
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    const quota = await client.query(`UPDATE tenants
      SET plan_overrides = COALESCE(plan_overrides, '{}'::jsonb)
        || '{"requests_per_minute_limit":300,"concurrent_renders_limit":100}'::jsonb
      WHERE id = $1 AND name = $2`, [tenantId, tenantName]);
    if (quota.rowCount !== 1) throw new Error('quota row count mismatch');
    await client.query('COMMIT');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function writeCredentials(directory, credentials) {
  // Atomic replacement preserves the previous file on failure and replaces it with mode 0600.
  const temporary = join(directory, `.walk-creds-${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(credentials) + '\n');
    await file.close();
    await rename(temporary, join(directory, 'walk-creds.json'));
  } finally {
    await file.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function provision() {
  if (process.argv.length !== 2) throw new Error('usage');
  const environment = cleanDevEnvironment(process.env, readLocalEnvironment());
  const tenantName = `walk-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(6).toString('hex')}`;
  const account = { tenantName, email: `${tenantName}@example.invalid`, password: randomBytes(32).toString('base64url') };
  const directory = join(apiDirectory, '.local');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Registration is the sole source of the ID; no existing tenant can be supplied.
  const credentials = await registerWalkTenant(environment, account);
  await raiseWalkQuota(environment.DATABASE_URL_PLATFORM, credentials.tenantId, tenantName);
  await writeCredentials(directory, credentials);
  process.stdout.write('wrote apps/api/.local/walk-creds.json (mode 0600)\n'
    + 'fields: tenantId apiKey email password\nquota rowCount=1\n');
}

try { await provision(); }
catch {
  // Database/HTTP/filesystem errors may contain credentials or submitted values.
  console.error('WALK_PROVISION_FAILED');
  process.exitCode = 1;
}
