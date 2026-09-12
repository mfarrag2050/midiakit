// 190-EXPORT-E2E §٤ — فحوصات جاهزيّة قابلة للاختبار وحدها.
//
// كل فحص يُرجع 'ok' أو 'fail' + رمز مسمّى (لا قيمة سرّ · لا مسار).
// endpoint /v1/ready يجمعها ويردّ 200 إن all ok · 503 وإلّا مع أسماء الفشل.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import type { Storage } from '../storage/index.js';

export type CheckResult = 'ok' | 'fail';

export async function checkDb(pool: Pool): Promise<CheckResult> {
  try {
    const r = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    return r.rows[0]?.ok === 1 ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

/** يكتب مفتاح probe صغير + يحذفه — يُثبت الكتابة والحذف. */
export async function checkStorage(storage: Storage): Promise<CheckResult> {
  const probeKey = `_ready-probe/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await storage.putObjectRaw(probeKey, Buffer.from('ok'), 'text/plain');
    await storage.deleteObject(probeKey);
    return 'ok';
  } catch {
    return 'fail';
  }
}

/** يفحص وجود خطّ مضمَّن واحد على الأقلّ — assets/fonts/ في جذر المستودع. */
export function checkBuiltinFont(repoRoot: string): CheckResult {
  const embedded = [
    'assets/fonts/IBMPlexSansArabic-Regular.ttf',
    'assets/fonts/Almarai-Regular.ttf',
  ];
  for (const rel of embedded) {
    if (existsSync(resolve(repoRoot, rel))) return 'ok';
  }
  return 'fail';
}
