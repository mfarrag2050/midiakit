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
import { ApiError, brandKits } from '@/src/api';
import type { BrandKitFull } from '@/src/api/endpoints/brand-kits';
import {
  contrastRatio,
  formatContrast,
  WCAG_AA_NORMAL,
} from '@/src/utils/wcag';

// S9-editor · شاشة تحرير الهوية.
//
// **المرحلة ١** (نزلت في `c455cd8`): تثقيب `patch` من طرفه إلى طرفه
// على `name` · باقي الحقول للقراءة.
//
// **المرحلة ٢** (هذا الملفّ): الألوان السبعة الصلبة تحريراً + عرض
// تباين WCAG لثلاثة أزواج مسمّاة. الشعار يبقى قراءة فقط بقرار مالك
// (تذكرة تالية · معاينة حقيقيّة تحتاج تحميل SVG).
//
// **حلٌّ مؤقّت مُعلَن (data-loss avoidance):** الـAPI اليوم يطبّق
// merge patch سطحيّاً على `config` (رصده المالك · فتُحت تذكرة عند
// `mkapi`). فلو أرسلنا `{colors: {text: '#X'}}` لمَحَا الستّة الباقية
// من `config.colors` بلا خطأ. **الحلّ من جهتنا:** نرسل الألوان
// السبعة كاملةً في كلّ حفظ · شاشتنا تملك المجموعة كلّها فما نرسله
// هو ما رآه المستخدم. **هذا يسقط حين يصير `PATCH` عميقاً · أو حين
// تُحرَّر الألوان من موضعَين متزامناً** (سباق كتابة). راجع §٥·٢ من
// التقرير.
//
// **مراحل تالية:**
//   ٣ · الشعار (بعد الألوان — قرار مالك)
//   ٤ · منتقي الخطّ من الأصول (`assetId` · لا نصّ حرّ · `_AMEND-100`)
//   ٥ · المعاينة الحيّة على بطاقة حقيقيّة

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
      const k = await brandKits.get(id);
      setKit(k);
      setDraftName(k.name);
      const cfg = k.config as ConfigLike;
      const initial: Record<string, string> = {};
      for (const key of COLOR_KEYS) {
        const v = pickString(cfg, 'colors', key);
        if (v) initial[key] = v;
      }
      setDraftColors(initial);
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
  const dirty = dirtyName || dirtyColors;
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

      {/* Section — Font (read-only in Phase 1) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {t('pages.brandKits.editor.section.font')}
          </h2>
          <Badge tone="neutral">
            {t('pages.brandKits.editor.readOnlyTag')}
          </Badge>
        </div>
        <div className="space-y-1">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.fontFamily"
            value={
              identity.fontFamily ? (
                <span dir="ltr">{identity.fontFamily}</span>
              ) : (
                <span className="text-fg-subtle">
                  {t('pages.brandKits.editor.value.notSet')}
                </span>
              )
            }
          />
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

      {/* Section — Logo (read-only in Phase 1) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {t('pages.brandKits.editor.section.logo')}
          </h2>
          <Badge tone="neutral">
            {t('pages.brandKits.editor.readOnlyTag')}
          </Badge>
        </div>
        <div className="space-y-1">
          <ReadOnlyRow
            labelKey="pages.brandKits.editor.field.logoUrl"
            value={
              identity.logoUrl ? (
                <span dir="ltr" className="max-w-md truncate font-mono text-xs">
                  {identity.logoUrl}
                </span>
              ) : (
                <span className="text-fg-subtle">
                  {t('pages.brandKits.editor.value.notSet')}
                </span>
              )
            }
          />
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
