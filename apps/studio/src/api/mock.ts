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
[
  ['بسيط — إثبات بوابة المرحلة 2', 'static'],
  ['بطاقة ذات كيكر', 'static'],
  ['بطاقة سفلية', 'static'],
  ['بطاقة متمركزة', 'static'],
  ['بطاقة عاجل', 'static'],
  ['ريلز', 'video'],
].forEach(([name, kind], i) => {
  const id = `tpl_mock_g${i}`;
  MOCK_TEMPLATES.set(id, {
    id,
    scope: 'global',
    name: name as string,
    kind: kind as 'static' | 'video',
    definition: { fields: [] },
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
    base.publicUrl = `mock://public/${a.id}`;
    base.publicUrlExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }
  return base;
}

export async function handleMock(
  method: string,
  path: string,
  body: unknown
): Promise<MockResult> {
  // تأخير 200ms لمحاكاة زمن الشبكة — كي تُرى حالة loading في المتصفح.
  await delay(200);

  const key = `${method} ${path}`;
  const b = (body ?? {}) as Record<string, unknown>;

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
    k.config = { ...k.config, ...(b as Record<string, unknown>) };
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

    default:
      err(404, 'NOT_FOUND');
  }
}
