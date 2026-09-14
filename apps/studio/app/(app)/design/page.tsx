'use client';

import { useState } from 'react';
import { Alert } from '@pf-mediakit/ui';
import { Badge } from '@pf-mediakit/ui';
import { Button } from '@pf-mediakit/ui';
import { Card } from '@pf-mediakit/ui';
import { Dialog } from '@pf-mediakit/ui';
import { Field } from '@pf-mediakit/ui';
import { Input } from '@pf-mediakit/ui';
import { PageHeader } from '@pf-mediakit/ui';
import { Table, type Column } from '@pf-mediakit/ui';
import { Textarea } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import { Ltr } from '@pf-mediakit/i18n';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatRelative,
} from '@/src/format';
import { useDigitStyle } from '@/src/format/settings';
import { DigitStyleSwitcher } from '@/src/format/DigitStyleSwitcher';

// /design — معرض النظام. يعرض كل atom + composite في مكان واحد للمراجعة
// البصرية (L-17). لا ربط، لا API — صور حقيقية لكل حالة.

interface Row {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly count: number;
}

const ROWS: readonly Row[] = [
  { id: 'prj_01', title: 'بطاقة عاجل — الأسواق', state: 'draft', count: 12 },
  { id: 'prj_02', title: 'ريلز — بيان صحفي', state: 'review', count: 3 },
  { id: 'prj_03', title: 'بطاقة اجتماعية — مؤتمر', state: 'approved', count: 8 },
];

const COLUMNS: readonly Column<Row>[] = [
  {
    key: 'title',
    headerKey: 'design.table.title',
    render: (r) => <span className="font-medium">{r.title}</span>,
  },
  {
    key: 'state',
    headerKey: 'design.table.state',
    render: (r) => (
      <Badge
        tone={
          r.state === 'approved'
            ? 'success'
            : r.state === 'review'
              ? 'warning'
              : 'neutral'
        }
      >
        {r.state}
      </Badge>
    ),
  },
  {
    key: 'count',
    headerKey: 'design.table.count',
    align: 'numeric',
    render: (r) => r.count,
  },
];

export default function DesignPage() {
  const { t, locale } = useLocale();
  const { style } = useDigitStyle();
  const [dialogOpen, setDialogOpen] = useState(false);
  const opts = { style, locale };
  const now = new Date('2026-09-04T14:23:11.523Z');
  const someMinutesAgo = new Date(now.getTime() - 7 * 60 * 1000).toISOString();
  const someHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  return (
    <div className="space-y-8">
      <PageHeader
        titleKey="design.title"
        subtitleKey="design.subtitle"
        action={
          <Button variant="primary" size="sm">
            {t('design.cta')}
          </Button>
        }
      />

      <Card titleKey="design.buttons.title" subtitleKey="design.buttons.subtitle">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">{t('actions.save')}</Button>
          <Button variant="secondary">{t('actions.cancel')}</Button>
          <Button variant="ghost">{t('actions.close')}</Button>
          <Button variant="danger">{t('actions.delete')}</Button>
          <Button variant="primary" loading>
            {t('actions.save')}
          </Button>
          <Button variant="secondary" disabled>
            {t('actions.save')}
          </Button>
          <Button variant="primary" size="sm">
            {t('design.cta')}
          </Button>
        </div>
      </Card>

      <Card titleKey="design.form.title" subtitleKey="design.form.subtitle">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field htmlFor="d-name" labelKey="design.form.name" required>
            <Input id="d-name" placeholder={t('design.form.namePh')} />
          </Field>
          <Field htmlFor="d-email" labelKey="auth.field.email">
            <Input id="d-email" type="email" dir="ltr" placeholder="me@agency.co" />
          </Field>
          <Field
            htmlFor="d-invalid"
            labelKey="design.form.invalid"
            errorKey="design.form.invalidError"
          >
            <Input id="d-invalid" invalid defaultValue="bad-value" />
          </Field>
          <Field
            htmlFor="d-note"
            labelKey="design.form.note"
            helpKey="design.form.noteHelp"
          >
            <Textarea id="d-note" rows={3} />
          </Field>
        </div>
      </Card>

      <Card titleKey="design.alerts.title">
        <div className="space-y-3">
          <Alert kind="info" titleKey="design.alerts.info" bodyKey="design.alerts.infoBody" />
          <Alert kind="success" titleKey="design.alerts.success" />
          <Alert kind="warning" titleKey="design.alerts.warning" bodyKey="design.alerts.warningBody" />
          <Alert kind="danger" titleKey="design.alerts.danger" bodyKey="design.alerts.dangerBody" />
        </div>
      </Card>

      <Card titleKey="design.table.title2">
        <Table
          columns={COLUMNS}
          rows={ROWS}
          getRowKey={(r) => r.id}
        />
      </Card>

      <Card titleKey="design.numeric.title" subtitleKey="design.numeric.subtitle" headerAction={<DigitStyleSwitcher />}>
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="rounded border border-border bg-surface-2 p-4">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {t('format.storage')}
            </div>
            <div className="mt-1 text-fg">
              <Ltr>
                {formatBytes(460.4 * 1024 * 1024 * 1024, style)} / {formatBytes(108.0 * 1024 * 1024 * 1024, style)}
              </Ltr>
            </div>
            <div className="mt-1 text-[10px] text-fg-subtle">
              L-23: بلا Ltr يظهر «108 / 460» معكوساً في RTL.
            </div>
          </div>

          <div className="rounded border border-border bg-surface-2 p-4">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {t('format.renders')}
            </div>
            <div className="mt-1 text-fg tabular">
              {formatNumber(12_345, style)}
            </div>
          </div>

          <div className="rounded border border-border bg-surface-2 p-4">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {t('format.lastRender')}
            </div>
            <div className="mt-1 text-fg">
              <Ltr>{formatDateTime(now.toISOString(), opts)}</Ltr>
            </div>
            <div className="mt-1 text-fg-muted text-xs">
              {formatRelative(someMinutesAgo, now, t, opts)} · {formatRelative(someHoursAgo, now, t, opts)}
            </div>
          </div>

          <div className="rounded border border-border bg-surface-2 p-4">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {t('format.usage')}
            </div>
            <div className="mt-1 tabular text-fg">
              {formatNumber(42, style)} / {formatNumber(100, style)}
            </div>
            <div className="mt-1 text-[10px] text-fg-subtle">
              بلا Ltr — «42 / 100» يظهر «100 / 42» في RTL (L-23 counter-example).
            </div>
          </div>
        </div>
      </Card>

      <Card titleKey="design.dialog.title">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          {t('design.dialog.open')}
        </Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          titleKey="design.dialog.confirmTitle"
          bodyKey="design.dialog.confirmBody"
          confirmKey="actions.confirm"
          onConfirm={() => setDialogOpen(false)}
          variant="danger"
        />
      </Card>
    </div>
  );
}
