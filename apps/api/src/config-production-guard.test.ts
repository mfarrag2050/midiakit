// 321 §٢ · حارس الإقلاع في production · اختبار حياة.
//
// **العلّة** (نصّ inbox §٢): STORAGE_DRIVER default='memory'. إن نُشر
// إنتاج ونُسي المتغيّر · يُقلع سعيداً · يُسلّم `mem://` لعميل يدفع. الحلّ
// (موجود سلفاً في config.ts:110-116 · commit 32cb1008 · 2026-09-05):
// superRefine يرفض NODE_ENV=production + STORAGE_DRIVER=memory.
//
// **الاختبار** (لم يكن قبل · هذا يضيفه): يُثبت أنّ الإقلاع يُرفَض بذلك
// المزيج · وأنّه يمرّ في dev/test. **اسم المتغيّر** يظهر في stderr ·
// **لا قيَم سرّيّة** (نُمرّر مفاتيح placeholder فقط · نتحقّق من اسمها).
//
// **الآليّة**: نشغّل subprocess `node --import tsx -e 'await import(config.ts)'`
// بـenv مضبوطة. تفوّض الرفض إلى `process.exit(1)` الفعليّ (loadConfig).
// أرخص من dynamic module reload · وأصدق (نفس مسار الإقلاع الحقيقيّ).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(__dirname, 'config.ts');
const PROBE = `
import('${CONFIG_PATH}').then(() => {
  console.log('CONFIG_LOADED_OK');
  process.exit(0);
}).catch((e) => {
  console.error('CONFIG_LOAD_THREW:', e.message);
  process.exit(2);
});
`;

// baseline env بدون NODE_ENV/STORAGE_DRIVER — نعدّلها في كل test.
function runConfigLoad(overrides: Record<string, string | undefined>): { exit: number; stdout: string; stderr: string } {
  // Placeholder secrets · قيَم test-only · صيغتها فقط تُفحص (لا تُطبَع كسرّ).
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    DATABASE_URL_APP: 'postgres://u:p@127.0.0.1:5432/x',
    SESSION_JWT_SECRET: 'x'.repeat(64),
    AI_KEY_ENCRYPTION_KEY: 'a'.repeat(64),
    PLATFORM_JWT_SECRET: 'p'.repeat(64),
  };
  // apply overrides · undefined يمسح
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const r = spawnSync('node', ['--import', 'tsx', '-e', PROBE], {
    env, encoding: 'utf-8', timeout: 15000,
  });
  return { exit: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('321 §٢ · config production guard · لا mem:// في إنتاج', () => {
  it('production + STORAGE_DRIVER=memory ⇒ إقلاع مرفوض · اسم المتغيّر في stderr', () => {
    const r = runConfigLoad({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'memory',
      // بقيّة متطلّبات production (SMTP·PLATFORM_JWT_SECRET) — نتركها فارغة عمداً
      // لكن الرسالة التي نتحقّق منها هي STORAGE_DRIVER · لأنّها الحصريّة لـ§٢.
    });
    expect(r.exit).not.toBe(0);              // Refused startup
    expect(r.stderr).toContain('STORAGE_DRIVER');  // اسم المتغيّر معلَن
    expect(r.stderr).toContain('memory');           // القيمة (ليست سرّاً — enum value)
    expect(r.stderr).toMatch(/production/i);
    // لا نطبع أيّ سرّ — الاختبار يفحص فقط أسماء المتغيّرات.
  });

  it('production + STORAGE_DRIVER unset (default=memory) ⇒ إقلاع مرفوض كذلك (§٢ حرفيّاً)', () => {
    const r = runConfigLoad({
      NODE_ENV: 'production',
      STORAGE_DRIVER: undefined,   // deployer forgot the var
    });
    expect(r.exit).not.toBe(0);
    expect(r.stderr).toContain('STORAGE_DRIVER');
  });

  it('development + STORAGE_DRIVER=memory ⇒ إقلاع يمرّ (لا مسّ لـdev)', () => {
    const r = runConfigLoad({
      NODE_ENV: 'development',
      STORAGE_DRIVER: 'memory',
    });
    expect(r.stdout).toContain('CONFIG_LOADED_OK');
    expect(r.exit).toBe(0);
  });

  it('test env + STORAGE_DRIVER=memory ⇒ إقلاع يمرّ (لا مسّ لـtest)', () => {
    const r = runConfigLoad({
      NODE_ENV: 'test',
      STORAGE_DRIVER: 'memory',
    });
    expect(r.stdout).toContain('CONFIG_LOADED_OK');
    expect(r.exit).toBe(0);
  });
});
