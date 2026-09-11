// أنواع مشتركة بين endpoints — تتبع docs/16 §1.9 و §3.
//
// **قاعدة العمق:** الأنواع هنا سطحية (id + الحقول الأساسية). التفاصيل
// الكاملة لكل مورد (brand_kit.config كامل، project.content كامل)
// تُشتق من `packages/shared` عند اكتمال ADR-011 والعقد الموحّد. حتى
// ذلك، الطبقة تعرف الشكل المرسَل عبر الشبكة لا شكل النموذج الداخلي.

export type Role =
  | 'owner'
  | 'admin'
  | 'writer'
  | 'editor'
  | 'reviewer'
  | 'approver'
  | 'viewer';

export type Locale = 'ar' | 'mixed' | 'en';

export type Plan = 'trial' | 'starter' | 'studio' | 'agency' | 'api';

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly plan: Plan;
  readonly locale: Locale;
  readonly createdAt: string;
  readonly seats: { readonly used: number; readonly limit: number };
}

export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly createdAt: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

/** ID prefixes موثَّقة في docs/16 §1 كنمط بديل عن UUID خام. */
export type Id<Prefix extends string> = `${Prefix}_${string}`;
export type TenantId = Id<'tnt'>;
export type UserId = Id<'usr'>;
export type BrandKitId = Id<'bk'>;
export type TemplateId = Id<'tpl'>;
export type ProjectId = Id<'prj'>;
export type AssetId = Id<'ast'>;
export type RenderId = Id<'rnd'>;
export type WorkflowId = Id<'wf'>;
export type AnnotationId = Id<'ann'>;
export type RevisionId = Id<'rev'>;
