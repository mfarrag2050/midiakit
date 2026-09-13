'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Table,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, exports as exportsApi, renders, templates } from '@/src/api';
import type {
  ExportRow,
  ExportStatus,
  ExportsPage,
} from '@/src/api/endpoints/exports';

// 290-EXPORTS-SCREEN — سجلّ تصديرات المستأجر.
// **مصدر البيانات:** `GET /v1/exports` (mkapi origin/main:apps/api/src/routes/exports/list.ts).
// **الترقيم:** offset-based (nextCursor: null دائماً — قرارٌ مقصود من mkapi).
// نستعمل `offset += limit` عند «تحميل المزيد» ولا نتظاهر بـcursor لا يملكه الخادم.
// **حالتان يعالجهما 220 + 270 تلقائيّاً:**
//   خطأ من الخادم        → try/catch → ApiError.messageKey → Alert
//   الخادم لا يستجيب     → 270 يقذف SERVER_UNRESPONSIVE بعد 20s → Alert
// **حالة لا صفوف** خاصّة بهذه الشاشة: EmptyState + hint يقود المستخدم إلى «تأليف عاجل».

const PAGE_LIMIT = 20;

const STATUS_TONE: Record<
  string,
  'neutral' | 'warning' | 'success' | 'danger' | 'accent'
> = {
  queued: 'neutral',
  running: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'accent',
};

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

// 290-v2 · حجم مقروء من `sizeBytes` (يعود من الخادم string). لا نخترع
// حين null (تصدير فشل أو لم يُرفع) — نُظهر «—».
function fmtBytes(sb: string | null): string {
  if (sb === null || sb === '') return '—';
  const n = Number(sb);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export default function ExportsPage(): JSX.Element {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [downloadErrorKey, setDownloadErrorKey] = useState<string | null>(null);
  // 290-v3 · خريطة templateId → name من `templates.list` (نداءٌ واحد على mount).
  // بيان يعود من الخادم (endpoint آخر) — إثراء لا اختراع.
  // فشل جلب القوالب لا يمنع عرض السجلّ — نُواصل بـfallback إلى UUID.
  const [templateNames, setTemplateNames] = useState<Map<string, string>>(
    () => new Map()
  );

  async function loadFirst(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const page: ExportsPage = await exportsApi.list({ limit: PAGE_LIMIT, offset: 0 });
      setRows([...page.data]);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setOffset(0);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    setListErrorKey(null);
    try {
      const nextOffset = offset + PAGE_LIMIT;
      const page: ExportsPage = await exportsApi.list({ limit: PAGE_LIMIT, offset: nextOffset });
      setRows((prev) => [...prev, ...page.data]);
      setHasMore(page.hasMore);
      setOffset(nextOffset);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoadingMore(false);
    }
  }

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try { await loadFirst(); } finally { setRefreshing(false); }
  }

  // 290-v3 · جلب أسماء القوالب مرّةً على mount (نداءٌ واحد · بلا cache).
  // ٱتّبع فشلاً صامتاً — السجلّ يظلّ صالحاً حتّى بلا أسماء (fallback إلى UUID).
  async function loadTemplateNames(): Promise<void> {
    try {
      const page = await templates.list({ limit: 100 });
      const m = new Map<string, string>();
      for (const t of page.data) m.set(t.id, t.name);
      setTemplateNames(m);
    } catch {
      // صامت مقصود — عمود القالب سيسقط على UUID · لا يُعطَّل السجلّ لأجل اسم.
    }
  }

  useEffect(() => {
    void loadFirst();
    void loadTemplateNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 290-v3 · تنزيلٌ آمن على Safari/iOS: `window.open` بعد `await` يُحجَب لأنّ
  // الحدث خرج من user gesture. الحلّ: عنصر `<a>` مؤقّت نضغطه — الضغطة تُعتبر
  // ضمن سياق الحدث الأصليّ (على معظم المتصفّحات الحديثة). نُنشئه بعد وصول
  // الـURL كي لا نفتح تبويباً فارغاً على الفشل.
  async function doDownload(row: ExportRow): Promise<void> {
    if (!row.storageKey) return;
    setDownloadBusyId(row.id);
    setDownloadErrorKey(null);
    try {
      const out = await renders.getOutput(row.renderId);
      if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = out.url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        // `download` attribute: يوجّه المتصفّح إلى تنزيل بدل عرض. اسم
        // الملفّ نستخرجه من storageKey (آخر جزء بعد /).
        const filename = row.storageKey.split('/').pop() ?? `export-${row.id}`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setDownloadErrorKey(
        err instanceof ApiError ? err.messageKey : 'pages.exports.downloadFailed'
      );
    } finally {
      setDownloadBusyId(null);
    }
  }

  const columns: readonly Column<ExportRow>[] = [
    {
      key: 'date',
      headerKey: 'pages.exports.col.date',
      render: (r) => <span className="text-xs text-fg-muted">{fmtDate(r.createdAt, locale)}</span>,
    },
    {
      key: 'template',
      headerKey: 'pages.exports.col.template',
      render: (r) => {
        // 290-v3 · اسم القالب من templates.list (بيان الخادم من endpoint آخر).
        // fallback إلى UUID المختصر إن لم يُعثَر على الاسم (mkapi قد يعيد
        // templateId لقالب حُذف · أو نداء templates.list فشل).
        const name = r.templateId ? templateNames.get(r.templateId) : null;
        if (name) {
          return (
            <div className="flex flex-col">
              <span>{name}</span>
              <span dir="ltr" className="font-mono text-[10px] text-fg-subtle">
                {shortId(r.templateId)}
              </span>
            </div>
          );
        }
        return (
          <span dir="ltr" className="font-mono text-xs" title={r.templateId ?? ''}>
            {shortId(r.templateId)}
          </span>
        );
      },
    },
    {
      key: 'size',
      headerKey: 'pages.exports.col.size',
      render: (r) => <span dir="ltr" className="text-xs">{r.size}</span>,
    },
    {
      key: 'format',
      headerKey: 'pages.exports.col.format',
      render: (r) => <span dir="ltr" className="text-xs uppercase">{r.format}</span>,
    },
    {
      key: 'status',
      headerKey: 'pages.exports.col.status',
      render: (r) => {
        const tone = STATUS_TONE[r.status] ?? 'neutral';
        const key = `pages.exports.status.${r.status}` as const;
        // إن لم يوجد مفتاح للحالة (خادم أرسل قيمة جديدة) نعرضها كما هي —
        // §1 من التذكرة: لا نخترع، ولا نُخفي.
        const label = t(key) === key ? r.status : t(key);
        // 290-v2: إن كان status='failed' وعاد errorCode من الخادم نعرضه سطراً
        // ثانياً أسفل الشارة كي يفهم المستخدم لماذا فشل — بيان يعود من
        // الخادم لا اختراع. نعرض الرمز كما هو (لم أُضِف قاموس رموز الرندَر
        // إلى i18n بعد — الرمز nudge للمستخدم/الدعم لا للترجمة).
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={tone}>{label}</Badge>
            {r.status === 'failed' && r.errorCode && (
              <span
                dir="ltr"
                className="font-mono text-[10px] leading-none text-fg-subtle"
                title={t('pages.exports.errorCodeHint')}
              >
                {r.errorCode}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'file',
      headerKey: 'pages.exports.col.file',
      align: 'center',
      render: (r) =>
        r.storageKey ? (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              loading={downloadBusyId === r.id}
              onClick={() => void doDownload(r)}
            >
              {downloadBusyId === r.id
                ? t('pages.exports.downloading')
                : t('pages.exports.download')}
            </Button>
            {/* 290-v2: حجم الملفّ من `sizeBytes` — الخادم يعيده string, نُظهره
                مقروءاً. لا نخترع حين null. */}
            {r.sizeBytes && (
              <span dir="ltr" className="text-[10px] text-fg-subtle">
                {fmtBytes(r.sizeBytes)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-fg-subtle">{t('pages.exports.noFile')}</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.exports.title"
        subtitleKey="pages.exports.subtitle"
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            disabled={loading || refreshing}
            onClick={() => void refresh()}
          >
            {t('pages.exports.refresh')}
          </Button>
        }
      />

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}
      {downloadErrorKey && (
        <Alert kind="danger" titleKey={downloadErrorKey} />
      )}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState
          titleKey="pages.exports.empty"
          bodyKey="pages.exports.emptyBody"
        />
      )}

      {(loading || rows.length > 0) && (
        <>
          <Table
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={loading}
            emptyKey="pages.exports.empty"
          />
          {total > 0 && (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <div className="text-xs text-fg-subtle">
                <span dir="ltr">{rows.length}</span> / <span dir="ltr">{total}</span>{' '}
                — {t('pages.exports.totalLabel')}
              </div>
              {hasMore && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {t('pages.exports.loadMore')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
