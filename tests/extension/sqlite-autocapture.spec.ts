import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

function parseCsvLine(line: string): string[] {
  // Minimal CSV parser for our controlled fixtures (no embedded commas/newlines expected).
  // Fail loudly if quoting appears so we don't silently mis-parse.
  if (line.includes('"')) {
    throw new Error(`Unexpected quoted CSV content: ${line.slice(0, 120)}`);
  }
  return line.split(',');
}

async function getExtensionIdFromContext(context: any): Promise<string> {
  // Preferred: MV3 background service worker exposes the extension id in its url.
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

  // Fallback: attempt to locate via chrome://extensions UI (may be restricted in some environments).
  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('extensions-manager');
  await page.waitForTimeout(1500);

  const extId = await page.evaluate(() => {
    const items: any[] = [];
    const walk = (root: Document | ShadowRoot) => {
      const nodeList = root.querySelectorAll('*');
      for (const el of Array.from(nodeList)) {
        if ((el as any).tagName === 'EXTENSIONS-ITEM') items.push(el);
        const sr = (el as any).shadowRoot as ShadowRoot | undefined;
        if (sr) walk(sr);
      }
    };
    walk(document);
    const seen = items.map((item) => {
      const sr = item.shadowRoot as ShadowRoot | null;
      const nameEl = sr?.querySelector?.('#name') as HTMLElement | null;
      const name = (nameEl?.innerText ?? '').trim();
      const id = item.getAttribute('id') || item.id || null;
      return { id, name };
    });
    const hit = seen.find((x) => x.name === 'Table Extract');
    return { id: hit?.id ?? null, seen };
  });

  await page.close();

  if (!extId?.id || typeof extId.id !== 'string') {
    throw new Error(
      `Failed to locate extension id. serviceWorkers=${JSON.stringify((context.serviceWorkers?.() ?? []).map((w: any) => w.url?.()))} seen=${JSON.stringify(extId?.seen ?? [])}`,
    );
  }

  return extId.id;
}

async function listExtractionUrlsFromDebug(extensionPage: any): Promise<string[]> {
  await extensionPage.waitForFunction(() => {
    const dbg = (window as any).__tableExtractDebug;
    return Boolean(dbg?.listExtractionUrls);
  }, { timeout: 20_000 });

  const result = await Promise.race([
    extensionPage.evaluate(async () => {
      const dbg = (window as any).__tableExtractDebug;
      return await dbg.listExtractionUrls();
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out calling debug.listExtractionUrls()')), 20_000)),
  ]);

  if (!Array.isArray(result)) throw new Error('Debug API listExtractionUrls returned non-array');
  return result;
}

async function waitForExtractionUrlsToContain(extensionPage: any, url: string): Promise<string[]> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    let urls: string[] = [];
    try {
      urls = await listExtractionUrlsFromDebug(extensionPage);
    } catch {
      // tolerate popup reloads while waiting
    }
    if (urls.includes(url)) return urls;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for extraction urls to include ${url}`);
}

async function waitForRecentExtractionsToContain(extensionPage: any, url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    let result: any;
    try {
      result = await extensionPage.evaluate(async () => {
        const dbg = (window as any).__tableExtractDebug;
        if (!dbg?.listRecentExtractions) return { ok: false, error: 'debug not ready' };
        try {
          const items = await dbg.listRecentExtractions(25);
          const urls = (items ?? []).map((i: any) => String(i?.url ?? ''));
          return { ok: true, urls };
        } catch (e: any) {
          return { ok: false, error: String(e?.message ?? e) };
        }
      });
    } catch (e: any) {
      // The popup occasionally reloads; tolerate transient navigation.
      const msg = String(e?.message ?? e);
      if (msg.includes('Execution context was destroyed')) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      throw e;
    }

    if (result?.ok && Array.isArray(result.urls) && result.urls.includes(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for recent extractions to include ${url}`);
}

async function storeExtractionViaDebug(
  extensionPage: any,
  url: string,
  pageTitle: string,
  table: string[][],
): Promise<{ extractionId: number; domain: string }> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug?.storeExtraction), { timeout: 20_000 });
  const result = await Promise.race([
    extensionPage.evaluate(
      async ({ url, pageTitle, table }) => {
        const dbg = (window as any).__tableExtractDebug;
        return await dbg.storeExtraction({ url, pageTitle, table });
      },
      { url, pageTitle, table },
    ),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out calling debug.storeExtraction()')), 30_000)),
  ]);
  if (!result || typeof (result as any).extractionId !== 'number') throw new Error('Debug storeExtraction returned unexpected result');
  return result as any;
}

async function setDomainEnabledViaDebug(extensionPage: any, domain: string, enabled: boolean): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug?.setDomainEnabled), { timeout: 20_000 });
  await extensionPage.evaluate(
    async ({ domain, enabled }) => {
      const dbg = (window as any).__tableExtractDebug;
      await dbg.setDomainEnabled(domain, enabled);
    },
    { domain, enabled },
  );
}

async function waitForPopupLoaded(extensionPage: any): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug), { timeout: 20_000 });
  // App-level loading skeleton (scrape in progress).
  await extensionPage.waitForFunction(() => !document.querySelector('.skeleton-results'), { timeout: 30_000 });
}

async function waitForHistoryLoaded(extensionPage: any): Promise<void> {
  // History component has its own async load.
  const loading = extensionPage.getByText('Loading history…');
  await expect(loading).toHaveCount(0, { timeout: 30_000 });
  // History now uses internal tabs; ensure they're present.
  await expect(extensionPage.getByTestId('history-tab-results')).toBeVisible({ timeout: 30_000 });
}

async function gotoHistoryTab(extensionPage: any, tab: 'results' | 'details' | 'data'): Promise<void> {
  const testId =
    tab === 'results' ? 'history-tab-results' :
    tab === 'details' ? 'history-tab-details' :
    'history-tab-data';
  await extensionPage.getByTestId(testId).click({ timeout: 20_000 });
}

test('manual opt-in enables domain auto-capture on subsequent URLs', async () => {
  // This test launches a persistent context so the extension can be loaded.
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
  extPage.on('console', (msg: any) => {
    consoleMessages.push(`${msg.type?.() ?? 'log'}: ${msg.text?.() ?? ''}`);
  });

  const url1 = 'https://example.test/products/1';
  const url2 = 'https://example.test/products/2';
  const url3 = 'https://example.test/users/1';

  const html1 = `
    <html><head><title>Products 1</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>40</td></tr>
      </table>
    </body></html>
  `;

  const html2 = `
    <html><head><title>Products 2</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Charlie</td><td>50</td></tr>
      </table>
    </body></html>
  `;

  // Different page type bucket (/users/*) with different headers.
  const html3 = `
    <html><head><title>Users 1</title></head>
    <body>
      <table>
        <tr><th>Username</th><th>Role</th></tr>
        <tr><td>eva</td><td>admin</td></tr>
      </table>
    </body></html>
  `;

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl === url1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html1 });
      return;
    }
    if (reqUrl === url2) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html2 });
      return;
    }
    if (reqUrl === url3) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html3 });
      return;
    }

    // Abort all subresources to keep it deterministic.
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  // First URL: manual click to store + opt-in domain.
  await appPage.goto(url1, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();

  // Important: do NOT focus the extension tab before the initial scrap request;
  // the background script relies on "current tab" being the active web page tab.
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);

  // Store once and opt-in domain via debug API (avoid current-tab focus races).
  await storeExtractionViaDebug(extPage, url1, 'Products 1', [
    ['Name', 'Age'],
    ['Alice', '30'],
    ['Bob', '40'],
  ]);
  await setDomainEnabledViaDebug(extPage, 'example.test', true);

  // Second URL: no click; open the popup again to trigger scrap + auto-capture.
  await appPage.goto(url2, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);

  const urls = await waitForExtractionUrlsToContain(extPage, url2);
  expect(urls).toEqual([url1, url2]);

  // Disable auto-capture before writing /users/* to avoid double writes.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await gotoHistoryTab(extPage, 'data');
  await expect(extPage.getByText('example.test', { exact: true })).toBeVisible();
  await extPage.getByRole('button', { name: 'Disable auto-capture' }).click();
  await expect(extPage.getByRole('button', { name: 'Enable auto-capture' })).toBeVisible();

  // Third URL: different page type bucket should store independently.
  await appPage.goto(url3, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  // Store via debug API to avoid current-tab focus races in automated runs.
  await storeExtractionViaDebug(extPage, url3, 'Users 1', [
    ['Username', 'Role'],
    ['eva', 'admin'],
  ]);
  const urls3 = await waitForExtractionUrlsToContain(extPage, url3);
  expect(urls3).toEqual([url1, url2, url3]);

  // Dedup (pilot): enabling dedup should skip identical-to-last for the same bucket.
  await extPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug?.setDedupPolicy), { timeout: 20_000 });
  await extPage.evaluate(async () => {
    const dbg = (window as any).__tableExtractDebug;
    await dbg.setDedupPolicy({ enabled: true, mode: 'identical_to_last' });
  });

  // Store identical-to-last payload again: should be skipped (returns same extraction id).
  const r1 = await storeExtractionViaDebug(extPage, url2, 'Products 2', [
    ['Name', 'Age'],
    ['Charlie', '50'],
  ]);

  // Store changed payload: should create a new extraction (new id).
  const r2 = await storeExtractionViaDebug(extPage, url2, 'Products 2', [
    ['Name', 'Age'],
    ['Charlie', '51'],
  ]);
  expect(r2.extractionId).not.toEqual(r1.extractionId);

  // Store the same changed payload again: should be skipped (same id as r2).
  const r3 = await storeExtractionViaDebug(extPage, url2, 'Products 2', [
    ['Name', 'Age'],
    ['Charlie', '51'],
  ]);
  expect(r3.extractionId).toEqual(r2.extractionId);

  // History UI: verify stored extractions are visible and preview can be opened.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await waitForExtractionUrlsToContain(extPage, url2);
  await expect(extPage.getByText(url2)).toHaveCount(2, { timeout: 20_000 });
  await expect(extPage.getByText(url1)).toBeVisible();
  await expect(extPage.getByText(url3)).toBeVisible();

  // Filters: narrow to products/2 only.
  await extPage.getByPlaceholder('example.com').fill('example.test');
  const advancedToggle1 = extPage.getByTestId('filters-advanced-toggle');
  await expect(advancedToggle1).toBeVisible({ timeout: 10_000 });
  await extPage.evaluate(() => window.scrollTo(0, 0));
  await advancedToggle1.click({ timeout: 20_000 });
  const patternSelect1 = extPage.getByTestId('filter-pattern');
  await expect(patternSelect1.locator('option', { hasText: '/products' })).toHaveCount(1);
  await patternSelect1.selectOption('/products');
  await extPage.getByPlaceholder('/path').fill('products/2');
  await extPage.getByRole('button', { name: 'Apply filters' }).click();
  await expect(extPage.getByText(url2)).toHaveCount(2);
  await expect(extPage.getByText(url1)).toHaveCount(0);
  await expect(extPage.getByText(url3)).toHaveCount(0);

  // Open the filtered entry (url2) and validate export.
  const openButtons = extPage.getByTestId('open-result');
  await expect(openButtons.first()).toBeVisible();
  await openButtons.first().click();
  await expect(extPage.getByTestId('section-details')).toBeVisible();
  await expect(extPage.getByTestId('download-json')).toBeVisible();

  // Export: download JSON and validate it includes stored content.
  const downloadPromise = extPage.waitForEvent('download', { timeout: 20_000 });
  await extPage.getByTestId('download-json').click();
  const download = await downloadPromise;
  const savedPath = join(tmpdir(), `table-extract-${Date.now()}.json`);
  await Promise.race([
    download.saveAs(savedPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out saving download')), 20_000)),
  ]);
  const jsonText = readFileSync(savedPath, 'utf-8');
  const parsed = JSON.parse(jsonText);
  expect(parsed.headers).toEqual(['Name', 'Age']);
  expect(JSON.stringify(parsed.rows)).toContain('Charlie');

  // Expect the preview table to include the header and at least one cell from page 2.
  await expect(extPage.getByText('Name')).toBeVisible();
  await expect(extPage.getByText('Charlie')).toBeVisible();

  // Re-open popup and History to reset selection state.
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await waitForExtractionUrlsToContain(extPage, url3);

  // Schema pinning: pin active schema for /products bucket and ensure products URLs remain visible.
  await extPage.getByPlaceholder('example.com').fill('example.test');
  await extPage.getByPlaceholder('/path').fill('');
  // Pick the /products bucket in the Pattern selector.
  const advancedToggle2 = extPage.getByTestId('filters-advanced-toggle');
  await expect(advancedToggle2).toBeVisible({ timeout: 10_000 });
  await extPage.evaluate(() => window.scrollTo(0, 0));
  await advancedToggle2.click({ timeout: 20_000 });
  const patternSelect2 = extPage.getByTestId('filter-pattern');
  await expect(patternSelect2.locator('option', { hasText: '/products' })).toHaveCount(1);
  await patternSelect2.selectOption('/products');
  await extPage.getByRole('button', { name: 'Pin active schema' }).click();
  await extPage.getByRole('button', { name: 'Apply filters' }).click();
  await expect(extPage.getByText(url2).first()).toBeVisible();

  try {
    await Promise.race([
      context.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out closing context')), 10_000)),
    ]);
  } catch {
    // Best-effort: avoid hanging the whole test on shutdown flake.
  }
});

test('dedup identical-to-last skips repeats within bucket', async () => {
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
  const extPage = await context.newPage();

  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);

  await extPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug?.setDedupPolicy), { timeout: 20_000 });
  await extPage.evaluate(async () => {
    const dbg = (window as any).__tableExtractDebug;
    await dbg.setDedupPolicy({ enabled: true, mode: 'identical_to_last' });
  });

  const url = 'https://example.test/dedup';
  const r1 = await storeExtractionViaDebug(extPage, url, 'Dedup', [
    ['H'],
    ['1'],
  ]);
  const r2 = await storeExtractionViaDebug(extPage, url, 'Dedup', [
    ['H'],
    ['1'],
  ]);
  expect(r2.extractionId).toEqual(r1.extractionId);

  const r3 = await storeExtractionViaDebug(extPage, url, 'Dedup', [
    ['H'],
    ['2'],
  ]);
  expect(r3.extractionId).not.toEqual(r1.extractionId);

  try {
    await Promise.race([
      context.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out closing context')), 10_000)),
    ]);
  } catch {
    // Best-effort.
  }
});

test('bulk export merged CSV sorts by seq/index ascending when detectable', async () => {
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
  const extPage = await context.newPage();

  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);

  // Insert two extractions with an empty-header numeric "seq" column.
  // Second extraction gets a lower seq to ensure global ordering is applied.
  await storeExtractionViaDebug(extPage, 'https://example.test/a', 'A', [
    ['', 'Title'],
    ['2', 'b'],
  ]);
  await storeExtractionViaDebug(extPage, 'https://example.test/b', 'B', [
    ['', 'Title'],
    ['1', 'a'],
  ]);

  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);

  await extPage.getByTestId('bulk-download-format').selectOption('csv');
  const dlPromise = extPage.waitForEvent('download', { timeout: 20_000 });
  await extPage.getByTestId('bulk-download-go').click();
  const dl = await dlPromise;

  const savedPath = join(tmpdir(), `table-extract-bulk-${Date.now()}.csv`);
  await Promise.race([
    dl.saveAs(savedPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out saving bulk download')), 20_000)),
  ]);

  const csv = readFileSync(savedPath, 'utf-8').trim();
  const lines = csv.split(/\r?\n/);
  expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 rows

  const header = parseCsvLine(lines[0]!);
  const seqIndex = header.findIndex((h) => h === '');
  expect(seqIndex).toBeGreaterThanOrEqual(0);

  const rows = lines.slice(1).map(parseCsvLine);
  const seqs = rows.map((r) => r[seqIndex] ?? '');
  expect(seqs.slice(0, 2)).toEqual(['1', '2']);

  try {
    await Promise.race([
      context.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out closing context')), 10_000)),
    ]);
  } catch {
    // Best-effort.
  }
});

test('domain controls: disable auto-capture and delete domain data', async () => {
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

  const url1 = 'https://example.test/page-1';
  const url2 = 'https://example.test/page-2';
  const domain = 'example.test';

  const html1 = `
    <html><head><title>Page 1</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
      </table>
    </body></html>
  `;

  const html2 = `
    <html><head><title>Page 2</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Charlie</td><td>50</td></tr>
      </table>
    </body></html>
  `;

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl === url1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html1 });
      return;
    }
    if (reqUrl === url2) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html2 });
      return;
    }
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  // Opt-in by storing once + enabling domain (debug API is more deterministic).
  await appPage.goto(url1, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  await storeExtractionViaDebug(extPage, url1, 'Page 1', [
    ['Name', 'Age'],
    ['Alice', '30'],
  ]);
  await setDomainEnabledViaDebug(extPage, domain, true);

  // Disable auto-capture for the domain in History.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await gotoHistoryTab(extPage, 'data');
  await expect(extPage.getByText(domain, { exact: true })).toBeVisible();
  await extPage.getByRole('button', { name: 'Disable auto-capture' }).click();
  await expect(extPage.getByRole('button', { name: 'Enable auto-capture' })).toBeVisible();

  // Navigate to second URL and open popup: should NOT auto-capture.
  await appPage.goto(url2, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  const urlsAfterDisable = await listExtractionUrlsFromDebug(extPage);
  expect(urlsAfterDisable).toEqual([url1]);

  // Delete domain data.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await gotoHistoryTab(extPage, 'data');
  await expect(extPage.getByText(domain, { exact: true })).toBeVisible();
  await extPage.getByTestId('delete-domain').click();
  await extPage.getByTestId('delete-domain-confirm').click();
  await gotoHistoryTab(extPage, 'results');
  await expect(extPage.getByText('No saved extractions yet.')).toBeVisible();

  // Verify DB is cleared for that domain.
  const urlsAfterDelete = await listExtractionUrlsFromDebug(extPage);
  expect(urlsAfterDelete).toEqual([]);

  await context.close();
});

test('clear all removes all local data', async () => {
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

  const url1 = 'https://example.test/page-1';
  const html1 = `
    <html><head><title>Page 1</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
      </table>
    </body></html>
  `;

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl === url1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html1 });
      return;
    }
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  // Store once so there is data to clear.
  await appPage.goto(url1, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  await storeExtractionViaDebug(extPage, url1, 'Page 1', [
    ['Name', 'Age'],
    ['Alice', '30'],
  ]);
  expect(await listExtractionUrlsFromDebug(extPage)).toEqual([url1]);

  // Clear all.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await gotoHistoryTab(extPage, 'data');
  await extPage.getByTestId('clear-all').click();
  await extPage.getByTestId('clear-all-confirm').click();
  await gotoHistoryTab(extPage, 'results');
  await expect(extPage.getByText('No saved extractions yet.')).toBeVisible();

  // DB should now be empty.
  const urls = await listExtractionUrlsFromDebug(extPage);
  expect(urls).toEqual([]);
  await expect(extPage.getByText('example.test', { exact: true })).toHaveCount(0);

  await context.close();
});

test('backup and restore keeps history and exports', async () => {
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

  const url1 = 'https://example.test/page-1';
  const html1 = `
    <html><head><title>Page 1</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
      </table>
    </body></html>
  `;

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl === url1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html1 });
      return;
    }
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  // Store once so there is data to back up.
  await appPage.goto(url1, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await waitForPopupLoaded(extPage);
  await storeExtractionViaDebug(extPage, url1, 'Page 1', [
    ['Name', 'Age'],
    ['Alice', '30'],
  ]);
  expect(await listExtractionUrlsFromDebug(extPage)).toEqual([url1]);

  // Go to History, download DB backup.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);
  await gotoHistoryTab(extPage, 'data');
  await expect(extPage.getByTestId('db-backup-download')).toBeVisible();

  const backupDownloadPromise = extPage.waitForEvent('download', { timeout: 20_000 });
  await extPage.getByTestId('db-backup-download').click();
  const backupDownload = await backupDownloadPromise;
  const backupPath = join(tmpdir(), `table-extract-backup-${Date.now()}.sqlite`);
  await Promise.race([
    backupDownload.saveAs(backupPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out saving backup download')), 20_000)),
  ]);

  // Clear all.
  await extPage.getByTestId('clear-all').click();
  await extPage.getByTestId('clear-all-confirm').click();
  await gotoHistoryTab(extPage, 'results');
  await expect(extPage.getByText('No saved extractions yet.')).toBeVisible();
  expect(await listExtractionUrlsFromDebug(extPage)).toEqual([]);

  // Restore from backup file.
  await gotoHistoryTab(extPage, 'data');
  await expect(extPage.getByTestId('db-backup-restore-input')).toHaveCount(1);
  await extPage.getByTestId('db-backup-restore-input').setInputFiles(backupPath);
  await expect(extPage.getByText('Restore complete.')).toBeVisible({ timeout: 20_000 });

  // History should contain the original URL again.
  await gotoHistoryTab(extPage, 'results');
  await waitForRecentExtractionsToContain(extPage, url1);
  const urlsAfterRestore = await listExtractionUrlsFromDebug(extPage);
  expect(urlsAfterRestore).toEqual([url1]);
  await expect(extPage.getByText(url1)).toBeVisible();

  // Export parity: open the entry and validate JSON download content.
  const openButtons = extPage.getByTestId('open-result');
  await expect(openButtons.first()).toBeVisible();
  await openButtons.first().click();
  await expect(extPage.getByTestId('download-json')).toBeVisible();

  const jsonDownloadPromise = extPage.waitForEvent('download', { timeout: 20_000 });
  await extPage.getByTestId('download-json').click();
  const jsonDownload = await jsonDownloadPromise;
  const jsonPath = join(tmpdir(), `table-extract-restore-${Date.now()}.json`);
  await Promise.race([
    jsonDownload.saveAs(jsonPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out saving json download')), 20_000)),
  ]);
  const jsonText = readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(jsonText);
  expect(parsed.headers).toEqual(['Name', 'Age']);
  expect(JSON.stringify(parsed.rows)).toContain('Alice');

  await context.close();
});
