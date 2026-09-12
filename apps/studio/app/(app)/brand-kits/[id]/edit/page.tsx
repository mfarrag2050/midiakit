'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, assets, brandKits } from '@/src/api';
import type { BrandKitFull } from '@/src/api/endpoints/brand-kits';
import type { AssetListItem } from '@/src/api/endpoints/assets';
import {
  contrastRatio,
  formatContrast,
  WCAG_AA_NORMAL,
} from '@/src/utils/wcag';

// حدود الشعار — الفشل عند الخروج منها يرمي `INVALID_LOGO_DIMENSIONS`.
// المصدر: قرار مالك في `110-EDITOR-LOGO`. حدود متحفّظة وواسعة كافياً
// لكل الأشكال المعتادة (شريطيّ ٦:١، مربّع، عموديّ ١:٦).
const LOGO_MIN_PX = 40;
const LOGO_MAX_PX = 2048;
const LOGO_MAX_ASPECT = 6; // width/height أو height/width — كلاهما ≤ 6

// S9-editor · شاشة تحرير الهوية.
//
// **المرحلة ١** (نزلت في `c455cd8`): تثقيب `patch` من طرفه إلى طرفه
// على `name` · باقي الحقول للقراءة.
//
// **المرحلة ٢** (نزلت في `79f8840`): الألوان السبعة الصلبة تحريراً +
// عرض تباين WCAG لثلاثة أزواج مسمّاة.
//
// **المرحلة ٣** (نزلت في `1f56cfc` · `110-EDITOR-LOGO`): الشعار —
// رفعٌ عبر مسار الأصول القائم، معاينة حقيقيّة بالأبعاد الفعليّة،
// ورفضٌ بصوتٍ عالٍ عند أبعاد شاذّة (`INVALID_LOGO_DIMENSIONS`).
// حدود [40, 2048] بكسل + نسبة ≤ 6:1. لا مربّع نائب.
//
// **المرحلة ٤** (هذا الملفّ · مستأنَفة من stash): منتقي الخطّ من
// `assetId` (لا نصّ حرّ) حسب `_AMEND-100`. يُجلب
// `list({filter:{kind:'font'}})` من الخادم (mock يُعيد الكلّ
// فنُصفّي جانب العميل بحسب `kind === 'font'`). المستخدم يختار
// عائلة · القيمة المحفوظة `assetId` · الاسم عرضٌ.
//
// **حلٌّ مؤقّت مُعلَن (data-loss avoidance):** ثلاث تكرارات لنفس
// النمط — الألوان (§٢) · الشعار (§٣) · الخطوط (§٤). الـAPI اليوم
// يطبّق merge patch سطحيّاً على `config`. لكلّ من الثلاث نُعيد بناء
// المجموعة كاملةً من `kit.config.<group>` ونحدّث الحقول التي غيّرها
// المستخدم فقط، ثمّ نرسل الكلّ. يسقط حين يصير `PATCH` عميقاً (تذكرة
// `mkapi` مفتوحة) أو حين تُحرَّر المجموعة من موضعَين متزامناً (سباق
// كتابة صامت).

type ConfigLike = Readonly<Record<string, unknown>>;

function pick(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function pickString(obj: unknown, ...path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const k of path) cur = pick(cur, k);
  return typeof cur === 'string' ? cur : undefined;
}

function pickNumber(obj: unknown, ...path: string[]): number | undefined {
  let cur: unknown = obj;
  for (const k of path) cur = pick(cur, k);
  return typeof cur === 'number' ? cur : undefined;
}

function pickBool(obj: unknown, ...path: string[]): boolean | undefined {
  let cur: unknown = obj;
  for (const k of path) cur = pick(cur, k);
  return typeof cur === 'boolean' ? cur : undefined;
}

interface ExtractedIdentity {
  readonly direction?: string | undefined;
  readonly locale?: string | undefined;
  readonly fontFamily?: string | undefined;
  readonly fontSource?: string | undefined;
  readonly logoUrl?: string | undefined;
  readonly logoSize?: number | undefined;
  readonly logoPosition?: string | undefined;
  readonly bidiEnabled?: boolean | undefined;
  readonly numerals?: string | undefined;
  readonly colors: readonly [string, string | undefined][];
}

// **قائمة مفاتيح الألوان المعروضة.** أيّ إضافة هنا تتطلّب
// مفتاح i18n في `pages.brandKits.editor.color.<key>` — تحرسها
// بوّابة `check:brand-editor-labels` (fixture أحمر عند الطلب).
const COLOR_KEYS = [
  'text',
  'accent',
  'urgentBadge',
  'urgentBg',
  'urgentBgTint',
  'locationBadge',
  'surface',
] as const;

function extract(config: ConfigLike): ExtractedIdentity {
  const colors: [string, string | undefined][] = COLOR_KEYS.map((k) => [
    k,
    pickString(config, 'colors', k),
  ]);
  return {
    direction: pickString(config, 'direction'),
    locale: pickString(config, 'locale'),
    fontFamily: pickString(config, 'fonts', 'primary', 'family'),
    fontSource: pickString(config, 'fonts', 'primary', 'source'),
    logoUrl: pickString(config, 'logo', 'url'),
    logoSize: pickNumber(config, 'logo', 'size'),
    logoPosition: pickString(config, 'logo', 'position'),
    bidiEnabled: pickBool(config, 'typography', 'bidi', 'enabled'),
    numerals: pickString(config, 'typography', 'bidi', 'numerals'),
    colors,
  };
}

function ReadOnlyRow({
  labelKey,
  value,
}: {
  labelKey: string;
  value: React.ReactNode;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-fg-muted">{t(labelKey)}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ColorSwatch({ hex }: { hex: string | undefined }): JSX.Element {
  const { t } = useLocale();
  if (!hex) return <span className="text-fg-subtle">{t('pages.brandKits.editor.value.notSet')}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-4 w-4 rounded border border-fg-subtle/30"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-xs" dir="ltr">
        {hex}
      </span>
    </span>
  );
}

// ContrastRow — سطر تباين واحد بزوج مسمّى. يُظهر الرقم كتنبيه (لا
// كمنع) بحسب `feedback-visual-by-eye` + قرار مالك 2026-09-11:
// «الرقم يُعرَض ولا يمنع». الحدّ WCAG AA=4.5 · تحته «قد لا يُقرأ»
// (أحمر)، فوقه «مقروء» (أخضر)، على الحدّ (≥4.5 و<5) «على الحدّ».
function ContrastRow({
  pairLabelKey,
  hexA,
  hexB,
}: {
  pairLabelKey: string;
  hexA: string | undefined;
  hexB: string | undefined;
}): JSX.Element {
  const { t } = useLocale();
  const ratio =
    hexA && hexB ? contrastRatio(hexA, hexB) : null;
  const invalid = (hexA !== undefined && hexB !== undefined) && ratio === null;
  const missing = hexA === undefined || hexB === undefined;

  let statusKey: string;
  let tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
  let numText = '—';
  if (missing) {
    statusKey = 'pages.brandKits.editor.value.notSet';
    tone = 'neutral';
  } else if (invalid) {
    statusKey = 'pages.brandKits.editor.contrast.invalid';
    tone = 'warning';
  } else if (ratio! < WCAG_AA_NORMAL) {
    statusKey = 'pages.brandKits.editor.contrast.notReadable';
    tone = 'danger';
    numText = formatContrast(ratio!);
  } else if (ratio! < 5.0) {
    statusKey = 'pages.brandKits.editor.contrast.borderline';
    tone = 'warning';
    numText = formatContrast(ratio!);
  } else {
    statusKey = 'pages.brandKits.editor.contrast.readable';
    tone = 'success';
    numText = formatContrast(ratio!);
  }

  const toneClass =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
      ? 'text-warning'
      : tone === 'success'
      ? 'text-success'
      : 'text-fg-subtle';

  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-fg-muted">{t(pairLabelKey)}</span>
      <span className="inline-flex items-center gap-2">
        {hexA && (
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm border border-fg-subtle/30"
            style={{ backgroundColor: hexA }}
          />
        )}
        {hexB && (
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm border border-fg-subtle/30"
            style={{ backgroundColor: hexB }}
          />
        )}
        <span className={'font-mono text-xs ' + toneClass} dir="ltr">
          {numText}
        </span>
        <span className={'text-xs ' + toneClass}>· {t(statusKey)}</span>
      </span>
    </div>
  );
}

export default function BrandKitEditorPage(): JSX.Element {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [kit, setKit] = useState<BrandKitFull | null>(null);
  const [draftName, setDraftName] = useState('');
  // مسوّدة الألوان السبعة — تُملأ من `kit.config.colors` عند التحميل.
  // `null` لكلّ قيمة غير مسحوبة من الخادم — تبقى null في الحفظ.
  const [draftColors, setDraftColors] = useState<Record<string, string>>({});
  // مسوّدة الشعار (المرحلة ٣): dataUri للمعاينة (بلا رحلة شبكة)،
  // dims الفعليّة (المصدر: onLoad على `<img>`)، assetId بعد الرفع.
  const [draftLogo, setDraftLogo] = useState<{
    dataUri: string;
    width: number;
    height: number;
    filename: string;
    contentType: string;
    sizeBytes: number;
  } | null>(null);
  const [logoErrorKey, setLogoErrorKey] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [uploadedLogoAssetId, setUploadedLogoAssetId] = useState<string | null>(null);
  const [uploadedLogoPublicUrl, setUploadedLogoPublicUrl] = useState<string | null>(null);
  // منتقي الخطّ (المرحلة ٤): assetId المختار + قائمة الخطوط المتاحة.
  // مصدر البيانات: `/v1/assets` (mock يعيد الكلّ · نصفّي بـkind=='font').
  const [availableFonts, setAvailableFonts] = useState<AssetListItem[]>([]);
  const [draftFontAssetId, setDraftFontAssetId] = useState<string>('');
  const [initialFontAssetId, setInitialFontAssetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);
  const [saveErrorField, setSaveErrorField] = useState<string | null>(null);
  const [savedNoticeKey, setSavedNoticeKey] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const [k, fontsPage] = await Promise.all([
        brandKits.get(id),
        assets
          .list({ filter: { kind: 'font' } })
          .catch(() => ({ data: [] as AssetListItem[], nextCursor: null, hasMore: false })),
      ]);
      setKit(k);
      setDraftName(k.name);
      const cfg = k.config as ConfigLike;
      const initial: Record<string, string> = {};
      for (const key of COLOR_KEYS) {
        const v = pickString(cfg, 'colors', key);
        if (v) initial[key] = v;
      }
      setDraftColors(initial);
      // تصفية العميل — mock لا يفهم `filter[kind]` (query يُهدَر عند
      // handleMock)، فنُبقيه هنا. الخادم الحقيقيّ يصفّي · فتصفيتنا
      // no-op معه.
      const fonts = fontsPage.data.filter((a) => a.kind === 'font');
      setAvailableFonts(fonts);
      // اقرأ assetId الحاليّ من الوزن الأساسيّ regular. غيابُه يعني
      // «لم يُختَر أصلٌ من مكتبتنا» — قد يكون خطّاً مدمَجاً بلا مرجع.
      const currentAssetId =
        pickString(cfg, 'fonts', 'primary', 'weights', 'regular', 'assetId') ?? '';
      setDraftFontAssetId(currentAssetId);
      setInitialFontAssetId(currentAssetId);
    } catch (err) {
      setLoadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleLogoFile(file: File): Promise<void> {
    setLogoErrorKey(null);
    // اقرأ الملفّ إلى dataURI · نستعمله للمعاينة الحقيقيّة مباشرةً +
    // للتحقّق من الأبعاد قبل أيّ رحلة شبكة.
    const dataUri = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read-failed'));
      r.readAsDataURL(file);
    });
    // Image يعمل مع كلا PNG وSVG. للـSVG بلا وحدات دقيقة، يستعمل
    // العرض/الارتفاع من viewBox أو النصّ الافتراضيّ.
    const img = new Image();
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUri;
    });
    if (!dims || dims.w === 0 || dims.h === 0) {
      // ملفّ تالف — لا يقرأه المتصفّح كصورة.
      setLogoErrorKey('errors.INVALID_LOGO_DIMENSIONS');
      setDraftLogo(null);
      return;
    }
    const inRangeW = dims.w >= LOGO_MIN_PX && dims.w <= LOGO_MAX_PX;
    const inRangeH = dims.h >= LOGO_MIN_PX && dims.h <= LOGO_MAX_PX;
    const aspect = Math.max(dims.w / dims.h, dims.h / dims.w);
    const goodAspect = aspect <= LOGO_MAX_ASPECT;
    if (!inRangeW || !inRangeH || !goodAspect) {
      setLogoErrorKey('errors.INVALID_LOGO_DIMENSIONS');
      setDraftLogo(null);
      return;
    }
    setDraftLogo({
      dataUri,
      width: dims.w,
      height: dims.h,
      filename: file.name,
      contentType: file.type || (file.name.endsWith('.svg') ? 'image/svg+xml' : 'image/png'),
      sizeBytes: file.size,
    });
    // ابدأ الرفع فوراً في الخلفيّة — نتيجته `assetId` نحفظه عند «حفظ».
    void uploadDraftLogo(file);
  }

  async function uploadDraftLogo(file: File): Promise<void> {
    setLogoUploading(true);
    try {
      const uploadUrl = await assets.requestUploadUrl({
        kind: 'logo',
        filename: file.name,
        contentType: file.type || (file.name.endsWith('.svg') ? 'image/svg+xml' : 'image/png'),
        sizeBytes: file.size,
      });
      // PUT إلى signed URL. في mock هذا نداء وهميّ لا يحفظ بايتاً، لكنّ
      // finalize يجعل الأصل موجوداً في القائمة.
      try {
        await fetch(uploadUrl.uploadUrl, { method: 'PUT', body: file });
      } catch {
        // في mock، fetch على mock:// يفشل — نتجاهله ونمضي إلى finalize.
      }
      const asset = await assets.finalize(uploadUrl.assetId, {});
      setUploadedLogoAssetId(asset.id);
      setUploadedLogoPublicUrl(asset.publicUrl ?? null);
    } catch (err) {
      setLogoErrorKey(
        err instanceof ApiError ? err.messageKey : 'errors.UPLOAD_FAILED'
      );
      setDraftLogo(null);
    } finally {
      setLogoUploading(false);
    }
  }

  async function doSave(): Promise<void> {
    if (!kit) return;
    setSaving(true);
    setSaveErrorKey(null);
    setSaveErrorField(null);
    setSavedNoticeKey(null);
    try {
      // JSON Merge Patch · شكل top-level كما في RFC 7396.
      // **حلٌّ مؤقّت (data-loss avoidance):** نبعث مجموعة `colors`
      // كاملةً — الخادم اليوم يمرّ merge سطحيّاً وسيمحو ما لا نرسله.
      // شاشتنا تملك المجموعة كلّها، فإرسالها كاملة آمن هنا. راجع
      // التعليق الرأسيّ.
      const payload: Record<string, unknown> = { name: draftName };
      if (Object.keys(draftColors).length > 0) {
        payload.colors = draftColors;
      }
      // الشعار: إن رُفع أصل جديد (`uploadedLogoAssetId`)، أعِد بناء
      // `logo` كاملاً — نفس مبدأ الألوان (data-loss avoidance). القراءة
      // من `kit.config.logo` تحفظ `position` و`size` و`watermark` وما
      // نحن لا نعرضه صراحةً في هذه المرحلة.
      if (uploadedLogoAssetId && draftLogo) {
        const existingLogo =
          ((kit.config as ConfigLike).logo as Record<string, unknown>) ?? {};
        payload.logo = {
          ...existingLogo,
          assetId: uploadedLogoAssetId,
          url: uploadedLogoPublicUrl ?? existingLogo.url ?? '',
        };
      }
      // الخطّ: إن اختار المستخدم `assetId` جديداً، أعِد بناء `fonts`
      // كاملاً · نفس نمط الألوان والشعار (data-loss avoidance).
      if (draftFontAssetId !== initialFontAssetId && draftFontAssetId) {
        const selected = availableFonts.find((f) => f.id === draftFontAssetId);
        const existing = (kit.config as ConfigLike).fonts ?? {};
        const existingPrimary =
          ((existing as Record<string, unknown>).primary as Record<string, unknown>) ?? {};
        const existingWeights =
          (existingPrimary.weights as Record<string, unknown>) ?? {};
        const existingRegular =
          (existingWeights.regular as Record<string, unknown>) ?? {};
        const familyName =
          (selected?.meta?.family as string | undefined) ??
          selected?.filename ??
          '';
        const source =
          ((selected?.meta?.source as string | undefined) ?? 'custom');
        payload.fonts = {
          ...(existing as Record<string, unknown>),
          primary: {
            ...existingPrimary,
            family: familyName,
            source,
            weights: {
              ...existingWeights,
              regular: {
                ...existingRegular,
                assetId: draftFontAssetId,
              },
            },
          },
        };
      }
      const updated = await brandKits.patch(kit.id, payload);
      setKit(updated);
      setSavedNoticeKey('pages.brandKits.editor.saved');
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveErrorKey(err.messageKey);
        setSaveErrorField(err.field ?? null);
      } else {
        setSaveErrorKey('errors.UNKNOWN');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-fg-muted">…</div>;
  if (loadErrorKey) {
    return (
      <div className="space-y-4">
        <Alert kind="danger" titleKey={loadErrorKey} />
        <Link href="/brand-kits" className="text-accent hover:underline">
          {t('pages.brandKits.editor.backToList')}
        </Link>
      </div>
    );
  }
  if (!kit) return <div />;

  const identity = extract(kit.config as ConfigLike);
  const dirtyName = draftName !== kit.name;
  const dirtyColors = COLOR_KEYS.some(
    (k) =>
      draftColors[k] !== undefined &&
      draftColors[k] !== pickString(kit.config as ConfigLike, 'colors', k)
  );
  const dirtyLogo = uploadedLogoAssetId !== null && draftLogo !== null;
  const dirtyFont =
    draftFontAssetId !== initialFontAssetId && draftFontAssetId !== '';
  const dirty = dirtyName || dirtyColors || dirtyLogo || dirtyFont;
  // ملاحظة: لا نُعطّل الزرّ على الاسم الفارغ عمداً — نترك الخادم
  // يعيد `400 VALIDATION_FAILED` فيظهر الأحمر (L-46 · حالة أحمر
  // مُعادة الإنتاج). لو منعنا هنا لأخفينا مسار الأحمر.

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.brandKits.editor.title"
        subtitleKey="pages.brandKits.editor.subtitle"
        action={
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={saving || !dirty}
            onClick={() => void doSave()}
          >
            {t('pages.brandKits.editor.save')}
          </Button>
        }
      />

      <Link
        href="/brand-kits"
        className="inline-block text-xs text-fg-subtle hover:text-fg"
      >
        {t('pages.brandKits.editor.backToList')}
      </Link>

      {savedNoticeKey && <Alert kind="success" titleKey={savedNoticeKey} />}
      {saveErrorKey && (
        <Alert kind="danger" titleKey={saveErrorKey}>
          {saveErrorField && (
            <div className="mt-1 text-xs text-fg-muted">
              <span dir="ltr">field: {saveErrorField}</span>
            </div>
          )}
        </Alert>
      )}

      {/* Section — Identity (editable: name; read-only: direction, locale) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {t('pages.brandKits.editor.section.identity')}
          </h2>
          <span className="text-xs text-fg-subtle">
            {t('pages.brandKits.editor.phase1Hint')}
          </span>
        </div>

        <Field htmlFor="bk-name" labelKey="pages.brandKits.nameLabel" required>
          <Input
            id="bk-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            disabled={saving}
          />
        </Field>

        <div className="mt-4 space-y-1 border-t border-fg-subtle/10 pt-3">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.direction"
            value={
              identity.direction === 'rtl'
                ? t('pages.brandKits.editor.value.rtl')
                : identity.direction === 'ltr'
                ? t('pages.brandKits.editor.value.ltr')
                : t('pages.brandKits.editor.value.notSet')
            }
          />
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.locale"
            value={
              identity.locale ? (
                t(`pages.brandKits.editor.locale.${identity.locale}`)
              ) : (
                <span className="text-fg-subtle">
                  {t('pages.brandKits.editor.value.notSet')}
                </span>
              )
            }
          />
        </div>
      </Card>

      {/* Section — Font (editable in Phase 3 · assetId not free text) */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold">
          {t('pages.brandKits.editor.section.font')}
        </h2>
        {availableFonts.length === 0 ? (
          <p className="text-xs text-fg-muted">
            {t('pages.brandKits.editor.fontPicker.emptyLibrary')}
          </p>
        ) : (
          <>
            <Field
              htmlFor="font-picker"
              labelKey="pages.brandKits.editor.field.fontFamily"
            >
              <select
                id="font-picker"
                value={draftFontAssetId}
                onChange={(e) => setDraftFontAssetId(e.target.value)}
                disabled={saving}
                className="w-full rounded border border-fg-subtle/30 bg-surface px-2 py-1.5 text-sm"
              >
                {draftFontAssetId === '' && (
                  <option value="">
                    {t('pages.brandKits.editor.fontPicker.chooseFromLibrary')}
                  </option>
                )}
                {availableFonts.map((f) => {
                  const family =
                    typeof f.meta?.family === 'string'
                      ? f.meta.family
                      : f.filename;
                  return (
                    <option key={f.id} value={f.id} dir="ltr">
                      {family}
                    </option>
                  );
                })}
              </select>
            </Field>
            <p className="mt-2 text-xs text-fg-subtle">
              {t('pages.brandKits.editor.fontPicker.assetIdHint')}
            </p>
          </>
        )}
        <div className="mt-3 space-y-1 border-t border-fg-subtle/10 pt-3">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.fontSource"
            value={
              identity.fontSource === 'builtin'
                ? t('pages.brandKits.editor.value.builtin')
                : identity.fontSource === 'custom'
                ? t('pages.brandKits.editor.value.custom')
                : identity.fontSource === 'external'
                ? t('pages.brandKits.editor.value.external')
                : t('pages.brandKits.editor.value.notSet')
            }
          />
        </div>
      </Card>

      {/* Section — Colors (editable in Phase 2) */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold">
          {t('pages.brandKits.editor.section.colors')}
        </h2>
        <div className="space-y-2">
          {COLOR_KEYS.map((key) => {
            const current = draftColors[key] ?? '';
            const hexInvalid =
              current !== '' && !/^#[0-9a-fA-F]{6}$/.test(current);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-1 text-sm"
              >
                <label
                  htmlFor={`color-${key}`}
                  className="min-w-0 flex-1 text-fg-muted"
                >
                  {t(`pages.brandKits.editor.color.${key}`)}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`color-${key}`}
                    type="color"
                    aria-label={t('pages.brandKits.editor.colorEdit.swatchLabel')}
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(current)
                        ? current
                        : '#000000'
                    }
                    onChange={(e) =>
                      setDraftColors((prev) => ({
                        ...prev,
                        [key]: e.target.value.toUpperCase(),
                      }))
                    }
                    disabled={saving}
                    className="h-7 w-9 cursor-pointer rounded border border-fg-subtle/30 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    aria-label={t('pages.brandKits.editor.colorEdit.hexLabel')}
                    value={current}
                    onChange={(e) =>
                      setDraftColors((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    disabled={saving}
                    placeholder="#RRGGBB"
                    dir="ltr"
                    className={
                      'w-24 rounded border bg-surface px-2 py-1 font-mono text-xs ' +
                      (hexInvalid
                        ? 'border-danger text-danger'
                        : 'border-fg-subtle/30')
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Section — Contrast (Phase 2 · advisory only) */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">
          {t('pages.brandKits.editor.contrast.sectionTitle')}
        </h2>
        <p className="text-xs text-fg-muted">
          {t('pages.brandKits.editor.contrast.subtitle')}
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          {t('pages.brandKits.editor.contrast.wcagThreshold')} ·{' '}
          {t('pages.brandKits.editor.contrast.advisory')}
        </p>
        <div className="mt-3 space-y-2 border-t border-fg-subtle/10 pt-3">
          <ContrastRow
            pairLabelKey="pages.brandKits.editor.contrast.pair.textOnSurface"
            hexA={draftColors.text}
            hexB={draftColors.surface}
          />
          <ContrastRow
            pairLabelKey="pages.brandKits.editor.contrast.pair.urgentBadgeOnBg"
            hexA={draftColors.urgentBadge}
            hexB={draftColors.urgentBg}
          />
          <ContrastRow
            pairLabelKey="pages.brandKits.editor.contrast.pair.locationBadgeOnSurface"
            hexA={draftColors.locationBadge}
            hexB={draftColors.surface}
          />
        </div>
      </Card>

      {/* Section — Logo (editable in Phase 3) */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold">
          {t('pages.brandKits.editor.section.logo')}
        </h2>
        <p className="mb-3 text-xs text-fg-subtle">
          {t('pages.brandKits.editor.logo.sectionSubtitle')}
        </p>

        {/* رفعٌ عبر مسار الأصول القائم (assets endpoints · لا مسار جديد) */}
        <div className="mb-3">
          <input
            id="logo-file-input"
            type="file"
            accept=".svg,.png,image/svg+xml,image/png"
            disabled={logoUploading || saving}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleLogoFile(f);
              // امسح قيمة الإدخال كي يمكن اختيار نفس الملفّ ثانيةً.
              e.target.value = '';
            }}
            className="block w-full text-xs text-fg-muted file:me-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:text-fg-inverse hover:file:bg-accent/90"
            aria-label={t(
              draftLogo || identity.logoUrl
                ? 'pages.brandKits.editor.logo.replaceFile'
                : 'pages.brandKits.editor.logo.chooseFile'
            )}
          />
          {logoUploading && (
            <p className="mt-2 text-xs text-fg-muted">
              {t('pages.brandKits.editor.logo.uploadingLabel')}
            </p>
          )}
          {logoErrorKey && (
            <div className="mt-2">
              <Alert kind="danger" titleKey={logoErrorKey}>
                <div className="mt-1 text-xs text-fg-muted">
                  <span dir="ltr">field: logo</span>
                </div>
              </Alert>
            </div>
          )}
        </div>

        {/* المعاينة الحقيقيّة بالأبعاد الفعليّة — بلا مربّع نائب. */}
        {draftLogo ? (
          <div className="rounded border border-fg-subtle/20 bg-surface-2 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-fg-muted">
              <span>{t('pages.brandKits.editor.logo.previewTitle')}</span>
              <span dir="ltr" className="font-mono">
                {draftLogo.width}×{draftLogo.height} · {(draftLogo.width / draftLogo.height).toFixed(2)}:1
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draftLogo.dataUri}
              alt={draftLogo.filename}
              width={draftLogo.width}
              height={draftLogo.height}
              className="max-h-64 max-w-full bg-white"
              style={{
                imageRendering: 'auto',
              }}
            />
            {identity.logoPosition && (
              <p className="mt-2 text-xs text-fg-subtle">
                {t('pages.brandKits.editor.logo.previewAnchor').replace(
                  '{anchor}',
                  t(`pages.brandKits.editor.position.${identity.logoPosition}`)
                )}
              </p>
            )}
          </div>
        ) : identity.logoUrl ? (
          <div className="rounded border border-fg-subtle/20 bg-surface-2 p-3">
            <div className="mb-2 text-xs text-fg-muted">
              {t('pages.brandKits.editor.logo.previewTitle')}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={identity.logoUrl}
              alt="logo"
              className="max-h-64 max-w-full bg-white"
              onError={(e) => {
                // إن فشل تحميل الصورة، أخفِ العنصر — بلا مربّع كذّاب.
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            {identity.logoUrl && (
              <p className="mt-2 truncate font-mono text-xs text-fg-subtle" dir="ltr">
                {identity.logoUrl}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">
            {t('pages.brandKits.editor.logo.noneChosen')}
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-fg-subtle/10 pt-3">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.logoSize"
            value={
              identity.logoSize !== undefined ? (
                <span dir="ltr">{identity.logoSize}</span>
              ) : (
                <span className="text-fg-subtle">
                  {t('pages.brandKits.editor.value.notSet')}
                </span>
              )
            }
          />
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.logoPosition"
            value={
              identity.logoPosition ? (
                t(`pages.brandKits.editor.position.${identity.logoPosition}`)
              ) : (
                <span className="text-fg-subtle">
                  {t('pages.brandKits.editor.value.notSet')}
                </span>
              )
            }
          />
        </div>
      </Card>

      {/* Section — BiDi & numerals (read-only in Phase 1) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {t('pages.brandKits.editor.section.bidi')}
          </h2>
          <Badge tone="neutral">
            {t('pages.brandKits.editor.readOnlyTag')}
          </Badge>
        </div>
        <div className="space-y-1">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.bidiEnabled"
            value={
              identity.bidiEnabled === true
                ? t('pages.brandKits.editor.value.on')
                : identity.bidiEnabled === false
                ? t('pages.brandKits.editor.value.off')
                : t('pages.brandKits.editor.value.notSet')
            }
          />
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.numerals"
            value={
              identity.numerals === 'arabic'
                ? t('pages.brandKits.editor.value.arabic')
                : identity.numerals === 'latin'
                ? t('pages.brandKits.editor.value.latin')
                : t('pages.brandKits.editor.value.notSet')
            }
          />
        </div>
      </Card>
    </div>
  );
}
