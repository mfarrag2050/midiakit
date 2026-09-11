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

// S9-editor · المرحلة ١ من `100-BRAND-KIT-EDITOR`:
// تحميل + عرض قراءة فقط + زرّ حفظ يعمل على `name` وحده — لتثقيب مسار
// `PATCH /v1/brand-kits/:id` (JSON Merge Patch) من طرفه إلى طرفه قبل بناء
// عشرين حقلاً فوقه. باقي الحقول ستُبنى في مراحل تالية بترتيب:
//   ٢ · الألوان الثمانية بـ contrast display
//   ٣ · الشعار بمعاينة حقيقية
//   ٤ · منتقي الخطّ من الأصول (assetId · لا نصّ حرّ)
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

export default function BrandKitEditorPage(): JSX.Element {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [kit, setKit] = useState<BrandKitFull | null>(null);
  const [draftName, setDraftName] = useState('');
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
      const updated = await brandKits.patch(kit.id, { name: draftName });
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
  const dirty = draftName !== kit.name;
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

      {/* Section — Colors (read-only in Phase 1) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {t('pages.brandKits.editor.section.colors')}
          </h2>
          <Badge tone="neutral">
            {t('pages.brandKits.editor.readOnlyTag')}
          </Badge>
        </div>
        <div className="space-y-1">
          {identity.colors.map(([key, hex]) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-4 py-1 text-sm"
            >
              <span className="text-fg-muted">
                {t(`pages.brandKits.editor.color.${key}`)}
              </span>
              <ColorSwatch hex={hex} />
            </div>
          ))}
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
