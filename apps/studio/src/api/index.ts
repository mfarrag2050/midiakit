// نقطة استيراد موحّدة لطبقة الـAPI. طريقة الاستعمال المستقبلية:
//
//   import { api } from '@/src/api';
//   const kits = await api.brandKits.list({ limit: 20 });
//
// **لا يُستدعى من أيّ مكوّن قبل SYNC-α** (docs/17 §5) — مجرّد عقد
// جاهز للربط عند اكتمال mk-api.

export * as auth from './endpoints/auth';
export * as tenants from './endpoints/tenants';
export * as users from './endpoints/users';
export * as brandKits from './endpoints/brand-kits';
export * as templates from './endpoints/templates';
export * as projects from './endpoints/projects';
export * as assets from './endpoints/assets';
export * as renders from './endpoints/renders';
export * as workflows from './endpoints/workflows';
export * as annotations from './endpoints/annotations';
export * as revisions from './endpoints/revisions';
export * as subscription from './endpoints/subscription';
export * as usage from './endpoints/usage';
export * as ai from './endpoints/ai';

export { ApiError, parseApiError } from './errors';
export type { ApiErrorCode, ApiErrorShape } from './errors';
export type { Page } from './client';
export {
  setSessionInfo,
  getSessionUser,
  getSessionTenant,
  clearSessionInfo,
} from './session-info';
export { getAccessToken, clearSession } from './tokens';
export * from './types';
