'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@pf-mediakit/i18n';
import { Alert, Button } from '@pf-mediakit/ui';
import { ApiError } from '../api/errors';
import * as renders from '../api/endpoints/renders';
import type { RenderRow } from '../api/endpoints/renders';
import { RenderDownload } from './RenderDownload';

export function ProjectLastExport({ projectId }: { readonly projectId: string }): JSX.Element {
  const { t } = useLocale();
  const [row, setRow] = useState<RenderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRow(null);
    setErrorKey(null);
    // The existing endpoint sorts by createdAt descending, including across pagination.
    void renders.list({ limit: 1, filter: { project_id: projectId, status: 'succeeded' } }).then(
      (page) => { if (active) { setRow(page.data[0] ?? null); setLoading(false); } },
      (err: unknown) => {
        if (active) {
          setErrorKey(err instanceof ApiError ? err.messageKey : 'errors.NETWORK_ERROR');
          setLoading(false);
        }
      },
    );
    return () => { active = false; };
  }, [projectId, attempt]);

  if (loading) return <span className="text-xs text-fg-muted">{t('common.loading')}</span>;
  if (errorKey) return (
    <div className="space-y-2">
      <Alert kind="danger" titleKey={errorKey} />
      <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</Button>
    </div>
  );
  return row ? <RenderDownload key={row.id} row={row} /> : <span>—</span>;
}
