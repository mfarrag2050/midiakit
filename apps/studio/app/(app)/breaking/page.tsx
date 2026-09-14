'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Field, Input, PageHeader, Textarea } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, brandKits, templates } from '@/src/api';
import type {
  BrandKitFull,
  BrandKitSummary,
} from '@/src/api/endpoints/brand-kits';
import { TEMPLATES } from '@pf-mediakit/templates';
import { LiveCardPreview } from '@/src/ui/LiveCardPreview';
import { ExportCardButton } from '@/src/ui/ExportCardButton';

// شاشة تأليف بطاقة عاجل (`160-BREAKING-COMPOSER`).
// المسار: اختيار هوية → عنوان + مصدر → معاينة حيّة → تصدير.
// المعاينة والتصدير مكوّنان مُعاد استعمالهما من محرّر الهويّة
// (§140/§150) — لا نسخ ثانية، حالة الوظيفة داخل مكوّنها.

const PREVIEW_SIZE = { w: 1080, h: 1350 } as const;

export default function BreakingComposerPage(): JSX.Element {
  const { t } = useLocale();
  // ref مشتَرك بين المعاينة والتصدير — كي يستطيع الزرّ (في mock) قراءة
  // بكسلات البطاقة الفعليّة بدل صورة seed الثابتة (200-DEMO-FIX-2 §1·٢).
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [selectedKitId, setSelectedKitId] = useState<string>('');
  const [selectedKit, setSelectedKit] = useState<BrandKitFull | null>(null);
  const [breakingTemplateId, setBreakingTemplateId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  // محتوى البطاقة — العنوان + الوكالة (source).
  const [headline, setHeadline] = useState('');
  const [source, setSource] = useState('');

  async function load(): Promise<void> {
    setLoading(true);
    setLoadErrorKey(null);
    try {
      const [kitsPage, tplPage] = await Promise.all([
        brandKits.list(),
        templates
          .list()
          .catch(() => ({ data: [], nextCursor: null, hasMore: false })),
      ]);
      setKits([...kitsPage.data]);
      // القالب: نبحث عن «بطاقة عاجل» — من قوالب mk (mock أو الخادم).
      const breaking = tplPage.data.find(
        (tt) =>
          tt.name.includes('عاجل') ||
          tt.name.toLowerCase().includes('breaking')
      );
      setBreakingTemplateId(breaking?.id ?? null);
      // ملء افتراضيّ: أوّل هوية.
      if (kitsPage.data.length > 0 && kitsPage.data[0]) {
        setSelectedKitId(kitsPage.data[0].id);
      }
    } catch (err) {
      setLoadErrorKey(
        err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // كلّ تغيير في selectedKitId يجلب `full` بحقول `config` الكاملة.
  useEffect(() => {
    if (!selectedKitId) {
      setSelectedKit(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const full = await brandKits.get(selectedKitId);
        if (!cancelled) setSelectedKit(full);
      } catch {
        if (!cancelled) setSelectedKit(null);
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [selectedKitId]);

  const content = useMemo(
    () => ({
      headline: headline.trim(),
      source: source.trim(),
      locale: 'ar' as const,
    }),
    [headline, source]
  );

  const canExport =
    !!selectedKit && !!breakingTemplateId && headline.trim().length > 0;
  const disabledReasonKey = !selectedKit
    ? 'pages.composer.breaking.reasons.noKit'
    : !breakingTemplateId
    ? 'pages.composer.breaking.reasons.noTemplate'
    : headline.trim().length === 0
    ? 'pages.composer.breaking.reasons.noHeadline'
    : null;

  if (loading) return <div className="p-8 text-fg-muted">{t('common.loading')}</div>;
  if (loadErrorKey) {
    return (
      <div className="space-y-4">
        <Alert kind="danger" titleKey={loadErrorKey} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.composer.breaking.title"
        subtitleKey="pages.composer.breaking.subtitle"
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold">
          {t('pages.composer.breaking.section.inputs')}
        </h2>
        <div className="space-y-4">
          <Field
            htmlFor="composer-kit"
            labelKey="pages.composer.breaking.kitLabel"
            required
          >
            <select
              id="composer-kit"
              value={selectedKitId}
              onChange={(e) => setSelectedKitId(e.target.value)}
              className="w-full rounded border border-fg-subtle/30 bg-surface px-2 py-1.5 text-sm"
            >
              {kits.length === 0 && (
                <option value="">
                  {t('pages.composer.breaking.noKits')}
                </option>
              )}
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            htmlFor="composer-headline"
            labelKey="pages.composer.breaking.headlineLabel"
            required
          >
            <Textarea
              id="composer-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              rows={3}
              placeholder={t('pages.composer.breaking.headlinePlaceholder')}
            />
          </Field>

          <Field
            htmlFor="composer-source"
            labelKey="pages.composer.breaking.sourceLabel"
          >
            <Input
              id="composer-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t('pages.composer.breaking.sourcePlaceholder')}
            />
          </Field>
        </div>
      </Card>

      {selectedKit && breakingTemplateId && (
        <LiveCardPreview
          template={TEMPLATES.breaking}
          brandConfig={selectedKit.config}
          content={content}
          size={PREVIEW_SIZE}
          canvasRef={previewCanvasRef}
        >
          <ExportCardButton
            brandKitId={selectedKit.id}
            brandKitName={selectedKit.name}
            templateId={breakingTemplateId}
            content={content}
            disabled={!canExport}
            disabledReasonKey={disabledReasonKey}
            hintKey="pages.composer.breaking.exportHint"
            previewCanvasRef={previewCanvasRef}
          />
        </LiveCardPreview>
      )}
    </div>
  );
}
