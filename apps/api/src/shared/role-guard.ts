/**
 * role-guard — يفرض دور المستخدم من req.auth.role.
 * docs/16 §1.9 يحدّد سبعة أدوار. الحارس بسط مجموعة (لا تسلسل رقمي)
 * لأن الحقوق ليست خطّية دائماً (approver vs reviewer).
 */
import type { FastifyRequest } from 'fastify';
import { InsufficientRole, Unauthorized } from '../errors.js';

export type Role =
  | 'owner' | 'admin' | 'writer' | 'editor'
  | 'reviewer' | 'approver' | 'viewer';

export function requireRoleIn(req: FastifyRequest, allowed: Role[]): void {
  if (!req.auth) throw Unauthorized();
  if (!allowed.includes(req.auth.role as Role)) throw InsufficientRole();
}
