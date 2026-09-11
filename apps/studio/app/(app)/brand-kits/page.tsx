'use client';

import { useEffect, useState } from 'react';
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
  Textarea,
  type Column,
} from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { ApiError, brandKits, getSessionUser } from '@/src/api';
import type { BrandKitFull, BrandKitSummary } from '@/src/api/endpoints/brand-kits';

// S9+S10 — الهويات. list · create · delete · fontAck · assets-version.
//
// **ملاحظات SYNC-β معالَجة:**
// - ackFontLicense response يحمل جزءاً (`{fonts:{primary}}`) — ندمج
//   محلياً في selected بدل استبدال كامل.
// - bumpAssetsVersion 409 DIFF_NOT_ACKNOWLEDGED خطوة تدفّق لا فشل:
//   نعرض الفرق، نطلب الإقرار، ثم نعيد.

interface ExtendedSummary extends BrandKitSummary {
  fontFamily?: string;
  fontSource?: string;
  assetsVersion?: string;
}

function extractFontSummary(full: BrandKitFull): {
  fontFamily?: string;
  fontSource?: string;
  assetsVersion?: string;
} {
  const cfg = full.config as {
    fonts?: { primary?: { family?: string; source?: string } };
    assets?: { version?: string };
  };
  const family = cfg?.fonts?.primary?.family;
  const source = cfg?.fonts?.primary?.source;
  const version = cfg?.assets?.version;
  return {
    ...(family ? { fontFamily: family } : {}),
    ...(source ? { fontSource: source } : {}),
    ...(version ? { assetsVersion: version } : {}),
  };
}

export default function BrandKitsPage(): JSX.Element {
  const { t } = useLocale();
  const [rows, setRows] = useState<ExtendedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createErrorKey, setCreateErrorKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Delete dialog
  const [toDelete, setToDelete] = useState<ExtendedSummary | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  // Font ack dialog
  const [fontAckKit, setFontAckKit] = useState<BrandKitFull | null>(null);
  const [ackFamily, setAckFamily] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [ackNotes, setAckNotes] = useState('');
  const [ackSubmitting, setAckSubmitting] = useState(false);
  const [ackErrorKey, setAckErrorKey] = useState<string | null>(null);
  const [ackDone, setAckDone] = useState<{ ackBy: string; ackAt: string } | null>(null);

  // Assets-version dialog
  const [versionKit, setVersionKit] = useState<BrandKitFull | null>(null);
  const [targetVersion, setTargetVersion] = useState('');
  const [versionChecked, setVersionChecked] = useState(false);
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [versionErrorKey, setVersionErrorKey] = useState<string | null>(null);
  const [versionStep, setVersionStep] = useState<'input' | 'diff'>('input');

  async function refresh(): Promise<void> {
    setLoading(true);
    setListErrorKey(null);
    try {
      const page = await brandKits.list();
      // Enrich each row by fetching full config (parallel).
      const enriched = await Promise.all(
        page.data.map(async (r): Promise<ExtendedSummary> => {
          try {
            const full = await brandKits.get(r.id);
            return { ...r, ...extractFontSummary(full) };
          } catch {
            return { ...r };
          }
        })
      );
      setRows(enriched);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doCreate(): Promise<void> {
    setCreateErrorKey(null);
    setCreating(true);
    try {
      await brandKits.create({ name: newName.trim() });
      setNewName('');
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setCreateErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setCreating(false);
    }
  }

  async function doDelete(): Promise<void> {
    if (!toDelete) return;
    setDeleteErrorKey(null);
    try {
      await brandKits.remove(toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      setDeleteErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  async function openFontAck(summary: ExtendedSummary): Promise<void> {
    setAckErrorKey(null);
    setAckDone(null);
    setAckChecked(false);
    setAckNotes('');
    try {
      const full = await brandKits.get(summary.id);
      setFontAckKit(full);
      setAckFamily(summary.fontFamily ?? '');
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  async function submitFontAck(): Promise<void> {
    if (!fontAckKit) return;
    setAckErrorKey(null);
    setAckSubmitting(true);
    try {
      const user = getSessionUser();
      const res = await brandKits.ackFontLicense(fontAckKit.id, ackFamily, {
        licenseAck: ackChecked,
        acknowledgedBy: user?.id ?? 'usr_unknown',
        ...(ackNotes ? { notes: ackNotes } : {}),
      });
      setAckDone({ ackBy: res.fonts.primary.ackBy, ackAt: res.fonts.primary.ackAt });
      await refresh();
    } catch (err) {
      setAckErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setAckSubmitting(false);
    }
  }

  async function openAssetsVersion(summary: ExtendedSummary): Promise<void> {
    setVersionErrorKey(null);
    setVersionChecked(false);
    setVersionStep('input');
    setTargetVersion('');
    try {
      const full = await brandKits.get(summary.id);
      setVersionKit(full);
    } catch (err) {
      setListErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    }
  }

  async function submitAssetsVersion(): Promise<void> {
    if (!versionKit) return;
    setVersionErrorKey(null);
    setVersionSubmitting(true);
    try {
      await brandKits.bumpAssetsVersion(versionKit.id, {
        targetVersion,
        acknowledgedDiff: versionChecked,
      });
      setVersionKit(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DIFF_NOT_ACKNOWLEDGED') {
        // 409 كخطوة تدفّق: انتقل إلى شاشة الفرق واطلب الإقرار.
        setVersionStep('diff');
        return;
      }
      setVersionErrorKey(err instanceof ApiError ? err.messageKey : 'errors.UNKNOWN');
    } finally {
      setVersionSubmitting(false);
    }
  }

  const columns: readonly Column<ExtendedSummary>[] = [
    {
      key: 'name',
      headerKey: 'pages.brandKits.col.name',
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: 'font',
      headerKey: 'pages.brandKits.col.font',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span dir="ltr">{r.fontFamily ?? '—'}</span>
          {r.fontSource && (
            <Badge tone={r.fontSource === 'custom' ? 'success' : 'neutral'}>
              {r.fontSource}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'version',
      headerKey: 'pages.brandKits.col.assetsVersion',
      align: 'numeric',
      render: (r) => <span dir="ltr">{r.assetsVersion ?? '—'}</span>,
    },
    {
      key: 'actions',
      headerKey: 'pages.brandKits.col.actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => openFontAck(r)}>
            {t('pages.brandKits.fontAck.title')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openAssetsVersion(r)}>
            {t('pages.brandKits.assetsVersion.title')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
            {t('pages.brandKits.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.brandKits.title"
        subtitleKey="pages.brandKits.subtitle"
        action={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            {t('pages.brandKits.create')}
          </Button>
        }
      />

      {listErrorKey && <Alert kind="danger" titleKey={listErrorKey} />}

      {!listErrorKey && !loading && rows.length === 0 && (
        <EmptyState titleKey="pages.brandKits.empty" bodyKey="pages.brandKits.emptyBody" />
      )}
      {(loading || rows.length > 0) && (
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={loading}
          emptyKey="pages.brandKits.empty"
        />
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setNewName(''); setCreateErrorKey(null); }}
        titleKey="pages.brandKits.createTitle"
        confirmKey="pages.brandKits.create"
        onConfirm={doCreate}
      >
        <Field htmlFor="bk-name" labelKey="pages.brandKits.nameLabel" required>
          <Input
            id="bk-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
          />
        </Field>
        {createErrorKey && <div className="mt-3"><Alert kind="danger" titleKey={createErrorKey} /></div>}
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={toDelete !== null}
        onClose={() => { setToDelete(null); setDeleteErrorKey(null); }}
        titleKey="pages.brandKits.confirmDelete"
        bodyKey="pages.brandKits.confirmDeleteBody"
        confirmKey="pages.brandKits.delete"
        variant="danger"
        onConfirm={doDelete}
      >
        {deleteErrorKey && <Alert kind="danger" titleKey={deleteErrorKey} />}
      </Dialog>

      {/* Font ack dialog */}
      <Dialog
        open={fontAckKit !== null}
        onClose={() => { setFontAckKit(null); setAckDone(null); }}
        titleKey="pages.brandKits.fontAck.title"
        bodyKey="pages.brandKits.fontAck.body"
      >
        {!ackDone ? (
          <div className="space-y-3">
            <Field htmlFor="ack-family" labelKey="pages.brandKits.fontAck.family" required>
              <Input
                id="ack-family"
                value={ackFamily}
                dir="ltr"
                onChange={(e) => setAckFamily(e.target.value)}
                disabled={ackSubmitting}
              />
            </Field>
            <Field htmlFor="ack-notes" labelKey="pages.brandKits.fontAck.notes">
              <Textarea
                id="ack-notes"
                value={ackNotes}
                onChange={(e) => setAckNotes(e.target.value)}
                disabled={ackSubmitting}
                rows={2}
              />
            </Field>
            <div className="flex items-center gap-2">
              <input
                id="ack-checkbox"
                type="checkbox"
                checked={ackChecked}
                onChange={(e) => setAckChecked(e.target.checked)}
              />
              <label htmlFor="ack-checkbox" className="text-sm">
                {t('pages.brandKits.fontAck.checkbox')}
              </label>
            </div>
            {ackErrorKey && <Alert kind="danger" titleKey={ackErrorKey} />}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" loading={ackSubmitting} onClick={submitFontAck}>
                {t('pages.brandKits.fontAck.submit')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded border border-success/30 bg-success/10 p-4 text-sm">
            <div>
              <span className="text-fg-muted">{t('pages.brandKits.fontAck.ackedBy')}:</span>{' '}
              <span dir="ltr">{ackDone.ackBy}</span>
            </div>
            <div className="mt-1">
              <span className="text-fg-muted">{t('pages.brandKits.fontAck.ackedAt')}:</span>{' '}
              <span dir="ltr">{ackDone.ackAt}</span>
            </div>
          </div>
        )}
      </Dialog>

      {/* Assets-version dialog */}
      <Dialog
        open={versionKit !== null}
        onClose={() => { setVersionKit(null); setVersionErrorKey(null); }}
        titleKey="pages.brandKits.assetsVersion.title"
        bodyKey="pages.brandKits.assetsVersion.body"
      >
        <div className="space-y-3">
          <div className="text-sm text-fg-muted">
            {t('pages.brandKits.assetsVersion.current')}:{' '}
            <span dir="ltr" className="text-fg">
              {(versionKit?.config as { assets?: { version?: string } })?.assets?.version ?? '—'}
            </span>
          </div>
          <Field
            htmlFor="tgt-version"
            labelKey="pages.brandKits.assetsVersion.target"
            helpKey="pages.brandKits.assetsVersion.targetHint"
          >
            <Input
              id="tgt-version"
              value={targetVersion}
              dir="ltr"
              placeholder="2026.03"
              onChange={(e) => setTargetVersion(e.target.value)}
              disabled={versionSubmitting}
            />
          </Field>
          {versionStep === 'diff' && (
            <Alert kind="warning" titleKey="pages.brandKits.assetsVersion.diffTitle" bodyKey="pages.brandKits.assetsVersion.diffPlaceholder">
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="ver-checkbox"
                  type="checkbox"
                  checked={versionChecked}
                  onChange={(e) => setVersionChecked(e.target.checked)}
                />
                <label htmlFor="ver-checkbox" className="text-sm">
                  {t('pages.brandKits.assetsVersion.ackCheckbox')}
                </label>
              </div>
            </Alert>
          )}
          {versionErrorKey && <Alert kind="danger" titleKey={versionErrorKey} />}
          <div className="flex justify-end">
            <Button variant="primary" size="sm" loading={versionSubmitting} onClick={submitAssetsVersion}>
              {t('pages.brandKits.assetsVersion.submit')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
