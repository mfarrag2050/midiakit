#!/usr/bin/env node
/**
 * scripts/reset-showroom-owner-password.mjs — أداةُ break-glass.
 *
 * **الاستعمال:**
 *   1. توليد كلمةٍ قويّة وحفظُها بـ600 في `~/MediaKit/.show-owner-password`.
 *   2. تصدير بيئة الشوروم (`. $SHOW_ROOT/.env.show`).
 *   3. `node --import tsx scripts/reset-showroom-owner-password.mjs`.
 *
 * **ماذا يفعل:**
 *   - يقرأُ الكلمةَ من الملفّ (600) — لا argv، لا env، لا stdin.
 *   - يستدعي `hashPassword` من `apps/api/src/auth/session.ts` (argon2id · نفسُ خوارزميّة تسجيل الدخول).
 *   - يُحدِّث `users.password_hash` للـ`SHOWROOM_OWNER_EMAIL` بـ`migration_user`.
 *   - يفحص `rowCount === 1` (feedback-rowcount-check).
 *   - لا يطبع الكلمةَ ولا تجزئتَها — يطبعُ id مقتطعاً وسطراً واحداً.
 *
 * **حدود:**
 *   - لا يُنشئ حساباً — يحدِّث الموجود فقط. إن غاب: يخرج بغير صفر.
 *   - لا يُبطِل الجلساتِ الحاليّة (يمكن إضافتُها لاحقاً · خارج نطاق 402ب §١).
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { hashPassword } from '../apps/api/src/auth/session.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(resolve(__dirname, '../apps/api/package.json'));
const pg = requireFromApi('pg');

const PW_FILE = join(homedir(), 'MediaKit', '.show-owner-password');
const OWNER_EMAIL = process.env.SHOWROOM_OWNER_EMAIL || 'mk@primeflow.co';
// اتّصالان (نمط seed-showroom.mjs:47-50):
//   • DATABASE_URL_PLATFORM (control_plane_user · SELECT cross-tenant) — لإيجاد tenant_id قبل SET.
//   • DATABASE_URL (migration_user · DML + RLS ملتزَم) — لـUPDATE بعد SET app.tenant_id.
const DB_URL = process.env.DATABASE_URL;
const DB_URL_PLATFORM = process.env.DATABASE_URL_PLATFORM;

if (!DB_URL || !DB_URL_PLATFORM) {
  console.error('✗ DATABASE_URL و DATABASE_URL_PLATFORM كلاهما مطلوب. صدّر بيئة الشوروم: `. $SHOW_ROOT/.env.show`.');
  process.exit(1);
}

// تحقّق من صلاحيّات الملفّ — 600 · مالكه هو المستخدم الحاليّ.
let plaintext;
try {
  const st = statSync(PW_FILE);
  const mode = (st.mode & 0o777).toString(8);
  if (mode !== '600') {
    console.error(`✗ ${PW_FILE} صلاحيّاته ${mode} (المتوقَّع 600). أصلح بـ\`chmod 600\` ثمّ أعِد.`);
    process.exit(1);
  }
  plaintext = readFileSync(PW_FILE, 'utf-8').replace(/\r?\n$/, '');
} catch (e) {
  console.error(`✗ تعذّرت قراءة ${PW_FILE}: ${e.message}`);
  process.exit(1);
}

if (plaintext.length < 24) {
  console.error(`✗ طولُ الكلمة في ${PW_FILE} = ${plaintext.length} (المتوقَّع ≥24).`);
  process.exit(1);
}

const hash = await hashPassword(plaintext);

// 1) البحث عبر control_plane_user (SELECT cross-tenant · لا RLS).
const plane = new pg.Client({ connectionString: DB_URL_PLATFORM });
await plane.connect();
let userId, tenantId;
try {
  const { rows } = await plane.query(
    'SELECT id AS user_id, tenant_id, is_active FROM users WHERE email = $1 LIMIT 1',
    [OWNER_EMAIL],
  );
  if (!rows[0]) {
    console.error(`✗ الحساب ${OWNER_EMAIL} غير موجود في users. هذه الأداةُ لا تُنشئ — تحدِّث الموجود فقط.`);
    process.exit(1);
  }
  if (!rows[0].is_active) {
    console.error(`✗ الحساب ${OWNER_EMAIL} موجودٌ لكنّه غيرُ نشط.`);
    process.exit(1);
  }
  userId = rows[0].user_id;
  tenantId = rows[0].tenant_id;
} finally {
  await plane.end();
}

// 2) الـUPDATE عبر migration_user + SET app.tenant_id (نمط login.ts:34).
const mig = new pg.Client({ connectionString: DB_URL });
await mig.connect();
try {
  await mig.query('BEGIN');
  await mig.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
  const upd = await mig.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [hash, userId],
  );
  if (upd.rowCount !== 1) {
    await mig.query('ROLLBACK');
    console.error(`✗ UPDATE أثّر على ${upd.rowCount} صفّاً (المتوقَّع 1). لا تغيير.`);
    process.exit(1);
  }
  await mig.query('COMMIT');
  console.log(`✓ users.password_hash محدَّث · user=${userId.slice(0, 8)}… · tenant=${tenantId.slice(0, 8)}… · لا سرَّ في هذا المخرَج.`);
} finally {
  await mig.end();
}
