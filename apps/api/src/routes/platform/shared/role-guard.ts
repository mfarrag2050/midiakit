/**
 * platform role-guard (A28) — يفرض دور المستخدم على platform routes.
 * req.platformAuth يُضبَط من platform-auth-guard قبل هذا الاستدعاء.
 * دور غير متوقّع ⇒ 403 PLATFORM_INSUFFICIENT_ROLE (§1.4 موحّد).
 */
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../../errors.js';

export type PlatformRole = 'owner' | 'admin' | 'viewer';

export function requirePlatformRoleIn(req: FastifyRequest, allowed: PlatformRole[]): void {
  const role = req.platformAuth?.platformRole;
  if (!role || !allowed.includes(role as PlatformRole)) {
    throw new ApiError('PLATFORM_INSUFFICIENT_ROLE', 403);
  }
}
