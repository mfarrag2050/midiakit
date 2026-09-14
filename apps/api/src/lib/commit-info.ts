/**
 * commit-info — يشتقّ SHA للـcommit من الشجرة عند الإقلاع.
 *
 * ── لماذا لا من متغيّر بيئة ──────────────────
 * 260 §٢ (التحذير الحاكم): «متغيّرٌ يضبطه إنسان يمكن أن يكذب، وحقلٌ يكذب
 * أسوأ من حقلٍ غائب». نستعمل `git rev-parse HEAD` على CWD وقت الإقلاع.
 *
 * ── متى يعود null ─────────────────────────
 *   • CWD ليس git worktree (نسخة في /tmp بلا .git · حاوية runtime بلا git).
 *   • git rev-parse يفشل (permission · corrupt refs · إلخ).
 *
 * حقل غائب (null) أفضل من كذب.
 *
 * ── متى يُقاس ─────────────────────────────
 * cached at first call. الاستدعاء في server.ts:buildServer ⇒ مرّة واحدة
 * عند الإقلاع · قيمة ثابتة لعمر العمليّة. rebuild الشجرة لا يغيّرها بدون
 * إعادة تشغيل — وهذا مقصود (الحقل يعكس الـSHA الذي **بدأت** به العمليّة).
 */
import { execSync } from 'node:child_process';

// L-46 marker: تعديل بلا وظيفة للتمييز بين شجرتين في اختبار حياة 260.
let cached: string | null | undefined = undefined;

export function getCommit(): string | null {
  if (cached !== undefined) return cached;
  try {
    const raw = execSync('git rev-parse HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    cached = /^[a-f0-9]{40}$/.test(raw) ? raw : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** للاختبار — يمسح الـcache ليعاد قياس commit مرّة أخرى. */
export function _resetCommitCache(): void {
  cached = undefined;
}
