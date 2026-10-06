'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@pf-mediakit/i18n';
import { Alert, Button } from '@pf-mediakit/ui';
import { ApiError } from '../api/errors';
import * as renders from '../api/endpoints/renders';
import type { RenderRow } from '../api/endpoints/renders';
import { downloadBlob } from '../lib/download-blob';

type Output = Awaited<ReturnType<typeof renders.getOutput>>;
type DownloadRender = Pick<RenderRow, 'id' | 'status' | 'format'>;

export function RenderDownloadLink({ row, output, label, onDownload }: {
  readonly row: DownloadRender;
  readonly output: Output | null;
  readonly label: string;
  readonly onDownload: React.MouseEventHandler<HTMLAnchorElement>;
}): JSX.Element | null {
  if (row.status !== 'succeeded' || !output) return null;
  return (
    <a
      href={output.url}
      download={`export-${row.id}.${row.format}`}
      onClick={onDownload}
      className="inline-flex max-w-full items-center justify-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span>{label}</span><bdi>{row.format.toUpperCase()}</bdi>
    </a>
  );
}

export function RenderDownload({ row }: { readonly row: DownloadRender }): JSX.Element | null {
  const { t } = useLocale();
  const [output, setOutput] = useState<Output | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const downloading = useRef(false);

  useEffect(() => {
    let active = true;
    setOutput(null);
    setErrorKey(null);
    if (row.status === 'succeeded') {
      void renders.getOutput(row.id).then(
        (next) => { if (active) setOutput(next); },
        (err: unknown) => {
          if (active) setErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
        },
      );
    }
    return () => { active = false; };
  }, [row.id, row.status, attempt]);

  async function download(event: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
    event.preventDefault();
    if (!output || downloading.current) return;
    downloading.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      // Renew at the point of use: a project can remain open past the signed URL's lifetime.
      const fresh = await renders.getOutput(row.id);
      setOutput(fresh);
      const response = await fetch(fresh.url);
      if (!response.ok) {
        setErrorKey('errors.EXPORT_DOWNLOAD_FAILED');
        return;
      }
      downloadBlob(await response.blob(), `export-${row.id}.${row.format}`);
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
    } finally {
      downloading.current = false;
      setBusy(false);
    }
  }

  if (row.status !== 'succeeded') return null;
  return (
    <div className="space-y-2" aria-busy={busy}>
      <RenderDownloadLink row={row} output={output}
        label={t('pages.projects.download')} onDownload={(event) => void download(event)} />
      {!output && !errorKey && <p role="status" className="text-xs text-fg-muted">{t('common.loading')}</p>}
      {busy && <p role="status" className="text-xs text-fg-muted">{t('pages.brandKits.editor.export.downloadingStep')}</p>}
      {errorKey && (
        <>
          <Alert kind="danger" titleKey={errorKey} />
          {!output && <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</Button>}
        </>
      )}
    </div>
  );
}
