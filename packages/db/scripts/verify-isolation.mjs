#!/usr/bin/env node
/**
 * G-P4-1 — بوابة عزل المستأجرين (docs/17 §7).
 *
 * تشتغل على قاعدة test (mediakit_test على 19042). تُصفّرها، تزرع بيانات
 * لمستأجرين، وتشغّل خمسة فحوص لكل جدول تحت مستأجر + فحوص عامة:
 *
 *   1. وجود        — جلسة tenant_A ترى صفوفها.
 *   2. ثبات        — نفس الاستعلام 100× → نتائج متطابقة.
 *   3. سلبي بـID   — SELECT/UPDATE/DELETE لسجل tenant_B من جلسة tenant_A → صفر.
 *                    INSERT بـtenant_id=tenant_B → RLS violation.
 *   4. سلبي بلا SET LOCAL — استعلام من جلسة app_user بدون ضبط → صفر.
 *   5. سلبي بلا FORCE — يعطّل FORCE على جدول واحد، يشغّل الفحص كـmigration_user،
 *                    ثم يعيد FORCE. يُبرهن أن FORCE ضرورية لا اختيارية.
 *
 * وفحوصات عامة:
 *   6. لا دور بـBYPASSRLS في القاعدة إطلاقاً (PHASES-api.md §القاعدة الحاكمة).
 *   7. لا SUPERUSER يمكن للتطبيق تسجيله (postgres مستثنى — bootstrap فقط).
 *   8. كل جدول تحت مستأجر يحمل: rowsecurity=t AND forcerowsecurity=t AND
 *      ≥1 سياسة. جدول جديد بلا سياسة = فشل البوابة.
 *
 * التركة (Phase 3.9): البوابة السابقة G6 كانت placeholder بلا جداول
 * RLS ولا اتصال حي. هذه البوابة G-P4-1 تحلّ محلّها كاملةً في المرحلة 4.
 *
 * الخروج: 0 نجاح · 1 فشل. أيّ إخفاق يُطبع مع سياق كامل.
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const MIGRATION_URL = process.env.DATABASE_URL_TEST;
const APP_URL = process.env.DATABASE_URL_TEST_APP;

if (!MIGRATION_URL || !APP_URL) {
  console.error('✗ Missing DATABASE_URL_TEST or DATABASE_URL_TEST_APP.');
  console.error('  Copy packages/db/.env.example → packages/db/.env and adjust.');
  process.exit(1);
}

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const TABLES_UNDER_TENANT = [
  'users',
  'sessions',
  'brand_kits',
  'templates',
  'assets',
  'workflows',
  'projects',
  'project_state',
  'transitions',
  'annotations',
  'renders',
  'revisions',
  'ai_integrations',
  'subscriptions',
  'usage',
];

let failures = 0;
const failLog = [];

function fail(check, detail) {
  failures++;
  const line = `✗ ${check}: ${detail}`;
  failLog.push(line);
  console.error(`  ${line}`);
}

function pass(check) {
  console.log(`  ✓ ${check}`);
}

async function inTxAsTenant(pool, tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function inTxWithoutTenant(pool, fn) {
  const client = await pool.connect();
  try {
    // لا SET LOCAL. النقطة الحرجة: SET LOCAL في المعاملات السابقة انتهى
    // مع COMMIT (PG guarantees). الاتصال الجديد أو المُعاد بلا app.tenant_id
    // → current_setting(..., true) يعيد NULL → NULL::uuid = tenant_id يعطي
    // NULL (لا true) → RLS يرفض كل صف. هذا هو الفشل السلبي المتوقّع.
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  تصفير + بذر
// ══════════════════════════════════════════════════════════════════

async function resetAndSeed(migrationPool) {
  const client = await migrationPool.connect();
  try {
    // TRUNCATE يعتمد على ملكية الجدول لا RLS. migration_user يملك.
    await client.query('TRUNCATE tenants CASCADE');

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tenants(id, name) VALUES ($1, 'Tenant Alpha'), ($2, 'Tenant Beta')`,
      [TENANT_A, TENANT_B],
    );
    await client.query('COMMIT');

    for (const tenantId of [TENANT_A, TENANT_B]) {
      const suffix = tenantId === TENANT_A ? 'a' : 'b';
      await client.query('BEGIN');
      await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);

      const userRes = await client.query(
        `INSERT INTO users(tenant_id, email, role, password_hash)
         VALUES ($1, $2, 'owner', 'pw') RETURNING id`,
        [tenantId, `owner-${suffix}@test`],
      );
      const userId = userRes.rows[0].id;

      await client.query(
        `INSERT INTO sessions(tenant_id, user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, 'hash-' || $3, now() + interval '1 day')`,
        [tenantId, userId, suffix],
      );

      const bkRes = await client.query(
        `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, $2, '{}') RETURNING id`,
        [tenantId, `Brand ${suffix}`],
      );
      const bkId = bkRes.rows[0].id;

      const tplRes = await client.query(
        `INSERT INTO templates(tenant_id, scope, kind, name, definition)
         VALUES ($1, 'tenant', 'card', $2, '{}') RETURNING id`,
        [tenantId, `Template ${suffix}`],
      );
      const tplId = tplRes.rows[0].id;

      await client.query(
        `INSERT INTO assets(tenant_id, kind, storage_key) VALUES ($1, 'image', 'seed/' || $2)`,
        [tenantId, suffix],
      );

      const wfRes = await client.query(
        `INSERT INTO workflows(tenant_id, name, kind, states, transitions, is_default)
         VALUES ($1, $2, 'individual', '[]', '[]', true) RETURNING id`,
        [tenantId, `Workflow ${suffix}`],
      );
      const wfId = wfRes.rows[0].id;

      const prjRes = await client.query(
        `INSERT INTO projects(tenant_id, brand_kit_id, template_id, workflow_id, name, content, created_by)
         VALUES ($1, $2, $3, $4, $5, '{}', $6) RETURNING id`,
        [tenantId, bkId, tplId, wfId, `Project ${suffix}`, userId],
      );
      const prjId = prjRes.rows[0].id;

      await client.query(
        `INSERT INTO project_state(project_id, tenant_id, workflow_id, current_state, assignee_id)
         VALUES ($1, $2, $3, 'draft', $4)`,
        [prjId, tenantId, wfId, userId],
      );

      await client.query(
        `INSERT INTO transitions(tenant_id, project_id, from_state, to_state, transitioned_by, reason)
         VALUES ($1, $2, null, 'draft', $3, 'initial')`,
        [tenantId, prjId, userId],
      );

      await client.query(
        `INSERT INTO annotations(tenant_id, project_id, target, body, author_id)
         VALUES ($1, $2, '{"kind":"layer"}', 'seed annotation', $3)`,
        [tenantId, prjId, userId],
      );

      await client.query(
        `INSERT INTO renders(tenant_id, project_id, size, format, requested_by)
         VALUES ($1, $2, '1080x1080', 'png', $3)`,
        [tenantId, prjId, userId],
      );

      await client.query(
        `INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
         VALUES ($1, 'brand_kit', $2, $3, 'create', '{}')`,
        [tenantId, bkId, userId],
      );

      await client.query(
        `INSERT INTO ai_integrations(tenant_id, provider, api_key_ref)
         VALUES ($1, 'openai', 'ref-' || $2)`,
        [tenantId, suffix],
      );

      await client.query(
        `INSERT INTO subscriptions(tenant_id, plan, status) VALUES ($1, 'trial', 'trialing')`,
        [tenantId],
      );

      await client.query(
        `INSERT INTO usage(tenant_id, period, renders_count)
         VALUES ($1, date_trunc('month', now())::date, 1)`,
        [tenantId],
      );

      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  استراتيجيات INSERT سلبيّة (بـtenant_id مغاير للجلسة)
// ══════════════════════════════════════════════════════════════════

const NEG_INSERT_STRATEGIES = {
  users: (c, foreign) =>
    c.query(
      `INSERT INTO users(tenant_id, email, role, password_hash)
       VALUES ($1, 'intruder@test', 'admin', 'pw')`,
      [foreign],
    ),
  sessions: (c, foreign) =>
    c.query(
      `INSERT INTO sessions(tenant_id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, gen_random_uuid(), 'evil', now() + interval '1 day')`,
      [foreign],
    ),
  brand_kits: (c, foreign) =>
    c.query(
      `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'Intruder', '{}')`,
      [foreign],
    ),
  templates: (c, foreign) =>
    c.query(
      `INSERT INTO templates(tenant_id, scope, kind, name, definition)
       VALUES ($1, 'tenant', 'card', 'Intruder', '{}')`,
      [foreign],
    ),
  assets: (c, foreign) =>
    c.query(
      `INSERT INTO assets(tenant_id, kind, storage_key) VALUES ($1, 'image', 'intruder')`,
      [foreign],
    ),
  workflows: (c, foreign) =>
    c.query(
      `INSERT INTO workflows(tenant_id, name, kind, states, transitions)
       VALUES ($1, 'Intruder', 'individual', '[]', '[]')`,
      [foreign],
    ),
  projects: (c, foreign) =>
    c.query(
      `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, content)
       VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'Intruder', '{}')`,
      [foreign],
    ),
  project_state: (c, foreign) =>
    c.query(
      `INSERT INTO project_state(project_id, tenant_id, current_state)
       VALUES (gen_random_uuid(), $1, 'draft')`,
      [foreign],
    ),
  transitions: (c, foreign) =>
    c.query(
      `INSERT INTO transitions(tenant_id, project_id, to_state)
       VALUES ($1, gen_random_uuid(), 'draft')`,
      [foreign],
    ),
  annotations: (c, foreign) =>
    c.query(
      `INSERT INTO annotations(tenant_id, project_id, target, body)
       VALUES ($1, gen_random_uuid(), '{}', 'evil')`,
      [foreign],
    ),
  renders: (c, foreign) =>
    c.query(
      `INSERT INTO renders(tenant_id, project_id, size, format)
       VALUES ($1, gen_random_uuid(), '1080x1080', 'png')`,
      [foreign],
    ),
  revisions: (c, foreign) =>
    c.query(
      `INSERT INTO revisions(tenant_id, resource_type, resource_id, action, snapshot)
       VALUES ($1, 'brand_kit', gen_random_uuid(), 'create', '{}')`,
      [foreign],
    ),
  ai_integrations: (c, foreign) =>
    c.query(
      `INSERT INTO ai_integrations(tenant_id, provider, api_key_ref)
       VALUES ($1, 'anthropic', 'ref-x')`,
      [foreign],
    ),
  subscriptions: (c, foreign) =>
    c.query(
      `INSERT INTO subscriptions(tenant_id, plan, status) VALUES ($1, 'trial', 'trialing')`,
      [foreign],
    ),
  usage: (c, foreign) =>
    c.query(
      `INSERT INTO usage(tenant_id, period) VALUES ($1, '2030-12-31')`,
      [foreign],
    ),
};

// ══════════════════════════════════════════════════════════════════
//  فحوص لكل جدول (على app_user)
// ══════════════════════════════════════════════════════════════════

async function checkTable(appPool, table) {
  console.log(`\n▶ Table: ${table}`);

  // 1. وجود
  const aRows = await inTxAsTenant(appPool, TENANT_A, (c) =>
    c.query(`SELECT * FROM ${table}`),
  );
  if (aRows.rowCount >= 1) pass(`existence: tenant_A sees ${aRows.rowCount} row(s)`);
  else fail(`${table} existence`, `tenant_A sees 0 rows (expected ≥1)`);

  const bRows = await inTxAsTenant(appPool, TENANT_B, (c) =>
    c.query(`SELECT * FROM ${table}`),
  );
  if (bRows.rowCount >= 1) pass(`existence: tenant_B sees ${bRows.rowCount} row(s)`);
  else fail(`${table} existence`, `tenant_B sees 0 rows (expected ≥1)`);

  if (bRows.rowCount === 0) return; // skip further checks if seed failed

  // 2. ثبات — 100 استدعاء متطابق
  const runs = [];
  for (let i = 0; i < 100; i++) {
    const r = await inTxAsTenant(appPool, TENANT_A, (c) =>
      c.query(`SELECT count(*)::int AS n FROM ${table}`),
    );
    runs.push(r.rows[0].n);
  }
  const distinct = new Set(runs);
  if (distinct.size === 1) pass(`stability: 100 runs → identical count (${[...distinct][0]})`);
  else fail(`${table} stability`, `100 runs → ${distinct.size} distinct counts: ${[...distinct].join(',')}`);

  // 3. سلبي بـID — SELECT سجل tenant_B من جلسة tenant_A → صفر
  const bRow = bRows.rows[0];
  const idCol = 'id' in bRow ? 'id' : 'project_id';
  const bId = bRow[idCol];
  const negSelect = await inTxAsTenant(appPool, TENANT_A, (c) =>
    c.query(`SELECT * FROM ${table} WHERE ${idCol} = $1`, [bId]),
  );
  if (negSelect.rowCount === 0) pass(`neg SELECT by tenant_B's ${idCol} → 0 rows`);
  else fail(`${table} neg SELECT`, `expected 0, got ${negSelect.rowCount} rows`);

  // 4. سلبي UPDATE — تعديل سجل tenant_B من جلسة tenant_A → صفر متأثّر
  const hasUpdatedAt = 'updated_at' in bRow;
  if (hasUpdatedAt) {
    const negUpdate = await inTxAsTenant(appPool, TENANT_A, (c) =>
      c.query(`UPDATE ${table} SET updated_at = now() WHERE ${idCol} = $1`, [bId]),
    );
    if (negUpdate.rowCount === 0) pass(`neg UPDATE tenant_B's ${idCol} → 0 affected`);
    else fail(`${table} neg UPDATE`, `expected 0 affected, got ${negUpdate.rowCount}`);
  }

  // 5. سلبي DELETE — حذف سجل tenant_B من جلسة tenant_A → صفر متأثّر
  const negDelete = await inTxAsTenant(appPool, TENANT_A, (c) =>
    c.query(`DELETE FROM ${table} WHERE ${idCol} = $1`, [bId]),
  );
  if (negDelete.rowCount === 0) pass(`neg DELETE tenant_B's ${idCol} → 0 affected`);
  else fail(`${table} neg DELETE`, `expected 0 affected, got ${negDelete.rowCount}`);

  // 6. سلبي INSERT بـtenant_id=tenant_B من جلسة tenant_A → RLS violation
  const strategy = NEG_INSERT_STRATEGIES[table];
  if (!strategy) {
    fail(`${table} neg INSERT`, `no strategy defined for this table`);
    return;
  }
  try {
    await inTxAsTenant(appPool, TENANT_A, (c) => strategy(c, TENANT_B));
    fail(`${table} neg INSERT`, `expected RLS violation, INSERT succeeded`);
  } catch (err) {
    if (err.code === '42501' || /row-level security|new row violates row-level security/i.test(err.message)) {
      pass(`neg INSERT tenant_id=B → RLS rejected (${err.code || 'msg match'})`);
    } else {
      fail(`${table} neg INSERT`, `unexpected error: ${err.code || ''} ${err.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  فحص tenants (خاص)
// ══════════════════════════════════════════════════════════════════

async function checkTenantsTable(appPool) {
  console.log(`\n▶ Table: tenants (خاص)`);

  const aRows = await inTxAsTenant(appPool, TENANT_A, (c) =>
    c.query(`SELECT id, name FROM tenants`),
  );
  if (aRows.rowCount === 1 && aRows.rows[0].id === TENANT_A) {
    pass(`existence: tenant_A sees own tenant only`);
  } else {
    fail(`tenants existence`, `expected 1 row (Alpha), got ${aRows.rowCount}`);
  }

  const bRows = await inTxAsTenant(appPool, TENANT_B, (c) =>
    c.query(`SELECT id, name FROM tenants`),
  );
  if (bRows.rowCount === 1 && bRows.rows[0].id === TENANT_B) {
    pass(`existence: tenant_B sees own tenant only`);
  } else {
    fail(`tenants existence`, `expected 1 row (Beta), got ${bRows.rowCount}`);
  }

  const neg = await inTxAsTenant(appPool, TENANT_A, (c) =>
    c.query(`SELECT * FROM tenants WHERE id = $1`, [TENANT_B]),
  );
  if (neg.rowCount === 0) pass(`neg SELECT of tenant_B → 0 rows`);
  else fail(`tenants neg SELECT`, `expected 0, got ${neg.rowCount}`);
}

// ══════════════════════════════════════════════════════════════════
//  فحص بلا SET LOCAL
// ══════════════════════════════════════════════════════════════════

async function checkWithoutSetLocal(appPool) {
  console.log(`\n▶ Negative: without SET LOCAL`);
  const allTables = ['tenants', ...TABLES_UNDER_TENANT];
  for (const table of allTables) {
    const r = await inTxWithoutTenant(appPool, (c) =>
      c.query(`SELECT count(*)::int AS n FROM ${table}`),
    );
    if (r.rows[0].n === 0) pass(`${table}: without SET LOCAL → 0 rows`);
    else fail(`no-set-local ${table}`, `expected 0, got ${r.rows[0].n} rows visible`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  فحص بلا FORCE — يُبرهن أن FORCE ضرورية
// ══════════════════════════════════════════════════════════════════

async function checkWithoutForce(migrationPool) {
  console.log(`\n▶ Negative: without FORCE (على جدول 'usage')`);
  const client = await migrationPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1)', [TENANT_A]);
    const withForce = await client.query(`SELECT count(*)::int AS n FROM usage`);
    await client.query('COMMIT');

    await client.query(`ALTER TABLE usage NO FORCE ROW LEVEL SECURITY`);

    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1)', [TENANT_A]);
    const withoutForce = await client.query(`SELECT count(*)::int AS n FROM usage`);
    await client.query('COMMIT');

    await client.query(`ALTER TABLE usage FORCE ROW LEVEL SECURITY`);

    // مع FORCE: migration_user (المالك) مقيّد → 1 صف (tenant_A فقط).
    // بلا FORCE: migration_user (المالك) يتجاوز → 2 صف (كلاهما).
    if (withForce.rows[0].n === 1 && withoutForce.rows[0].n === 2) {
      pass(`FORCE effect: with=${withForce.rows[0].n} without=${withoutForce.rows[0].n} — يؤكّد أن FORCE ضرورية`);
    } else if (withForce.rows[0].n === withoutForce.rows[0].n) {
      fail(
        `FORCE necessity`,
        `مع/بدون FORCE أعطيا نفس النتيجة (${withForce.rows[0].n})؛ FORCE بلا أثر — تحقّق أن migration_user ليس SUPERUSER أو BYPASSRLS`,
      );
    } else {
      fail(
        `FORCE effect`,
        `unexpected: with=${withForce.rows[0].n} without=${withoutForce.rows[0].n} (متوقع 1 vs 2)`,
      );
    }
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  فحوص عامة
// ══════════════════════════════════════════════════════════════════

async function checkNoBypassRls(migrationPool) {
  console.log(`\n▶ Global: no role with BYPASSRLS`);
  const r = await migrationPool.query(
    `SELECT rolname FROM pg_roles WHERE rolbypassrls = true ORDER BY rolname`,
  );
  if (r.rowCount === 0) {
    pass(`pg_roles WHERE rolbypassrls = true → 0 rows`);
  } else {
    fail(
      `no-bypassrls`,
      `أدوار بـBYPASSRLS: ${r.rows.map((row) => row.rolname).join(', ')} — يخالف PHASES-api.md §القاعدة الحاكمة`,
    );
  }
}

async function checkNoAppSuperuser(migrationPool) {
  console.log(`\n▶ Global: no SUPERUSER accessible to app`);
  const r = await migrationPool.query(
    `SELECT rolname FROM pg_roles WHERE rolsuper = true AND rolcanlogin = true AND rolname NOT IN ('postgres') ORDER BY rolname`,
  );
  if (r.rowCount === 0) {
    pass(`لا SUPERUSER يستطيع تسجيل دخول عدا postgres (bootstrap فقط)`);
  } else {
    fail(`no-app-superuser`, `أدوار SUPERUSER تستطيع login: ${r.rows.map((row) => row.rolname).join(', ')}`);
  }
}

async function checkAllTablesRlsAndForce(migrationPool) {
  console.log(`\n▶ Global: كل جدول تحت مستأجر يحمل RLS + FORCE + سياسة`);
  const expected = ['tenants', ...TABLES_UNDER_TENANT];
  for (const table of expected) {
    const r = await migrationPool.query(
      `SELECT relrowsecurity AS rls, relforcerowsecurity AS force,
              (SELECT count(*) FROM pg_policies WHERE tablename = $1)::int AS policy_count
       FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [table],
    );
    if (r.rowCount === 0) {
      fail(`table ${table}`, `جدول غير موجود`);
      continue;
    }
    const { rls, force, policy_count } = r.rows[0];
    if (rls && force && policy_count >= 1) {
      pass(`${table}: rls=t force=t policies=${policy_count}`);
    } else {
      fail(`table ${table}`, `rls=${rls} force=${force} policies=${policy_count} (متوقع t/t/≥1)`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  main
// ══════════════════════════════════════════════════════════════════

async function main() {
  const migrationPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });
  const appPool = new Pool({ connectionString: APP_URL, max: 5 });

  const started = Date.now();
  try {
    console.log(`▶ G-P4-1 — بوابة عزل المستأجرين`);
    console.log(`  DB: ${MIGRATION_URL.replace(/:[^:@]+@/, ':***@')}`);
    console.log(`  tenant_A = ${TENANT_A}`);
    console.log(`  tenant_B = ${TENANT_B}`);

    console.log(`\n▶ Reset + seed`);
    await resetAndSeed(migrationPool);
    pass(`seed complete for 2 tenants × 15 tenant-scoped tables`);

    await checkTenantsTable(appPool);
    for (const table of TABLES_UNDER_TENANT) {
      await checkTable(appPool, table);
    }
    await checkWithoutSetLocal(appPool);
    await checkWithoutForce(migrationPool);
    await checkNoBypassRls(migrationPool);
    await checkNoAppSuperuser(migrationPool);
    await checkAllTablesRlsAndForce(migrationPool);
  } catch (err) {
    console.error('\n✗ Unexpected exception:', err);
    failures++;
  } finally {
    await migrationPool.end();
    await appPool.end();
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) {
    console.log(`✓ G-P4-1 PASSED — كل الفحوص نجحت (${elapsed}s)`);
    process.exit(0);
  } else {
    console.error(`✗ G-P4-1 FAILED — ${failures} إخفاق (${elapsed}s)`);
    for (const line of failLog) console.error(`  ${line}`);
    process.exit(1);
  }
}

main();
