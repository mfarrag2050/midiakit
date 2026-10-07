import { describe, it, expect, vi } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import { buildTimeline } from './build-timeline';

describe('buildTimeline', () => {
  it('preserves two sequential clips and derives the timeline duration', () => {
    const editorState = {
      fps: 25,
      size: 'portrait',
      tracks: [{
        id: 'media', type: 'media', index: 0,
        items: [
          { id: 'first', start: 0, end: 3, src: 'asset:first' },
          { id: 'second', start: 3, end: 5, src: 'asset:second' },
        ],
      }],
    } satisfies Parameters<typeof buildTimeline>[0];
    const before = structuredClone(editorState);

    const timeline = buildTimeline(editorState);

    expect(timeline).toStrictEqual({
      duration: 5, fps: 25, size: 'portrait', tracks: before.tracks,
    } satisfies Timeline);
    expect(timeline?.tracks[0]?.items).toHaveLength(2);
    expect(editorState).toStrictEqual(before);
  });

  it('uses the latest end across parallel tracks instead of adding durations', () => {
    const timeline = buildTimeline({
      fps: 30,
      size: 'reel',
      tracks: [
        { id: 'media', type: 'media', index: 0,
          items: [{ id: 'clip', start: 0, end: 4 }] },
        { id: 'text', type: 'text', index: 1,
          items: [{ id: 'title', start: 0, end: 7, value: 'عنوان' }] },
      ],
    });

    expect(timeline?.duration).toBe(7);
  });

  it('returns null when there are no tracks or all tracks have no items', () => {
    const emptyTracks: Timeline['tracks'][] = [
      [],
      [{ id: 'empty', type: 'media', index: 0, items: [] }],
    ];

    for (const tracks of emptyTracks) {
      expect(buildTimeline({ tracks, fps: 30, size: 'reel' })).toBeNull();
    }
  });
});

// 601e: run with the owned Studio at 19081; HTTP is intercepted, never the editor.
it('disables MP4 export without a project or clips and submits the edited timeline', async () => {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('pfmk.studio.session.access', crypto.randomUUID());
      localStorage.setItem('pfmk.studio.locale', 'ar');
    });
    let hasProject = false;
    let rejectExport = true;
    let rejectOutput = false;
    let delayOutput = false;
    let releaseOutput: (() => Promise<void>) | undefined;
    const submitted: Array<{ project_id: string; format: string; timeline: Timeline }> = [];
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/v1/')) { void request.continue(); return; }
      const headers = {
        'access-control-allow-origin': 'http://127.0.0.1:19081',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      };
      if (request.method() === 'OPTIONS') { void request.respond({ status: 204, headers }); return; }
      let body: unknown = {};
      let status = 200;
      if (url.pathname === '/v1/projects') {
        body = { data: hasProject ? [{ id: 'project-test', title: 'مشروع تجريبي' }] : [], nextCursor: null };
      } else if (url.pathname === '/v1/renders' && request.method() === 'POST') {
        submitted.push(JSON.parse(request.postData() ?? '{}'));
        status = rejectExport ? 403 : 202;
        body = rejectExport
          ? { error: { code: 'INSUFFICIENT_ROLE', message: 'RAW_SERVER_TEXT', field: null } }
          : { id: `render-test-${submitted.length}`, status: 'queued' };
      } else if (/^\/v1\/renders\/render-test-\d+$/.test(url.pathname)) {
        body = { id: 'render-test', status: 'succeeded', output_url: null };
      } else if (url.pathname.endsWith('/output')) {
        status = rejectOutput ? 403 : 200;
        body = rejectOutput
          ? { error: { code: 'INSUFFICIENT_ROLE', message: 'RAW_OUTPUT_ERROR', field: null } }
          : { url: `http://127.0.0.1:19088/${url.pathname.split('/')[3]}.mp4`, expiresAt: '2099-01-01T00:00:00Z' };
        if (delayOutput) {
          releaseOutput = () => request.respond({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
          return;
        }
      }
      void request.respond({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://127.0.0.1:19081/reels');
    await page.waitForFunction(() => document.body.textContent?.includes('أنشئ مشروعاً أوّلاً'));
    expect(await page.$eval('[data-testid="reels-export"]', (el) => (el as HTMLButtonElement).disabled)).toBe(true);
    expect(submitted).toHaveLength(0);

    hasProject = true;
    await page.reload();
    await page.waitForSelector('[data-testid="reels-export"]:not(:disabled)');
    await page.click('[data-testid="reels-item-title-01"]');
    await page.$eval('[data-testid="reels-prop-value"]', (el) => {
      const input = el as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'عنوان التصدير المعدّل');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-testid="reels-export"]');
    const ar = (await import('../../../../../packages/i18n/src/ar.json')).default;
    await page.waitForFunction((message) => document.body.textContent?.includes(message), {}, ar.errors.INSUFFICIENT_ROLE);
    expect(await page.evaluate(() => document.body.textContent)).not.toContain('RAW_SERVER_TEXT');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ project_id: 'project-test', format: 'mp4' });
    expect(submitted[0]?.timeline.tracks.flatMap((track) => track.items).find((clip) => clip.id === 'title-01')?.value).toBe('عنوان التصدير المعدّل');
    expect(submitted[0]?.timeline.duration).toBe(32);

    rejectExport = false;
    await page.click('[data-testid="reels-export"]');
    await page.waitForSelector('[data-testid="reels-export-download"]');
    expect(await page.$eval('[data-testid="reels-export-download"]', (el) => el.getAttribute('href'))).toBe('http://127.0.0.1:19088/render-test-2.mp4');

    rejectOutput = true;
    await page.click('[data-testid="reels-export"]');
    // 611: الانتظار على شرطٍ حتميّ — رابط التنزيل السابق (render-test-2) يُمسح
    // عبر setOutputUrl(null) في exportMp4 قبل أوّل await. React قد لا يكون
    // قد flushed قبل $() السريع ⇒ assertion يتعطّل بـstale element.
    await page.waitForSelector('[data-testid="reels-export-download"]', { hidden: true });
    expect(await page.$('[data-testid="reels-export-download"]')).toBeNull();
    await page.waitForFunction((message) => document.body.textContent?.includes(message), {}, ar.errors.INSUFFICIENT_ROLE);
    expect(await page.evaluate(() => document.body.textContent)).not.toContain('RAW_OUTPUT_ERROR');

    rejectOutput = false;
    delayOutput = true;
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/render-test-4'));
    await page.click('[data-testid="reels-export"]');
    await responsePromise;
    await vi.waitFor(() => expect(releaseOutput).toBeDefined());
    delayOutput = false;
    // 611: `vi.waitFor(releaseOutput defined)` يُثبت أنّ طلبَ /output اعتُرِض،
    // لكن ذلك يحدث بعد `setRenderRow(row)` مباشرةً · قبل أن تنعكس حالة
    // succeeded في React (renderActive→false ⇒ canExport→true). النقرُ
    // الفوريّ قد يصطدم بزرٍّ لم يُعَد تمكينه ⇒ onClick لا يفعل شيئاً ⇒
    // waitForSelector التالي يُعلَّق إلى 30s. ننتظر الزرَّ ممكَّناً أوّلاً.
    await page.waitForSelector('[data-testid="reels-export"]:not(:disabled)');
    await page.click('[data-testid="reels-export"]');
    await page.waitForSelector('[data-testid="reels-export-download"]');
    await releaseOutput!();
    await page.waitForNetworkIdle();
    expect(await page.$eval('[data-testid="reels-export-download"]', (el) => el.getAttribute('href'))).toBe('http://127.0.0.1:19088/render-test-5.mp4');
    while (await page.$('[data-testid^="reels-item-"]')) {
      await page.$eval('[data-testid^="reels-item-"]', (el) => (el as HTMLButtonElement).click());
      await page.click('[data-testid="reels-delete"]');
    }
    expect(await page.$eval('[data-testid="reels-export"]', (el) => (el as HTMLButtonElement).disabled)).toBe(true);
    await page.click('[data-testid="reels-export"]');
    expect(submitted).toHaveLength(5);
  } finally {
    await browser.close();
  }
}, 60000);
