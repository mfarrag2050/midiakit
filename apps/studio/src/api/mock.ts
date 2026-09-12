// طبقة mock لـmk-api — تُفعَّل بمتغيّر البيئة `NEXT_PUBLIC_API_MOCK=true`.
//
// **الغاية:** S5 يبني صفحات المصادقة على mocks قبل فتح SYNC-α.
// عند اكتمال A6-A8، إزالة المتغيّر تعيد المسار إلى الخدمة الحقيقية
// بلا تعديل صفحة.
//
// **قاعدة المحاذاة (S6-FIX · 2026-09-05):** الحقيقي يفوز. أسماء
// الأكواد هنا مطابقة حرفياً لـ`apps/api/src/errors.ts` في mk-api
// بعد `410cc33` — لا اختلاف في التسمية.
//
// **قواعد شكل الاستجابة:**
// - `error.code` UPPER_SNAKE من قائمة mk-api الرسمية.
// - `error.message` يأتي بادئته `errors.` — مفتاح i18n جاهز
//   (L-22 · docs/16 §1.4). الواجهة لا تضيف بادئة ثانية.
// - `error.field` مطابق لـzod path الذي فشل، أو null للعام.
// - `POST /v1/auth/refresh` يعيد الشكل المفروش (بلا `session:`).
//
// **المُشغِّلات المعلَنة (اختبار كل حالة عبر الواجهة):**
//   POST /v1/auth/login
//     email=throttle@x.com     → 429 TOO_MANY_ATTEMPTS
//     email=suspended@x.com    → 403 ACCOUNT_DISABLED
//     password === 'letmein12345' → 200 success
//     أي كلمة سر أخرى           → 401 INVALID_CREDENTIALS
//   POST /v1/auth/signup
//     email=taken@x.com        → 409 EMAIL_TAKEN (field=email)
//     email مشوَّه              → 400 EMAIL_INVALID (field=email)
//     password.length < 12     → 400 PASSWORD_TOO_WEAK (field=password)
//     tenantName فارغ          → 400 TENANT_NAME_EMPTY (field=name)
//     otherwise                → 201 success
//   POST /v1/auth/forgot-password
//     دائماً                    → 204 (لا يكشف وجود البريد)
//   POST /v1/auth/reset-password
//     token=expired            → 400 RESET_TOKEN_EXPIRED (field=token)
//     token=used               → 400 RESET_TOKEN_USED (field=token)
//     token=invalid            → 400 RESET_TOKEN_INVALID (field=token)
//     newPassword.length < 12  → 400 PASSWORD_TOO_WEAK (field=newPassword)
//     otherwise                → 204
//   POST /v1/auth/refresh
//     refreshToken غير معلوم    → 401 REFRESH_TOKEN_INVALID
//     otherwise                → 200 { accessToken, refreshToken, expiresIn }

import { ApiError } from './errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_API_MOCK === 'true';
}

export interface MockResult {
  readonly status: number;
  readonly body: unknown;
}

function ok(status: number, body: unknown = null): MockResult {
  return { status, body };
}

function err(
  status: number,
  code: string,
  field: string | null = null
): never {
  throw new ApiError({
    code,
    // Bridge with mk-api: message = 'errors.' + code (i18n key ready).
    messageKey: `errors.${code}`,
    field,
    requestId: `req_mock_${Date.now().toString(36)}`,
    status,
  });
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** يستلم path + method + body ويعيد نتيجة mock أو يرمي ApiError.
 *  يُستدعى فقط حين `isMockEnabled()`. */
// In-memory stores للأصول والقوالب والهويات — كي تظهر في القوائم بعد
// الإنشاء الوهمي، وتتماسك عبر تدفّق واحد (upload → finalize → list).
interface MockAsset {
  id: string;
  kind: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  licenseAck?: boolean;
  meta?: Record<string, unknown>;
}
const MOCK_ASSETS = new Map<string, MockAsset>();
// IMAGE-VERTICAL: seed أصل صورة واحد كي تعمل جربة UI بعد أيّ page.goto
// (state داخل الـtab يُفقد عند full reload).
MOCK_ASSETS.set('ast_seed_image', {
  id: 'ast_seed_image',
  kind: 'image',
  filename: 'seed-demo.png',
  sizeBytes: 113108,
  createdAt: new Date().toISOString(),
});

// FONT-PICKER (§3 من 100-BRAND-KIT-EDITOR): seed خطَّان كي يظهر
// المنتقي بخيارات حقيقيّة على mock. `meta.family` هي القيمة المعروضة
// للمستخدم; `assetId` هو ما يُحفَظ في patch كما اشترط `_AMEND-100`.
MOCK_ASSETS.set('ast_seed_font_ibm', {
  id: 'ast_seed_font_ibm',
  kind: 'font',
  filename: 'IBMPlexSansArabic-Regular.ttf',
  sizeBytes: 234000,
  createdAt: new Date().toISOString(),
  meta: { family: 'IBM Plex Sans Arabic', source: 'builtin' },
});
MOCK_ASSETS.set('ast_seed_font_almarai', {
  id: 'ast_seed_font_almarai',
  kind: 'font',
  filename: 'Almarai-Regular.ttf',
  sizeBytes: 189000,
  createdAt: new Date().toISOString(),
  meta: { family: 'Almarai', source: 'custom' },
});

interface MockTemplate {
  id: string;
  scope: 'global' | 'tenant';
  name: string;
  kind: 'static' | 'video';
  definition: unknown;
  createdAt: string;
  updatedAt: string;
}
const MOCK_TEMPLATES = new Map<string, MockTemplate>();
// Seed 6 global templates (نمط mk-api الحقيقي بعد seed migration).
// حقول `definition.fields` تُشغّل محرّر المحتوى في S12. مطابق شكل
// packages/templates TemplateFieldBase: مفتاح `key` (لا id) — كما
// يُعيده mk-api الحقيقي بعد A13.
interface TemplateField {
  key: string;
  label?: string;
  type: 'text' | 'richtext' | 'multiline';
  required?: boolean;
}
const SEED_TEMPLATES: Array<[string, 'static' | 'video', TemplateField[]]> = [
  ['بسيط — إثبات بوابة المرحلة 2', 'static', [
    { key: 'headline', label: 'العنوان', type: 'richtext', required: true },
    { key: 'source', label: 'المصدر', type: 'text' },
  ]],
  ['بطاقة ذات كيكر', 'static', [
    { key: 'kicker', label: 'كيكر', type: 'text' },
    { key: 'headline', label: 'العنوان', type: 'richtext', required: true },
    { key: 'source', label: 'المصدر', type: 'text' },
  ]],
  ['بطاقة سفلية', 'static', [
    { key: 'headline', label: 'العنوان', type: 'richtext', required: true },
    { key: 'byline', label: 'الكاتب', type: 'text' },
    { key: 'source', label: 'المصدر', type: 'text' },
  ]],
  ['بطاقة متمركزة', 'static', [
    { key: 'headline', label: 'العنوان', type: 'richtext', required: true },
    { key: 'subtitle', label: 'العنوان الفرعي', type: 'text' },
  ]],
  ['بطاقة عاجل', 'static', [
    { key: 'headline', label: 'خبر عاجل', type: 'richtext', required: true },
  ]],
  ['ريلز', 'video', [
    { key: 'headline', label: 'عنوان المقطع', type: 'richtext', required: true },
    { key: 'caption', label: 'الوصف', type: 'multiline' },
  ]],
];
// طبقات افتراضية بسيطة لكل قالب — تكفي لتشغيل `renderFrame` في المعاينة
// (S13). مطابقة شكل packages/templates/data/plain.json.
const DEFAULT_LAYERS: unknown[] = [
  { type: 'solid', fill: 'brand.colors.surface' },
  {
    type: 'headline',
    field: 'headline',
    wrap: 'uniform',
    align: 'right',
    anchor: 'centerLower',
    verticalAnchor: 0.5,
    font: 'brand.typography.breaking',
    justify: 'brand.typography.justify',
  },
];
// IMAGE-VERTICAL: طبقات مع صورة خلفيّة + fallback + عنوان — لاختبار المسار كاملاً.
const IMAGE_LAYERS: unknown[] = [
  {
    type: 'image',
    field: 'image',
    fit: 'cover',
    fallback: [{ type: 'solid', fill: 'brand.colors.surface' }],
  },
  { type: 'gradient', direction: 'bottom' },
  {
    type: 'headline',
    field: 'headline',
    wrap: 'uniform',
    align: 'right',
    anchor: 'centerLower',
    verticalAnchor: 0.5,
    font: 'brand.typography.breaking',
    justify: 'brand.typography.justify',
  },
];
SEED_TEMPLATES.forEach(([name, kind, fields], i) => {
  const id = `tpl_mock_g${i}`;
  // IMAGE-VERTICAL: أضِف حقل صورة اختياريّاً إلى القالب الأول ("بسيط")
  // كي تجربة UI/preview تُظهر مسار الصورة كاملاً.
  const withImage = i === 0
    ? [...fields, { key: 'image', label: 'الصورة', type: 'image', required: false } as TemplateField]
    : fields;
  const layers = i === 0 ? IMAGE_LAYERS : DEFAULT_LAYERS;
  MOCK_TEMPLATES.set(id, {
    id,
    scope: 'global',
    name,
    kind,
    definition: { fields: withImage, layers, sizes: ['x', 'instagram', 'feed'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

interface MockBrandKit {
  id: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
const MOCK_BRAND_KITS = new Map<string, MockBrandKit>();
// Seed هوية افتراضية + هوية «خارجية» لاختبار مسار UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS.
MOCK_BRAND_KITS.set('bk_mock_default', {
  id: 'bk_mock_default',
  name: 'هوية العرض',
  config: {
    direction: 'rtl',
    locale: 'ar',
    fonts: {
      primary: {
        family: 'IBM Plex Sans Arabic',
        source: 'builtin',
        weights: {
          regular: { assetId: 'ast_seed_font_ibm', value: 400, url: '' },
        },
      },
    },
    colors: {
      text: '#111111',
      accent: '#B78D2E',
      urgentBadge: '#FFFFFF',
      urgentBg: '#B21F1F',
      urgentBgTint: '#DA8E8E',
      locationBadge: '#111111',
      surface: '#FFFFFF',
    },
    logo: {
      url: '/mock/logo-agency.svg',
      size: 60,
      position: 'bottom-left',
    },
    typography: { bidi: { enabled: true, numerals: 'arabic' } },
    assets: { version: '2026.01', autoUpdate: false },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
MOCK_BRAND_KITS.set('bk_mock_external', {
  id: 'bk_mock_external',
  name: 'هوية بأصول خارجية',
  config: {
    fonts: { primary: { family: 'Almarai', source: 'external', src: 'https://example.com/almarai.woff2' } },
    assets: { version: '2026.01', autoUpdate: false },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
// S13 — هوية بأرقام عربية-هندية لاختبار العزل عن DigitStyle.
MOCK_BRAND_KITS.set('bk_mock_arabic', {
  id: 'bk_mock_arabic',
  name: 'هوية بأرقام عربية-هندية',
  config: {
    fonts: { primary: { family: 'IBM Plex Sans Arabic', source: 'builtin' } },
    assets: { version: '2026.01', autoUpdate: false },
    typography: { bidi: { enabled: true, numerals: 'arabic' } },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ── §7 Projects — mock store ───────────────────────────────
// `updatedAt` يعمل ETag لـIf-Match (§7.4 · §12). كل PATCH يحدّثه
// ويضيف revision. عند revision-N يُلتقط snapshot (كل 10 — §10).
interface MockProjectHistoryItem {
  transitionId: string;
  from: string;
  to: string;
  actorId: string | null;
  reason: string | null;
  at: string;
}
interface MockProject {
  id: string;
  title: string;
  brand_kit_id: string;
  template_id: string;
  workflow_id: string;
  currentState: string;
  assigneeId: string | null;
  content: Record<string, unknown>;
  locale: string;
  createdAt: string;
  updatedAt: string;
  history: MockProjectHistoryItem[];
  hasRenders: boolean;
  brandHasExternalAssets: boolean;
}
const MOCK_PROJECTS = new Map<string, MockProject>();

// ── §10 Revisions — mock store (مفهرس بالمورد+id) ────────
interface MockRevision {
  id: string;
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  op: 'insert' | 'update' | 'delete';
  diff: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  hasSnapshot: boolean;
  reason: string | null;
  createdAt: string;
}
const MOCK_REVISIONS: MockRevision[] = [];
let REV_SEQ = 0;

// ── §11 Workflows — mock (workflow افتراضي واحد) ─────────
interface MockWorkflowState {
  id: string;
  label: string;
  assignableTo: string[];
}
interface MockWorkflowTransition {
  id: string;
  from: string;
  to: string;
  label: string;
  requiredRole: string;
  requiresReason: boolean;
}
interface MockWorkflow {
  id: string;
  name: string;
  isDefault: boolean;
  states: MockWorkflowState[];
  transitions: MockWorkflowTransition[];
}
const DEFAULT_WORKFLOW: MockWorkflow = {
  id: 'wfl_default',
  name: 'individual',
  isDefault: true,
  states: [
    { id: 'draft', label: 'مسودّة', assignableTo: ['writer', 'editor'] },
    { id: 'review', label: 'قيد المراجعة', assignableTo: ['reviewer'] },
    { id: 'approved', label: 'معتمد', assignableTo: [] },
    { id: 'archived', label: 'مؤرشف', assignableTo: [] },
  ],
  transitions: [
    { id: 'trn_submit',   from: 'draft',    to: 'review',   label: 'إرسال للمراجعة', requiredRole: 'writer',   requiresReason: false },
    { id: 'trn_return',   from: 'review',   to: 'draft',    label: 'إرجاع للتحرير',  requiredRole: 'reviewer', requiresReason: true  },
    { id: 'trn_approve',  from: 'review',   to: 'approved', label: 'اعتماد',        requiredRole: 'reviewer', requiresReason: false },
    { id: 'trn_archive',  from: 'approved', to: 'archived', label: 'أرشفة',         requiredRole: 'admin',    requiresReason: false },
  ],
};
const MOCK_WORKFLOWS = new Map<string, MockWorkflow>([[DEFAULT_WORKFLOW.id, DEFAULT_WORKFLOW]]);

// ── §12 Annotations — mock store ─────────────────────────
interface MockAnnotation {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  target: { kind: 'layer'; layer: string; segmentIndex: number };
  resolved: boolean;
  createdAt: string;
}
const MOCK_ANNOTATIONS = new Map<string, MockAnnotation>();

// دور «المستخدم الحالي» في mock — يُبدَّل عبر مُشغِّل خاصّ في العنوان.
// حالة افتراضية: reviewer (يستطيع submit/return/approve).
// يُبدَّل إلى writer عبر titles تحتوي «[role:writer]».
function inferActorRole(projectTitle: string): string {
  const m = /\[role:([a-z]+)\]/.exec(projectTitle);
  return m ? (m[1] ?? 'reviewer') : 'reviewer';
}

// ترتيب الأدوار — من الأقلّ إلى الأكثر امتيازاً. writer أقلّ من editor
// أقلّ من reviewer أقلّ من admin. القاعدة: role الحالي ≥ requiredRole
// = مسموح. غير ذلك = 403 TRANSITION_ROLE_REQUIRED.
const ROLE_RANK: Record<string, number> = {
  writer: 1,
  editor: 2,
  reviewer: 3,
  admin: 4,
};
function roleGE(actor: string, required: string): boolean {
  return (ROLE_RANK[actor] ?? 0) >= (ROLE_RANK[required] ?? 0);
}

// presets تُبنى على العميل ثم تُرسَل بـPOST. mock يستقبلها كما هي —
// لا بذر خادم-جانب (تنبيه mk-api رقم ٢ للاستوديو).
// —— لا نُصدّرها لأن الواجهة تحمل presets خاصةً بها.

// ── §8 Renders — mock store ───────────────────────────────
interface MockRender {
  id: string;
  project_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  size: string;
  format: 'png' | 'mp4';
  output_url: string | null;
  duration_ms: number | null;
  brand_snapshot_id: string;
  template_snapshot_id: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  queuedAt: string;
}
const MOCK_RENDERS = new Map<string, MockRender>();
// S17 seed — عيّنة رندر «قيد التنفيذ» تُتيح التقاط لقطة الطابور + إلغاء
// دون الاعتماد على تدفّق «افتح مشروع ⇒ تصدير ⇒ انتظر». الرندر يبقى
// في `running` طالماً لم يُطلب GET :id (لا trigger زمني هنا).
{
  const now = new Date();
  const later = new Date(now.getTime() + 5 * 60 * 1000); // بعيداً في المستقبل
  MOCK_RENDERS.set('rnd_seed_q', {
    id: 'rnd_seed_q',
    project_id: 'prj_seed',
    status: 'queued',
    size: 'feed',
    format: 'png',
    output_url: null,
    duration_ms: null,
    brand_snapshot_id: 'bks_seed_q',
    template_snapshot_id: 'tks_seed_q',
    createdAt: now.toISOString(),
    startedAt: null,
    completedAt: null,
    queuedAt: later.toISOString(), // مستقبلاً ⇒ يبقى queued
  });
}

// ── §13 Subscription + §14 Usage — mock stores ───────────
// حدود ثابتة كما لو كنّا على باقة `starter`. quotas.videos.limit تحوّل
// إلى 'unlimited' إن أُريد تجريب مسار PLAN_LIMIT.
interface MockSubscription {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  seats: { used: number; limit: number };
  quotas: {
    brandKits: { used: number; limit: number };
    videos: { used: number; limit: number };
    renders: { used: number; limit: number };
  };
  cancelAtPeriodEnd: boolean;
}
const MOCK_SUB: MockSubscription = {
  plan: 'starter',
  status: 'active',
  currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
  seats: { used: 3, limit: 5 },
  quotas: {
    brandKits: { used: 2, limit: 10 },
    videos: { used: 8, limit: 50 },
    renders: { used: 42, limit: 500 },
  },
  cancelAtPeriodEnd: false,
};

// ── §15 AI integrations — mock store ─────────────────────
interface MockAiIntegration {
  provider: string;
  apiKeyRef: string;
  enabled: boolean;
  capabilities: string[];
  configuredAt: string;
  configuredBy: string;
}
const MOCK_AI_INT = new Map<string, MockAiIntegration>();

function projShape(p: MockProject, full: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: p.id,
    title: p.title,
    brand_kit_id: p.brand_kit_id,
    template_id: p.template_id,
    currentState: p.currentState,
    assigneeId: p.assigneeId,
    updatedAt: p.updatedAt,
  };
  if (full) {
    base.content = p.content;
    base.locale = p.locale;
    base.workflow_id = p.workflow_id;
    base.createdAt = p.createdAt;
  }
  return base;
}

function addRevision(
  resourceType: string,
  resourceId: string,
  op: 'insert' | 'update' | 'delete',
  diff: Record<string, unknown> | null,
  actorId: string | null,
  reason: string | null,
  snapshot: Record<string, unknown> | null
): void {
  REV_SEQ += 1;
  const hasSnapshot = REV_SEQ % 10 === 0 || op === 'insert' || snapshot !== null;
  MOCK_REVISIONS.push({
    id: `rev_mock_${REV_SEQ.toString(36)}`,
    resourceType,
    resourceId,
    actorId,
    op,
    diff,
    snapshot: hasSnapshot ? snapshot : null,
    hasSnapshot,
    reason,
    createdAt: new Date().toISOString(),
  });
}

function defaultKitConfig(): Record<string, unknown> {
  return {
    fonts: { primary: { family: 'IBM Plex Sans Arabic', source: 'builtin' } },
    assets: { version: '2026.01', autoUpdate: false },
  };
}

function mockAssetShape(a: MockAsset, withPublicUrl: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: a.id,
    kind: a.kind,
    filename: a.filename,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt,
    ...(a.licenseAck !== undefined ? { licenseAck: a.licenseAck } : {}),
    ...(a.meta ? { meta: a.meta } : {}),
  };
  if (withPublicUrl) {
    // IMAGE-VERTICAL: للصور نُشير إلى /dev/mock-image الذي يخدم PNG حقيقياً
    // (المتصفح لا يقبل مخطط mock:// لصور). لسائر الأنواع نُبقي المخطط الوهمي.
    base.publicUrl = a.kind === 'image' ? `/dev/mock-image/${a.id}` : `mock://public/${a.id}`;
    base.publicUrlExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }
  return base;
}

export async function handleMock(
  method: string,
  path: string,
  body: unknown,
  headers?: Readonly<Record<string, string>>
): Promise<MockResult> {
  // تأخير 200ms لمحاكاة زمن الشبكة — كي تُرى حالة loading في المتصفح.
  await delay(200);

  const key = `${method} ${path}`;
  const b = (body ?? {}) as Record<string, unknown>;
  const ifMatch = headers?.['if-match'] ?? headers?.['If-Match'];

  // ── Assets (§9): مسارات ديناميكية تُعالَج قبل switch. ─────────
  // POST /v1/assets/:id/finalize
  const finalizeMatch = /^POST \/v1\/assets\/([^/]+)\/finalize$/.exec(key);
  if (finalizeMatch) {
    const id = finalizeMatch[1] ?? '';
    const asset = MOCK_ASSETS.get(id);
    if (!asset) err(404, 'UPLOAD_NOT_COMPLETED');
    const filename = asset.filename;
    // مُشغِّل SVG_HAS_TEXT: filename ينتهي بـ.svg و اسمه يحوي 'text'.
    const ack = Array.isArray(b.acknowledgedWarnings)
      ? (b.acknowledgedWarnings as string[])
      : [];
    if (filename.endsWith('.svg') && filename.includes('text') && !ack.includes('SVG_HAS_TEXT')) {
      err(400, 'INVALID_SVG_WITH_TEXT_WARNING');
    }
    // license ack إلزامي للخطوط و lottie.
    if (asset.kind === 'font' || asset.kind === 'lottie') {
      if (b.licenseAck !== true) err(422, 'LICENSE_ACK_MUST_BE_TRUE', 'licenseAck');
    }
    asset.licenseAck = b.licenseAck === true;
    asset.meta = (b.meta as Record<string, unknown>) ?? asset.meta ?? {};
    const shape = mockAssetShape(asset, true);
    if (filename.endsWith('.svg') && filename.includes('text')) {
      shape.warnings = [
        { code: 'SVG_HAS_TEXT', message: 'errors.INVALID_SVG_WITH_TEXT_WARNING' },
      ];
    }
    return ok(200, shape);
  }

  // POST /v1/assets/:id/refresh-url
  const refreshUrlMatch = /^POST \/v1\/assets\/([^/]+)\/refresh-url$/.exec(key);
  if (refreshUrlMatch) {
    const id = refreshUrlMatch[1] ?? '';
    if (!MOCK_ASSETS.has(id)) err(404, 'NOT_FOUND');
    return ok(200, {
      publicUrl: `mock://public/${id}?ts=${Date.now()}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }

  // GET /v1/assets/:id
  const getMatch = /^GET \/v1\/assets\/([^/]+)$/.exec(key);
  if (getMatch) {
    const id = getMatch[1] ?? '';
    const a = MOCK_ASSETS.get(id);
    if (!a) err(404, 'NOT_FOUND');
    return ok(200, mockAssetShape(a, true));
  }

  // DELETE /v1/assets/:id
  const deleteMatch = /^DELETE \/v1\/assets\/([^/]+)$/.exec(key);
  if (deleteMatch) {
    const id = deleteMatch[1] ?? '';
    if (!MOCK_ASSETS.has(id)) err(404, 'NOT_FOUND');
    MOCK_ASSETS.delete(id);
    return ok(204);
  }

  // ── Templates (§6) ─────────────────────────────────────────
  const tplGet = /^GET \/v1\/templates\/([^/]+)$/.exec(key);
  if (tplGet) {
    const id = tplGet[1] ?? '';
    const t = MOCK_TEMPLATES.get(id);
    if (!t) err(404, 'NOT_FOUND');
    return ok(200, t);
  }
  const tplPatch = /^PATCH \/v1\/templates\/([^/]+)$/.exec(key);
  if (tplPatch) {
    const id = tplPatch[1] ?? '';
    const t = MOCK_TEMPLATES.get(id);
    if (!t) err(404, 'NOT_FOUND');
    if (t.scope === 'global') err(403, 'GLOBAL_TEMPLATE_READONLY');
    Object.assign(t, b, { updatedAt: new Date().toISOString() });
    return ok(200, t);
  }
  const tplDel = /^DELETE \/v1\/templates\/([^/]+)$/.exec(key);
  if (tplDel) {
    const id = tplDel[1] ?? '';
    const t = MOCK_TEMPLATES.get(id);
    if (!t) err(404, 'NOT_FOUND');
    if (t.scope === 'global') err(403, 'GLOBAL_TEMPLATE_READONLY');
    MOCK_TEMPLATES.delete(id);
    return ok(204);
  }

  // ── Brand kits (§5) ────────────────────────────────────────
  const bkGet = /^GET \/v1\/brand-kits\/([^/]+)$/.exec(key);
  if (bkGet) {
    const id = bkGet[1] ?? '';
    const k = MOCK_BRAND_KITS.get(id);
    if (!k) err(404, 'NOT_FOUND');
    return ok(200, k);
  }
  const bkPatch = /^PATCH \/v1\/brand-kits\/([^/]+)$/.exec(key);
  if (bkPatch) {
    const id = bkPatch[1] ?? '';
    const k = MOCK_BRAND_KITS.get(id);
    if (!k) err(404, 'NOT_FOUND');
    // §5.4 blocked paths: يمنع تعديل assets.version + fonts.primary.licenseAck.
    // نمط تحقّق مبسّط: نرفض أيّ patch يذكر هذه الأسماء.
    const patchStr = JSON.stringify(b);
    if (/"assets"[\s\S]*"version"/.test(patchStr)) err(400, 'IMMUTABLE_FIELD', 'assets.version');
    if (/"licenseAck"/.test(patchStr)) err(400, 'IMMUTABLE_FIELD', 'fonts.primary.licenseAck');
    // RFC 7396: مسار top-level يعكس شكل المورد. `name` حقل عليا، لا داخل config.
    const bMap = b as Record<string, unknown>;
    if ('name' in bMap) {
      if (typeof bMap.name !== 'string' || bMap.name.trim() === '') {
        err(400, 'VALIDATION_FAILED', 'name');
      }
      k.name = bMap.name as string;
    }
    // كل ما ليس top-level identity يُدمج في config (سطحيّ كافٍ لـMVP).
    const { name: _n, id: _i, createdAt: _c, updatedAt: _u, ...configPatch } =
      bMap as {
        name?: unknown;
        id?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      };
    if (Object.keys(configPatch).length > 0) {
      k.config = { ...k.config, ...configPatch };
    }
    k.updatedAt = new Date().toISOString();
    return ok(200, k);
  }
  const bkDel = /^DELETE \/v1\/brand-kits\/([^/]+)$/.exec(key);
  if (bkDel) {
    const id = bkDel[1] ?? '';
    if (!MOCK_BRAND_KITS.has(id)) err(404, 'NOT_FOUND');
    MOCK_BRAND_KITS.delete(id);
    return ok(204);
  }
  const bkFontAck = /^POST \/v1\/brand-kits\/([^/]+)\/fonts\/([^/]+)\/ack$/.exec(key);
  if (bkFontAck) {
    const id = bkFontAck[1] ?? '';
    const family = bkFontAck[2] ?? '';
    const k = MOCK_BRAND_KITS.get(id);
    if (!k) err(404, 'NOT_FOUND');
    if (b.licenseAck !== true) err(422, 'LICENSE_ACK_MUST_BE_TRUE', 'licenseAck');
    if (typeof b.acknowledgedBy !== 'string' || !b.acknowledgedBy) {
      err(400, 'VALIDATION_FAILED', 'acknowledgedBy');
    }
    // في mock نتساهل: نقبل أيّ family (خلافاً لـmk-api الذي يطلب custom source).
    const fonts = (k.config.fonts as Record<string, unknown>) ?? {};
    const primary = { ...((fonts.primary as Record<string, unknown>) ?? {}) };
    primary.family = family;
    primary.source = 'custom';
    primary.licenseAck = true;
    primary.ackBy = String(b.acknowledgedBy);
    primary.ackAt = new Date().toISOString();
    if (typeof b.notes === 'string') primary.ackNotes = b.notes;
    k.config = { ...k.config, fonts: { ...fonts, primary } };
    return ok(200, { fonts: { primary } });
  }
  const bkAssetsVer = /^POST \/v1\/brand-kits\/([^/]+)\/assets-version$/.exec(key);
  if (bkAssetsVer) {
    const id = bkAssetsVer[1] ?? '';
    const k = MOCK_BRAND_KITS.get(id);
    if (!k) err(404, 'NOT_FOUND');
    const targetVersion = String(b.targetVersion ?? '');
    if (!/^\d{4}\.(0[1-9]|1[0-2])$/.test(targetVersion)) {
      err(400, 'INVALID_VERSION_FORMAT', 'targetVersion');
    }
    if (b.acknowledgedDiff !== true) err(409, 'DIFF_NOT_ACKNOWLEDGED');
    const nextAssets = { version: targetVersion, autoUpdate: false };
    k.config = { ...k.config, assets: nextAssets };
    return ok(200, { assets: nextAssets });
  }

  // ── Projects (§7) ─────────────────────────────────────────
  const prjGet = /^GET \/v1\/projects\/([^/]+)$/.exec(key);
  if (prjGet) {
    const id = prjGet[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    return ok(200, projShape(p, true));
  }

  const prjPatch = /^PATCH \/v1\/projects\/([^/]+)$/.exec(key);
  if (prjPatch) {
    const id = prjPatch[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    // §12 (concurrency): PATCH يستلزم If-Match. الغياب = 428 IF_MATCH_REQUIRED.
    if (!ifMatch) err(428, 'IF_MATCH_REQUIRED');
    if (ifMatch !== p.updatedAt) err(409, 'STALE_UPDATE');
    // منع تعديل الحقول الثابتة (§7.4).
    for (const k of ['id', 'tenant_id', 'createdAt', 'currentState']) {
      if (k in b) err(400, 'IMMUTABLE_FIELD', k);
    }
    const before = { title: p.title, content: JSON.parse(JSON.stringify(p.content)) as Record<string, unknown> };
    if (typeof b.title === 'string') p.title = b.title;
    if (b.content && typeof b.content === 'object') {
      p.content = { ...p.content, ...(b.content as Record<string, unknown>) };
    }
    if ('assigneeId' in b) p.assigneeId = (b.assigneeId as string | null) ?? null;
    p.updatedAt = new Date().toISOString();
    const after = { title: p.title, content: p.content };
    addRevision('projects', p.id, 'update', { before, after }, 'usr_mock', null, null);
    return ok(200, projShape(p, true));
  }

  const prjDel = /^DELETE \/v1\/projects\/([^/]+)$/.exec(key);
  if (prjDel) {
    const id = prjDel[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    if (p.hasRenders) err(409, 'PROJECT_HAS_RENDERS');
    addRevision('projects', p.id, 'delete', null, 'usr_mock', null, null);
    MOCK_PROJECTS.delete(id);
    return ok(204);
  }

  // §11.6 GET /v1/projects/:id/state
  const prjState = /^GET \/v1\/projects\/([^/]+)\/state$/.exec(key);
  if (prjState) {
    const id = prjState[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    const wf = MOCK_WORKFLOWS.get(p.workflow_id);
    if (!wf) err(404, 'WORKFLOW_NOT_FOUND');
    const available = wf.transitions
      .filter((t) => t.from === p.currentState)
      .map((t) => ({ id: t.id, to: t.to, label: t.label, requiresReason: t.requiresReason }));
    return ok(200, {
      projectId: p.id,
      workflowId: wf.id,
      currentState: p.currentState,
      assigneeId: p.assigneeId,
      availableTransitions: available,
      history: p.history,
    });
  }

  // §11.7 POST /v1/projects/:id/transitions
  const prjTrn = /^POST \/v1\/projects\/([^/]+)\/transitions$/.exec(key);
  if (prjTrn) {
    const id = prjTrn[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    const wf = MOCK_WORKFLOWS.get(p.workflow_id);
    if (!wf) err(404, 'WORKFLOW_NOT_FOUND');
    const trnId = String(b.transitionId ?? '');
    const trn = wf.transitions.find((t) => t.id === trnId);
    if (!trn) err(404, 'NOT_FOUND', 'transitionId');
    if (trn.from !== p.currentState) err(409, 'TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE');
    // دور المستخدم مُستنتَج من عنوان المشروع (مُشغِّل mock). الدور
    // الفعلي يعيش في jwt claims على mk-api الحقيقي.
    const actorRole = inferActorRole(p.title);
    if (!roleGE(actorRole, trn.requiredRole)) {
      // 403 يحمل field=requiredRole لتُظهره الواجهة في الرسالة.
      err(403, 'TRANSITION_ROLE_REQUIRED', trn.requiredRole);
    }
    if (trn.requiresReason) {
      const reason = String(b.reason ?? '');
      if (reason.trim().length < 10) err(400, 'REASON_REQUIRED_FOR_THIS_TRANSITION', 'reason');
    }
    const from = p.currentState;
    p.currentState = trn.to;
    if ('assigneeId' in b) p.assigneeId = (b.assigneeId as string | null) ?? null;
    p.updatedAt = new Date().toISOString();
    p.history.push({
      transitionId: trn.id,
      from,
      to: trn.to,
      actorId: 'usr_mock',
      reason: (b.reason as string | null) ?? null,
      at: p.updatedAt,
    });
    const available = wf.transitions
      .filter((t) => t.from === p.currentState)
      .map((t) => ({ id: t.id, to: t.to, label: t.label, requiresReason: t.requiresReason }));
    return ok(200, {
      projectId: p.id,
      workflowId: wf.id,
      currentState: p.currentState,
      assigneeId: p.assigneeId,
      availableTransitions: available,
      history: p.history,
    });
  }

  // §11.8 POST /v1/projects/:id/assign
  const prjAssign = /^POST \/v1\/projects\/([^/]+)\/assign$/.exec(key);
  if (prjAssign) {
    const id = prjAssign[1] ?? '';
    const p = MOCK_PROJECTS.get(id);
    if (!p) err(404, 'NOT_FOUND');
    p.assigneeId = (b.assigneeId as string | null) ?? null;
    p.updatedAt = new Date().toISOString();
    return ok(200, { assigneeId: p.assigneeId });
  }

  // ── Revisions (§10) — نمط عام لخمسة موارد ────────────────
  const revList = /^GET \/v1\/(brand-kits|projects|templates|users|assets)\/([^/]+)\/revisions$/.exec(key);
  if (revList) {
    const resourceType = (revList[1] ?? '').replace(/-/g, '_');
    const resourceId = revList[2] ?? '';
    const rows = MOCK_REVISIONS
      .filter((r) => r.resourceType === resourceType && r.resourceId === resourceId)
      .sort((a, z) => (z.createdAt > a.createdAt ? 1 : -1))
      .map((r) => ({
        id: r.id,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actorId: r.actorId,
        op: r.op,
        diff: r.diff,
        hasSnapshot: r.hasSnapshot,
        createdAt: r.createdAt,
      }));
    return ok(200, { data: rows, nextCursor: null, hasMore: false });
  }

  const revGet = /^GET \/v1\/(brand-kits|projects|templates|users|assets)\/([^/]+)\/revisions\/([^/]+)$/.exec(key);
  if (revGet) {
    const resourceType = (revGet[1] ?? '').replace(/-/g, '_');
    const resourceId = revGet[2] ?? '';
    const revId = revGet[3] ?? '';
    const r = MOCK_REVISIONS.find((x) => x.id === revId && x.resourceType === resourceType && x.resourceId === resourceId);
    if (!r) err(404, 'REVISION_NOT_FOUND');
    // reconstructedState: نأخذ الحالة الحالية للمورد (mock بسيط — الحقيقي
    // يعيد بناء من snapshot + patches).
    let reconstructedState: Record<string, unknown> | null = null;
    if (resourceType === 'projects') {
      const p = MOCK_PROJECTS.get(resourceId);
      if (p) reconstructedState = projShape(p, true);
    }
    return ok(200, {
      id: r.id,
      reconstructedState,
      diff: r.diff,
      snapshot: r.snapshot,
      actorId: r.actorId,
      createdAt: r.createdAt,
    });
  }

  const revRestore = /^POST \/v1\/(brand-kits|projects|templates|users|assets)\/([^/]+)\/revisions\/([^/]+)\/restore$/.exec(key);
  if (revRestore) {
    const resourceType = (revRestore[1] ?? '').replace(/-/g, '_');
    const resourceId = revRestore[2] ?? '';
    const revId = revRestore[3] ?? '';
    const r = MOCK_REVISIONS.find((x) => x.id === revId && x.resourceType === resourceType && x.resourceId === resourceId);
    if (!r) err(404, 'REVISION_NOT_FOUND');
    const reason = String(b.reason ?? '');
    if (reason.trim().length < 10) err(400, 'REASON_TOO_SHORT', 'reason');
    // مُشغِّل RESTORE_WOULD_BREAK_REFERENCES: reason يحوي كلمة "break".
    if (reason.toLowerCase().includes('break')) err(409, 'RESTORE_WOULD_BREAK_REFERENCES');
    if (resourceType === 'projects') {
      const p = MOCK_PROJECTS.get(resourceId);
      if (!p) err(404, 'NOT_FOUND');
      // استعادة بسيطة: نضيف revision جديدة بنوع update.
      p.updatedAt = new Date().toISOString();
      addRevision('projects', resourceId, 'update', { restoredFrom: revId }, 'usr_mock', reason, null);
      return ok(200, projShape(p, true));
    }
    return ok(200, { restored: true });
  }

  // ── Workflows (§11) ───────────────────────────────────────
  const wfGet = /^GET \/v1\/workflows\/([^/]+)$/.exec(key);
  if (wfGet) {
    const id = wfGet[1] ?? '';
    const w = MOCK_WORKFLOWS.get(id);
    if (!w) err(404, 'NOT_FOUND');
    return ok(200, w);
  }
  const wfPatch = /^PATCH \/v1\/workflows\/([^/]+)$/.exec(key);
  if (wfPatch) {
    const id = wfPatch[1] ?? '';
    const w = MOCK_WORKFLOWS.get(id);
    if (!w) err(404, 'NOT_FOUND');
    // إعادة التحقّق: كل انتقال يشير إلى حالة موجودة.
    const nextStates = (b.states as MockWorkflowState[] | undefined) ?? w.states;
    const nextTrns = (b.transitions as MockWorkflowTransition[] | undefined) ?? w.transitions;
    const ids = new Set(nextStates.map((s) => s.id));
    for (let i = 0; i < nextTrns.length; i++) {
      const trn = nextTrns[i];
      if (!trn) continue;
      if (!ids.has(trn.from)) err(400, 'WORKFLOW_SCHEMA_VIOLATION', `transitions[${i}].from`);
      if (!ids.has(trn.to)) err(400, 'WORKFLOW_SCHEMA_VIOLATION', `transitions[${i}].to`);
    }
    if (typeof b.name === 'string') w.name = b.name;
    if (Array.isArray(nextStates)) w.states = nextStates;
    if (Array.isArray(nextTrns)) w.transitions = nextTrns;
    return ok(200, w);
  }
  const wfDel = /^DELETE \/v1\/workflows\/([^/]+)$/.exec(key);
  if (wfDel) {
    const id = wfDel[1] ?? '';
    const w = MOCK_WORKFLOWS.get(id);
    if (!w) err(404, 'NOT_FOUND');
    if (w.isDefault) err(409, 'CANNOT_DELETE_DEFAULT');
    // مستعمل؟ نتحقّق من كل المشاريع.
    for (const p of MOCK_PROJECTS.values()) {
      if (p.workflow_id === id) err(409, 'WORKFLOW_IN_USE');
    }
    MOCK_WORKFLOWS.delete(id);
    return ok(204);
  }

  // ── Annotations (§12) ─────────────────────────────────────
  const annList = /^GET \/v1\/projects\/([^/]+)\/annotations$/.exec(key);
  if (annList) {
    const projectId = annList[1] ?? '';
    if (!MOCK_PROJECTS.has(projectId)) err(404, 'NOT_FOUND');
    const rows = [...MOCK_ANNOTATIONS.values()]
      .filter((a) => a.projectId === projectId)
      .sort((a, z) => (a.createdAt > z.createdAt ? -1 : 1))
      .map((a) => ({
        id: a.id,
        authorId: a.authorId,
        target: a.target,
        body: a.body,
        resolved: a.resolved,
        createdAt: a.createdAt,
      }));
    return ok(200, { data: rows, nextCursor: null, hasMore: false });
  }
  const annCreate = /^POST \/v1\/projects\/([^/]+)\/annotations$/.exec(key);
  if (annCreate) {
    const projectId = annCreate[1] ?? '';
    const p = MOCK_PROJECTS.get(projectId);
    if (!p) err(404, 'NOT_FOUND');
    const target = (b.target ?? {}) as { kind?: string; layer?: string; segmentIndex?: number };
    const layer = String(target.layer ?? '');
    const segmentIndex = Number(target.segmentIndex ?? -1);
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
      err(400, 'INVALID_SEGMENT_INDEX', 'target.segmentIndex');
    }
    // تحقّق الطبقة من تعريف القالب.
    const tpl = MOCK_TEMPLATES.get(p.template_id);
    const def = (tpl?.definition as { fields?: Array<{ key: string }> } | undefined);
    const layers = new Set(def?.fields?.map((f) => f.key) ?? []);
    if (!layers.has(layer)) err(404, 'LAYER_NOT_FOUND', 'target.layer');
    const body = String(b.body ?? '');
    if (!body.trim()) err(400, 'VALIDATION_FAILED', 'body');
    if (body.length > 2000) err(400, 'VALIDATION_FAILED', 'body');
    const id = `ann_mock_${Date.now().toString(36)}`;
    const ann: MockAnnotation = {
      id,
      projectId,
      authorId: 'usr_mock',
      body,
      target: { kind: 'layer', layer, segmentIndex },
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    MOCK_ANNOTATIONS.set(id, ann);
    return ok(201, {
      id: ann.id,
      authorId: ann.authorId,
      target: ann.target,
      body: ann.body,
      resolved: ann.resolved,
      createdAt: ann.createdAt,
    });
  }
  const annPatch = /^PATCH \/v1\/projects\/([^/]+)\/annotations\/([^/]+)$/.exec(key);
  if (annPatch) {
    const annId = annPatch[2] ?? '';
    const a = MOCK_ANNOTATIONS.get(annId);
    if (!a) err(404, 'NOT_FOUND');
    if (typeof b.body === 'string') a.body = b.body;
    if (typeof b.resolved === 'boolean') a.resolved = b.resolved;
    return ok(200, {
      id: a.id,
      authorId: a.authorId,
      target: a.target,
      body: a.body,
      resolved: a.resolved,
      createdAt: a.createdAt,
    });
  }
  const annDel = /^DELETE \/v1\/projects\/([^/]+)\/annotations\/([^/]+)$/.exec(key);
  if (annDel) {
    const annId = annDel[2] ?? '';
    if (!MOCK_ANNOTATIONS.has(annId)) err(404, 'NOT_FOUND');
    MOCK_ANNOTATIONS.delete(annId);
    return ok(204);
  }

  // ── Renders (§8) ──────────────────────────────────────────
  const rndGet = /^GET \/v1\/renders\/([^/]+)$/.exec(key);
  if (rndGet) {
    const id = rndGet[1] ?? '';
    const r = MOCK_RENDERS.get(id);
    if (!r) err(404, 'NOT_FOUND');
    // انتقال حالة تدريجي: queued → running → succeeded.
    const ageMs = Date.now() - new Date(r.queuedAt).getTime();
    if (r.status === 'queued' && ageMs > 500) {
      r.status = 'running';
      r.startedAt = new Date().toISOString();
    }
    if (r.status === 'running' && ageMs > 2500) {
      r.status = 'succeeded';
      r.completedAt = new Date().toISOString();
      r.duration_ms = 1800;
      r.output_url = `mock://output/${r.id}.${r.format}`;
    }
    // نسخة سطحية — كي يرى React مرجعاً جديداً عبر polling (وإلا setState
    // على نفس المرجع = لا re-render).
    return ok(200, { ...r });
  }
  const rndOut = /^GET \/v1\/renders\/([^/]+)\/output$/.exec(key);
  if (rndOut) {
    const id = rndOut[1] ?? '';
    const r = MOCK_RENDERS.get(id);
    if (!r) err(404, 'NOT_FOUND');
    if (r.status !== 'succeeded') err(404, 'OUTPUT_NOT_READY');
    return ok(200, {
      url: r.output_url,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  }

  // §8.8 POST /v1/renders/:id/cancel — **202** مع {id, status:'canceled'}
  // (انحراف #S17-1 المعلَن — العقد يقول 204).
  const rndCancel = /^POST \/v1\/renders\/([^/]+)\/cancel$/.exec(key);
  if (rndCancel) {
    const id = rndCancel[1] ?? '';
    const r = MOCK_RENDERS.get(id);
    if (!r) err(404, 'NOT_FOUND');
    if (r.status === 'cancelled' || r.status === 'succeeded' || r.status === 'failed') {
      err(409, 'RENDER_ALREADY_TERMINAL');
    }
    r.status = 'cancelled';
    return ok(202, { id: r.id, status: 'cancelled' });
  }

  // §8.5 GET /v1/renders/:id/brand-snapshot — لقطة الهوية عند الرندر.
  const rndSnap = /^GET \/v1\/renders\/([^/]+)\/brand-snapshot$/.exec(key);
  if (rndSnap) {
    const id = rndSnap[1] ?? '';
    if (!MOCK_RENDERS.has(id)) err(404, 'NOT_FOUND');
    // نستعمل bk_mock_default كلقطة (mock مبسّط).
    return ok(200, { config: MOCK_BRAND_KITS.get('bk_mock_default')?.config ?? {} });
  }

  // §15 POST /v1/ai/integrations/:provider (DELETE)
  const aiDel = /^DELETE \/v1\/ai\/integrations\/([^/]+)$/.exec(key);
  if (aiDel) {
    const p = aiDel[1] ?? '';
    if (!MOCK_AI_INT.has(p)) err(404, 'NOT_FOUND');
    MOCK_AI_INT.delete(p);
    return ok(204);
  }

  switch (key) {
    case 'POST /v1/auth/signup': {
      const email = String(b.email ?? '');
      const password = String(b.password ?? '');
      const tenantName = String(b.tenantName ?? '');
      if (!tenantName.trim()) err(400, 'TENANT_NAME_EMPTY', 'name');
      if (!EMAIL_RE.test(email)) err(400, 'EMAIL_INVALID', 'email');
      if (password.length < 12) err(400, 'PASSWORD_TOO_WEAK', 'password');
      if (email === 'taken@x.com') err(409, 'EMAIL_TAKEN', 'email');
      // signup يعيد user كاملاً (فيه email) — بخلاف login. مقصود في العقد.
      return ok(201, {
        user: { id: 'usr_mock', email, role: 'owner' },
        tenant: { id: 'tnt_mock', name: tenantName, plan: 'trial' },
        session: {
          accessToken: 'mock.access.token',
          refreshToken: 'mock.refresh.token',
          expiresIn: 900,
        },
      });
    }

    case 'POST /v1/auth/login': {
      const email = String(b.email ?? '');
      const password = String(b.password ?? '');
      if (email === 'throttle@x.com') err(429, 'TOO_MANY_ATTEMPTS');
      if (email === 'suspended@x.com') err(403, 'ACCOUNT_DISABLED');
      // Mock يعرف كلمة سر واحدة فقط — أي شيء آخر = 401 (تفادي كشف
      // الحسابات: نفس الرمز لكل من «بريد مفقود» و«كلمة خطأ»).
      if (password !== 'letmein12345') err(401, 'INVALID_CREDENTIALS');
      // login يعيد user بلا email (مقصود · S6-FIX ملاحظة العقد).
      return ok(200, {
        user: { id: 'usr_mock', role: 'owner' },
        tenant: { id: 'tnt_mock', name: 'Mock Agency', plan: 'trial' },
        session: {
          accessToken: 'mock.access.token',
          refreshToken: 'mock.refresh.token',
          expiresIn: 900,
        },
      });
    }

    case 'POST /v1/auth/refresh': {
      const rt = String(b.refreshToken ?? '');
      if (!rt || rt === 'invalid') err(401, 'REFRESH_TOKEN_INVALID');
      // شكل مفروش (لا `session:` غلاف) — مطابق لـmk-api بعد 410cc33.
      return ok(200, {
        accessToken: 'mock.access.token.refreshed',
        refreshToken: 'mock.refresh.token.rotated',
        expiresIn: 900,
      });
    }

    case 'DELETE /v1/auth/logout': {
      return ok(204);
    }

    case 'POST /v1/auth/forgot-password': {
      // دائماً 204 — لا كشف وجود البريد.
      return ok(204);
    }

    // ── Assets (§9) ────────────────────────────────────────────
    case 'POST /v1/assets/upload-url': {
      const kind = String(b.kind ?? '');
      const filename = String(b.filename ?? '');
      const contentType = String(b.contentType ?? '');
      const sizeBytes = Number(b.sizeBytes ?? 0);
      const KINDS = ['font', 'logo', 'image', 'audio', 'video', 'lottie', 'svg'];
      if (!KINDS.includes(kind)) err(400, 'UNSUPPORTED_KIND', 'kind');
      // مطابقة تقريبية kind→contentType كي يُختبر UNSUPPORTED_CONTENT_TYPE_FOR_KIND.
      const kindPrefix: Record<string, string> = {
        image: 'image/', audio: 'audio/', video: 'video/',
        font: 'font/', logo: 'image/', svg: 'image/svg',
        lottie: 'application/json',
      };
      const wantPrefix = kindPrefix[kind] ?? '';
      if (wantPrefix && !contentType.startsWith(wantPrefix)) {
        err(400, 'UNSUPPORTED_CONTENT_TYPE_FOR_KIND', 'contentType');
      }
      if (filename === 'quota.png') err(422, 'STORAGE_QUOTA_EXCEEDED');
      if (sizeBytes > 500 * 1024 * 1024) err(413, 'SIZE_TOO_LARGE', 'sizeBytes');
      const assetId = `ast_mock_${Date.now().toString(36)}`;
      MOCK_ASSETS.set(assetId, {
        id: assetId,
        kind,
        filename,
        sizeBytes,
        createdAt: new Date().toISOString(),
      });
      return ok(200, {
        assetId,
        uploadUrl: `mock://upload/${assetId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        maxSizeBytes: 500 * 1024 * 1024,
      });
    }

    case 'GET /v1/templates': {
      const rows = [...MOCK_TEMPLATES.values()].map((t) => ({
        id: t.id,
        scope: t.scope,
        name: t.name,
        kind: t.kind,
        createdAt: t.createdAt,
      }));
      return ok(200, { data: rows, nextCursor: null, hasMore: false });
    }
    case 'POST /v1/templates': {
      const name = String(b.name ?? '');
      const kind = String(b.kind ?? 'static') as 'static' | 'video';
      if (!name.trim()) err(400, 'VALIDATION_FAILED', 'name');
      const id = `tpl_mock_t${Date.now().toString(36)}`;
      const t: MockTemplate = {
        id, scope: 'tenant', name, kind,
        definition: b.definition ?? {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TEMPLATES.set(id, t);
      return ok(201, t);
    }

    case 'GET /v1/brand-kits': {
      const rows = [...MOCK_BRAND_KITS.values()].map((k) => ({
        id: k.id, name: k.name, createdAt: k.createdAt, updatedAt: k.updatedAt,
      }));
      return ok(200, { data: rows, nextCursor: null, hasMore: false });
    }
    case 'POST /v1/brand-kits': {
      const name = String(b.name ?? '');
      if (!name.trim()) err(400, 'VALIDATION_FAILED', 'name');
      const id = `bk_mock_${Date.now().toString(36)}`;
      const k: MockBrandKit = {
        id, name,
        config: (b.config as Record<string, unknown>) ?? defaultKitConfig(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_BRAND_KITS.set(id, k);
      return ok(201, k);
    }

    case 'GET /v1/assets': {
      // فلاتر مبسّطة — بعض المفاتيح تصل عبر query لا body، لكن mock
      // handleMock لا يفكّها. المرآة كافية لعرض القائمة.
      const rows = [...MOCK_ASSETS.values()]
        .sort((a, z) => (z.createdAt > a.createdAt ? 1 : -1))
        .map((a) => mockAssetShape(a, false));
      return ok(200, { data: rows, nextCursor: null, hasMore: false });
    }

    case 'POST /v1/auth/reset-password': {
      const token = String(b.token ?? '');
      const newPassword = String(b.newPassword ?? '');
      if (token === 'expired') err(400, 'RESET_TOKEN_EXPIRED', 'token');
      if (token === 'used') err(400, 'RESET_TOKEN_USED', 'token');
      if (token === 'invalid') err(400, 'RESET_TOKEN_INVALID', 'token');
      if (newPassword.length < 12) err(400, 'PASSWORD_TOO_WEAK', 'newPassword');
      return ok(204);
    }

    // ── §7.1 GET /v1/projects ─────────────────────────────
    case 'GET /v1/projects': {
      const rows = [...MOCK_PROJECTS.values()]
        .sort((a, z) => (z.updatedAt > a.updatedAt ? 1 : -1))
        .map((p) => projShape(p, false));
      return ok(200, { data: rows, nextCursor: null, hasMore: false });
    }

    // ── §7.3 POST /v1/projects ────────────────────────────
    case 'POST /v1/projects': {
      const title = String(b.title ?? '');
      const brandKitId = String((b.brand_kit_id ?? b.brandKitId) ?? '');
      const templateId = String((b.template_id ?? b.templateId) ?? '');
      const workflowId = String((b.workflow_id ?? b.workflowId) ?? DEFAULT_WORKFLOW.id);
      const locale = String(b.locale ?? 'ar');
      if (!title.trim()) err(400, 'VALIDATION_FAILED', 'title');
      if (!brandKitId) err(404, 'BRAND_KIT_NOT_FOUND', 'brand_kit_id');
      if (!templateId) err(404, 'TEMPLATE_NOT_FOUND', 'template_id');
      if (!MOCK_TEMPLATES.has(templateId)) err(404, 'TEMPLATE_NOT_FOUND', 'template_id');
      if (!MOCK_WORKFLOWS.has(workflowId)) err(404, 'WORKFLOW_NOT_FOUND', 'workflow_id');
      // مُشغِّل brand «خارجيّ»: brandKitId يحوي "external" — ينعكس لاحقاً
      // في POST /renders برمز UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS.
      const brandExternal = brandKitId.includes('external');
      const id = `prj_mock_${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const p: MockProject = {
        id,
        title,
        brand_kit_id: brandKitId,
        template_id: templateId,
        workflow_id: workflowId,
        currentState: 'draft',
        assigneeId: null,
        content: (b.content as Record<string, unknown>) ?? {},
        locale,
        createdAt: now,
        updatedAt: now,
        history: [],
        hasRenders: false,
        brandHasExternalAssets: brandExternal,
      };
      MOCK_PROJECTS.set(id, p);
      addRevision('projects', id, 'insert', null, 'usr_mock', null, projShape(p, true));
      return ok(201, projShape(p, true));
    }

    // ── §11.1 GET /v1/workflows ───────────────────────────
    case 'GET /v1/workflows': {
      const rows = [...MOCK_WORKFLOWS.values()].map((w) => ({
        id: w.id, name: w.name, isDefault: w.isDefault,
      }));
      return ok(200, { data: rows, nextCursor: null, hasMore: false });
    }

    // ── §11.3 POST /v1/workflows ──────────────────────────
    case 'POST /v1/workflows': {
      const name = String(b.name ?? '');
      const states = (b.states as MockWorkflowState[] | undefined) ?? [];
      const trns = (b.transitions as MockWorkflowTransition[] | undefined) ?? [];
      if (!name.trim()) err(400, 'VALIDATION_FAILED', 'name');
      if (!Array.isArray(states) || states.length < 2) {
        err(400, 'WORKFLOW_SCHEMA_VIOLATION', 'states');
      }
      const ids = new Set(states.map((s) => s.id));
      for (let i = 0; i < trns.length; i++) {
        const trn = trns[i];
        if (!trn) continue;
        if (!ids.has(trn.from)) err(400, 'WORKFLOW_SCHEMA_VIOLATION', `transitions[${i}].from`);
        if (!ids.has(trn.to)) err(400, 'WORKFLOW_SCHEMA_VIOLATION', `transitions[${i}].to`);
      }
      const id = `wfl_mock_${Date.now().toString(36)}`;
      const wf: MockWorkflow = {
        id,
        name,
        isDefault: false,
        states,
        transitions: trns,
      };
      MOCK_WORKFLOWS.set(id, wf);
      return ok(201, wf);
    }

    // ── §8.1 POST /v1/renders ─────────────────────────────
    case 'POST /v1/renders': {
      const projectId = String((b.project_id ?? b.projectId) ?? '');
      const format = String(b.format ?? '') as 'png' | 'mp4';
      const size = String(b.size ?? 'feed');
      const p = MOCK_PROJECTS.get(projectId);
      if (!p) err(404, 'NOT_FOUND', 'project_id');
      if (p.currentState === 'review') err(403, 'RENDER_NOT_ALLOWED_IN_CURRENT_STATE');
      if (p.brandHasExternalAssets) err(422, 'UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS');
      if (!['png', 'mp4'].includes(format)) err(400, 'VALIDATION_FAILED', 'format');
      const id = `rnd_mock_${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const rec: MockRender = {
        id,
        project_id: projectId,
        status: 'queued',
        size,
        format,
        output_url: null,
        duration_ms: null,
        brand_snapshot_id: `bks_${id}`,
        template_snapshot_id: `tks_${id}`,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        queuedAt: now,
      };
      MOCK_RENDERS.set(id, rec);
      p.hasRenders = true;
      return ok(202, {
        id: rec.id,
        status: 'queued',
        queuedAt: rec.queuedAt,
        brand_snapshot_id: rec.brand_snapshot_id,
        template_snapshot_id: rec.template_snapshot_id,
      });
    }

    // ── §8.2 GET /v1/renders (قائمة) ──────────────────────
    case 'GET /v1/renders': {
      const rows = [...MOCK_RENDERS.values()].sort((a, z) =>
        z.createdAt > a.createdAt ? 1 : -1
      );
      return ok(200, { data: rows.map((r) => ({ ...r })), nextCursor: null, hasMore: false });
    }

    // ── §13 GET /v1/subscription ──────────────────────────
    case 'GET /v1/subscription': {
      return ok(200, { ...MOCK_SUB });
    }
    // §13.2 POST /v1/subscription/checkout
    case 'POST /v1/subscription/checkout': {
      const plan = String(b.plan ?? '');
      if (!plan) err(400, 'VALIDATION_FAILED', 'plan');
      return ok(200, {
        checkoutUrl: `mock://checkout/${plan}?ts=${Date.now()}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
    case 'POST /v1/subscription/cancel': {
      const reason = String(b.reason ?? '');
      if (reason.trim().length < 10) err(400, 'REASON_TOO_SHORT', 'reason');
      MOCK_SUB.cancelAtPeriodEnd = true;
      return ok(200, { ...MOCK_SUB });
    }
    case 'POST /v1/subscription/resume': {
      MOCK_SUB.cancelAtPeriodEnd = false;
      return ok(200, { ...MOCK_SUB });
    }

    // ── §14 GET /v1/usage/current ─────────────────────────
    case 'GET /v1/usage/current': {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return ok(200, {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        counts: {
          rendersTotal: MOCK_SUB.quotas.renders.used,
          videos: MOCK_SUB.quotas.videos.used,
          videosSeconds: MOCK_SUB.quotas.videos.used * 12,
          storageBytes: 42_000_000,
          aiTokensIn: 12_400,
          aiTokensOut: 3_180,
        },
        limits: {
          rendersTotal: MOCK_SUB.quotas.renders.limit,
          videos: MOCK_SUB.quotas.videos.limit,
          videosSeconds: 'unlimited',
          storageBytes: 5_000_000_000,
        },
        byBrandKit: [...MOCK_BRAND_KITS.values()].map((k) => ({
          brandKitId: k.id,
          rendersTotal: 3,
        })),
      });
    }
    case 'GET /v1/usage/history': {
      return ok(200, { data: [], nextCursor: null, hasMore: false });
    }

    // ── §15 GET /v1/ai/integrations — بلا nextCursor/hasMore (انحراف #S17-2) ──
    case 'GET /v1/ai/integrations': {
      return ok(200, {
        data: [...MOCK_AI_INT.values()].map((it) => ({ ...it })),
      });
    }
    // §15 POST /v1/ai/integrations — apiKey يُقبَل ولا يُعاد
    case 'POST /v1/ai/integrations': {
      const provider = String(b.provider ?? '');
      const apiKey = String(b.apiKey ?? '');
      const KNOWN = ['openai', 'anthropic', 'google', 'cohere', 'mistral'];
      if (!KNOWN.includes(provider)) err(400, 'INVALID_PROVIDER', 'provider');
      if (!apiKey) err(400, 'VALIDATION_FAILED', 'apiKey');
      // مُشغِّل: apiKey يبدأ بـ`bad-` ⇒ 422 API_KEY_VALIDATION_FAILED.
      if (apiKey.startsWith('bad-')) err(422, 'API_KEY_VALIDATION_FAILED', 'apiKey');
      const capabilitiesByProvider: Record<string, string[]> = {
        openai: ['text.completion', 'headline.suggest', 'image.tag'],
        anthropic: ['text.completion', 'headline.suggest', 'summary.write'],
        google: ['text.completion', 'image.tag'],
        cohere: ['text.completion'],
        mistral: ['text.completion'],
      };
      const it: MockAiIntegration = {
        provider,
        apiKeyRef: `kref_${provider}_${Math.random().toString(36).slice(2, 10)}`,
        enabled: true,
        capabilities: (b.capabilities as string[] | undefined) ?? capabilitiesByProvider[provider] ?? [],
        configuredAt: new Date().toISOString(),
        configuredBy: 'usr_mock',
      };
      MOCK_AI_INT.set(provider, it);
      return ok(201, { ...it });
    }
    // §15 POST /v1/ai/invoke — capability في body
    case 'POST /v1/ai/invoke': {
      const capability = String(b.capability ?? '');
      const KNOWN_CAPS = [
        'text.completion',
        'headline.suggest',
        'summary.write',
        'image.tag',
      ];
      if (!KNOWN_CAPS.includes(capability)) err(400, 'UNKNOWN_CAPABILITY', 'capability');
      // نبحث عن أوّل تكامل مُفعَّل يقدّم القدرة.
      const provider = [...MOCK_AI_INT.values()].find(
        (it) => it.enabled && it.capabilities.includes(capability)
      );
      if (!provider) err(403, 'CAPABILITY_NOT_ENABLED');
      // مُشغِّلات فشل المزوّد — يُقرأ input.text/input.body:
      const bin = (b.input as { text?: string; body?: string } | undefined) ?? {};
      const text = String(bin.text ?? bin.body ?? '');
      if (text.toLowerCase().includes('trigger-timeout')) err(504, 'PROVIDER_TIMEOUT');
      if (text.toLowerCase().includes('trigger-provider-error')) err(502, 'PROVIDER_ERROR');
      // ردّ mock بسيط — نُعيد سلسلة مبنية على القدرة.
      const output =
        capability === 'headline.suggest'
          ? { suggestions: ['عنوان مقترح 1 — بديل قصير', 'عنوان مقترح 2 — بديل توضيحي'] }
          : capability === 'summary.write'
          ? { summary: text.slice(0, 120) + '…' }
          : capability === 'image.tag'
          ? { tags: ['portrait', 'daytime', 'outdoor'] }
          : { completion: `mock-completion(${text.slice(0, 60)})` };
      return ok(200, {
        output,
        provider: provider.provider,
        tokensIn: Math.min(120, Math.floor(text.length / 3) + 10),
        tokensOut: 42,
        durationMs: 320,
      });
    }

    default:
      err(404, 'NOT_FOUND');
  }
}
