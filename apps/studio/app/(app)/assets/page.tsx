'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import {
  ApiError,
  assets,
  bytesShort,
  uploadToSignedUrl,
} from '@/src/api';
import type { AssetKind, AssetListItem } from '@/src/api/endpoints/assets';

// S8 — منتقي الأصول. يستهلك mk-api الحقيقي (أو mock حسب المبدِّل).
//
// الرفع مباشر إلى signed URL عبر src/api/uploader.ts — مفصول عن طبقة
// client.ts (§9.1). SVG-with-text تحذير خاص: العميل يعرض ويسأل الإقرار.

const KINDS: readonly AssetKind[] = [
  'font', 'logo', 'image', 'audio', 'video', 'lottie', 'svg',
];

const KIND_CT: Record<AssetKind, string[]> = {
  font: ['font/otf', 'font/ttf', 'font/woff', 'font/woff2'],
  logo: ['image/png', 'image/svg+xml'],
  image: ['image/png', 'image/jpeg', 'image/webp'],
  audio: ['audio/mpeg', 'audio/wav'],
  video: ['video/mp4', 'video/webm'],
  lottie: ['application/json'],
  svg: ['image/svg+xml'],
};

function guessKindFromFile(file: File): AssetKind {
  const ct = file.type;
  if (ct.startsWith('image/svg')) return 'svg';
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('font/') || /\.(otf|ttf|woff2?|eot)$/.test(file.name)) return 'font';
  if (ct === 'application/json' || file.name.endsWith('.json')) return 'lottie';
  return 'image';
}

export default function AssetsPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<AssetKind | 'all'>('all');
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  // Upload state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<AssetKind>('image');
  const [file, setFile] = useState<File | null>(null);
  const [licenseAck, setLicenseAck] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadErrorKey, setUploadErrorKey] = useState<string | null>(null);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [svgWarnAckNeeded, setSvgWarnAckNeeded] = useState(false);

  // Delete state.
  const [toDelete, setToDelete] = useState<AssetListItem | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const opts: Parameters<typeof assets.list>[0] =
        kindFilter !== 'all' ? { filter: { kind: kindFilter } } : {};
      const page = await assets.list(opts);
      setRows([...page.data]);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter]);

  function chooseFile(): void {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadKind(guessKindFromFile(f));
    setUploadErrorKey(null);
    setSvgWarnAckNeeded(false);
    setPendingAssetId(null);
    setLicenseAck(false);
  }

  async function finalizeCall(assetId: string, ackWarnings: string[] = []): Promise<void> {
    try {
      const finalizeArgs: Parameters<typeof assets.finalize>[1] = {
        ...(ackWarnings.length > 0 ? { acknowledgedWarnings: ackWarnings } : {}),
        ...((uploadKind === 'font' || uploadKind === 'lottie')
          ? { licenseAck }
          : {}),
      };
      await assets.finalize(assetId, finalizeArgs);
      // نجاح: reset + refresh
      setFile(null);
      setPendingAssetId(null);
      setSvgWarnAckNeeded(false);
      setLicenseAck(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_SVG_WITH_TEXT_WARNING') {
        setSvgWarnAckNeeded(true);
        return;
      }
      setUploadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UPLOAD_FAILED');
    }
  }

  async function startUpload(): Promise<void> {
    if (!file) return;
    setUploading(true);
    setUploadErrorKey(null);
    setProgress(0);
    try {
      const contentType = file.type || KIND_CT[uploadKind]?.[0] || 'application/octet-stream';
      const url = await assets.requestUploadUrl({
        kind: uploadKind,
        filename: file.name,
        contentType,
        sizeBytes: file.size,
      });
      setPendingAssetId(url.assetId);
      await uploadToSignedUrl({
        uploadUrl: url.uploadUrl,
        file,
        contentType,
        maxSizeBytes: url.maxSizeBytes,
        onEvent: (e) => {
          if (e.kind === 'progress' && e.total) {
            setProgress(Math.round((e.loaded! / e.total) * 100));
          }
        },
      });
      await finalizeCall(url.assetId);
    } catch (err) {
      setUploadErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UPLOAD_FAILED');
    } finally {
      setUploading(false);
    }
  }

  async function acknowledgeSvgAndFinalize(): Promise<void> {
    if (!pendingAssetId) return;
    setSvgWarnAckNeeded(false);
    setUploadErrorKey(null);
    await finalizeCall(pendingAssetId, ['SVG_HAS_TEXT']);
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDeleteErrorKey(null);
    try {
      await assets.remove(toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDeleteErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  const columns: readonly Column<AssetListItem>[] = [
    {
      key: 'filename',
      headerKey: 'pages.assets.col.filename',
      render: (r) => <span className="font-medium">{r.filename}</span>,
    },
    {
      key: 'kind',
      headerKey: 'pages.assets.col.kind',
      render: (r) => <Badge tone="neutral">{t(`pages.assets.kind.${r.kind}`)}</Badge>,
    },
    {
      key: 'size',
      headerKey: 'pages.assets.col.size',
      align: 'numeric',
      render: (r) => bytesShort(r.sizeBytes),
    },
    {
      key: 'actions',
      headerKey: 'pages.assets.col.actions',
      align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
          {t('pages.assets.delete')}
        </Button>
      ),
    },
  ];

  const filterKinds: readonly (AssetKind | 'all')[] = ['all', ...KINDS];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.assets.title"
        subtitleKey="pages.assets.subtitle"
      />

      {/* Upload card */}
      <Card titleKey="pages.assets.upload">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="secondary" onClick={chooseFile} disabled={uploading}>
              {t('pages.assets.chooseFile')}
            </Button>
            {file && (
              <div className="text-sm text-fg-muted">
                <span dir="ltr">{file.name}</span>
                <span className="mx-2">·</span>
                <span className="tabular">{bytesShort(file.size)}</span>
                <span className="mx-2">·</span>
                <Badge tone="neutral">{t(`pages.assets.kind.${uploadKind}`)}</Badge>
              </div>
            )}
            <div className="ms-auto flex items-center gap-3">
              {file && !uploading && !svgWarnAckNeeded && (
                <Button variant="primary" onClick={startUpload}>
                  {t('pages.assets.upload')}
                </Button>
              )}
              {uploading && (
                <div className="text-xs text-fg-muted">
                  {t('pages.assets.uploading')} <span className="tabular">{progress}%</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {(uploadKind === 'font' || uploadKind === 'lottie') && file && !svgWarnAckNeeded && (
            <Field htmlFor="license-ack" labelKey="pages.assets.licenseAck.title" helpKey="pages.assets.licenseAck.body">
              <div className="flex items-center gap-2">
                <input
                  id="license-ack"
                  type="checkbox"
                  checked={licenseAck}
                  onChange={(e) => setLicenseAck(e.target.checked)}
                />
                <label htmlFor="license-ack" className="text-sm">
                  {t('pages.assets.licenseAck.checkbox')}
                </label>
              </div>
            </Field>
          )}

          {svgWarnAckNeeded && (
            <Alert kind="warning" titleKey="pages.assets.svgWarn.title" bodyKey="pages.assets.svgWarn.body">
              <Button variant="primary" size="sm" onClick={acknowledgeSvgAndFinalize}>
                {t('pages.assets.svgWarn.acknowledge')}
              </Button>
            </Alert>
          )}

          {uploadErrorKey && (
            <Alert kind="danger" titleKey={uploadErrorKey} />
          )}
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterKinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKindFilter(k)}
            className={
              'rounded border px-3 py-1 text-xs ' +
              (k === kindFilter
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-fg-muted hover:text-fg')
            }
          >
            {t(`pages.assets.kind.${k}`)}
          </button>
        ))}
      </div>

      {/* Assets list */}
      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}
      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState titleKey="pages.assets.empty" bodyKey="pages.assets.emptyBody" />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.assets.empty"
        />
      )}

      {/* Delete confirm */}
      <Dialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDeleteErrorKey(null);
        }}
        titleKey="pages.assets.confirmDelete"
        bodyKey="pages.assets.confirmDeleteBody"
        confirmKey="pages.assets.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {deleteErrorKey && <Alert kind="danger" titleKey={deleteErrorKey} />}
      </Dialog>
    </div>
  );
}
