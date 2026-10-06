import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RenderDownloadLink } from './RenderDownload';
import type { RenderStatus } from '../api/endpoints/renders';

describe('600: successful project render has a download link', () => {
  it.each(['png', 'mp4'] as const)('links to the signed output for %s, with the matching filename', (format) => {
    const markup = renderToStaticMarkup(createElement(RenderDownloadLink, {
      row: { id: 'render-600', status: 'succeeded', format },
      output: { url: 'https://storage.example.test/output', expiresAt: '2026-10-06T12:00:00Z' },
      label: 'تنزيل', onDownload: () => {},
    }));
    expect(markup).toContain('href="https://storage.example.test/output"');
    expect(markup).toContain(`download="export-render-600.${format}"`);
    expect(markup).toContain('تنزيل');
    expect(markup).toContain(`<bdi>${format.toUpperCase()}</bdi>`);
  });

  it.each<RenderStatus>(['queued', 'running', 'failed', 'cancelled', 'cancelling'])(
    'does not expose a stale output for a %s render', (status) => {
      expect(renderToStaticMarkup(createElement(RenderDownloadLink, {
        row: { id: 'render-600', status, format: 'png' },
        output: { url: 'https://storage.example.test/stale', expiresAt: '2026-10-06T12:00:00Z' },
        label: 'Download', onDownload: () => {},
      }))).toBe('');
    },
  );

  it('does not invent a link before the signed output arrives', () => {
    expect(renderToStaticMarkup(createElement(RenderDownloadLink, {
      row: { id: 'render-600', status: 'succeeded', format: 'png' },
      output: null, label: 'Download', onDownload: () => {},
    }))).toBe('');
  });
});
