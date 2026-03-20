import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

async function getExtensionIdFromContext(context: any): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers?.() ?? [];
    const extWorker = workers.find((w: any) => String(w.url?.() ?? '').startsWith('chrome-extension://'));
    if (extWorker) {
      const url: string = extWorker.url();
      const match = /chrome-extension:\/\/(?<id>[a-z]+)\//.exec(url);
      if (match?.groups?.id) return match.groups.id;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Failed to locate extension id from service workers: ${JSON.stringify((context.serviceWorkers?.() ?? []).map((w: any) => w.url?.()))}`);
}

async function waitForPopupLoaded(extensionPage: any): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug), { timeout: 20_000 });
  await extensionPage.waitForFunction(() => !document.querySelector('.skeleton-results'), { timeout: 30_000 });
}

async function launchExtension(): Promise<{
  context: any;
  extensionUrl: string;
  appPage: any;
  extPage: any;
  consoleMessages: string[];
  pageErrors: string[];
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'table-extract-pw-'));
  const extensionPath = resolve(process.cwd(), 'dist');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const extensionId = await getExtensionIdFromContext(context);
  const extensionUrl = `chrome-extension://${extensionId}/index.html`;

  const appPage = await context.newPage();
  const extPage = await context.newPage();

  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  extPage.on('console', (msg: any) => consoleMessages.push(`${msg.type?.() ?? 'log'}: ${msg.text?.() ?? ''}`));
  extPage.on('pageerror', (err: any) => pageErrors.push(String(err?.message ?? err)));

  return { context, extensionUrl, appPage, extPage, consoleMessages, pageErrors };
}

test('shows actionable error on file:// pages', async () => {
  const { context, extensionUrl, appPage, extPage } = await launchExtension();
  try {
    const dir = mkdtempSync(join(tmpdir(), 'table-extract-file-'));
    const htmlPath = join(dir, 'fixture.html');
    writeFileSync(
      htmlPath,
      '<html><head><title>Local File</title></head><body><table><tr><th>A</th></tr><tr><td>1</td></tr></table></body></html>',
      'utf8',
    );

    await appPage.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await expect(extPage.getByText(/file:\/\//i)).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByText(/Allow access to file URLs/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

test('HTML table title inference does not hang when no headings exist', async () => {
  const { context, extensionUrl, appPage, extPage } = await launchExtension();
  try {
    await appPage.route('https://example.test/title-loop', async (route: any) => {
      const html = `
        <html>
          <head><title>Title Loop Fixture</title></head>
          <body>
            <div class="outer">
              <div class="inner">
                <table>
                  <tr><th>Col</th></tr>
                  <tr><td>R1C1</td></tr>
                </table>
              </div>
            </div>
          </body>
        </html>
      `;
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await appPage.goto('https://example.test/title-loop', { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await expect(extPage.getByText('R1C1')).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

test('extracts ARIA role=table grids when no <table> exists', async () => {
  const { context, extensionUrl, appPage, extPage } = await launchExtension();
  try {
    await appPage.route('https://example.test/aria-table', async (route: any) => {
      const html = `
        <html>
          <head><title>ARIA Table Fixture</title></head>
          <body>
            <div role="table" aria-label="ARIA Table">
              <div role="row">
                <div role="columnheader">Name</div>
                <div role="columnheader">Age</div>
              </div>
              <div role="row">
                <div role="cell">Alice</div>
                <div role="cell">30</div>
              </div>
              <div role="row">
                <div role="cell">Bob</div>
                <div role="cell">40</div>
              </div>
            </div>
          </body>
        </html>
      `;
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await appPage.goto('https://example.test/aria-table', { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await expect(extPage.getByText('Alice')).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByText('Bob')).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

test('extracts repeating article/card lists into a table (no <table>)', async () => {
  const { context, extensionUrl, appPage, extPage } = await launchExtension();
  try {
    await appPage.route('https://example.test/card-list', async (route: any) => {
      const items = Array.from({ length: 6 }).map((_, i) => `
        <article class="full-docsum" data-rel-pos="${i + 1}">
          <a class="docsum-title" href="https://example.test/p/${i + 1}">Title ${i + 1}</a>
          <div class="docsum-citation">
            <span class="docsum-authors">Author ${i + 1}</span>
            <span class="docsum-pmid">PMID${1000 + i}</span>
          </div>
        </article>
      `).join('\n');

      const html = `
        <html>
          <head><title>Card List Fixture</title></head>
          <body>
            <section class="search-results-list">
              ${items}
            </section>
          </body>
        </html>
      `;

      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await appPage.goto('https://example.test/card-list', { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await expect(extPage.getByText('Title 1').first()).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByText('Author 1').first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

test('extracts Google Scholar results from fixture into a table', async () => {
  const { context, extensionUrl, appPage, extPage } = await launchExtension();
  try {
    await appPage.route('https://example.test/scholar', async (route: any) => {
      const body = readFileSync(resolve(process.cwd(), 'tests/google-scholar-result.html'), 'utf8');
      const html = `<html><head><title>Google Scholar Fixture</title></head><body>${body}</body></html>`;
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await appPage.goto('https://example.test/scholar', { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await expect(extPage.getByText(/Managing gut health/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByText(/Cited by/i).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

test('Rows telemetry is fail-open when env/config is missing', async () => {
  const { context, extensionUrl, appPage, extPage, consoleMessages, pageErrors } = await launchExtension();
  try {
    await appPage.route('https://example.test/telemetry', async (route: any) => {
      const html = `
        <html>
          <head><title>Telemetry Fixture</title></head>
          <body>
            <table>
              <tr><th>H</th></tr>
              <tr><td>V</td></tr>
            </table>
          </body>
        </html>
      `;
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await appPage.goto('https://example.test/telemetry', { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();

    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    // Prevent the popup from closing during the copy path and stub clipboard.
    await extPage.evaluate(() => {
      (window as any).close = () => {};
      (navigator as any).clipboard = (navigator as any).clipboard ?? {};
      (navigator as any).clipboard.writeText = async () => {};
    });

    await extPage.locator('button.copy-btn').click({ timeout: 20_000 });
    await extPage.waitForTimeout(500);

    expect(pageErrors, `Unexpected page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    const joined = consoleMessages.join('\n');
    expect(joined).not.toMatch(/Failed to fetch/i);
    expect(joined).not.toMatch(/Uncaught \(in promise\)/i);
  } finally {
    await context.close();
  }
});
