import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';


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

  const result = await extensionPage.evaluate(async () => {
    const dbg = (window as any).__tableExtractDebug;
    return await dbg.listExtractionUrls();
  });

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

async function storeExtractionViaDebug(extensionPage: any, url: string, pageTitle: string, table: string[][]): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug?.storeExtraction), { timeout: 20_000 });
  await extensionPage.evaluate(
    async ({ url, pageTitle, table }) => {
      const dbg = (window as any).__tableExtractDebug;
      await dbg.storeExtraction({ url, pageTitle, table });
    },
    { url, pageTitle, table },
  );
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

  // Trigger store by clicking the UI button.
  const sqliteBtn = extPage.locator('.sqlite-btn');
  await expect(sqliteBtn).toBeVisible();
  await sqliteBtn.click();
  // Give async storage write a moment; we'll also poll in openDbFromExtensionStorage.
  await extPage.waitForTimeout(500);

  // Second URL: no click; open the popup again to trigger scrap + auto-capture.
  await appPage.goto(url2, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });

  const urls = await waitForExtractionUrlsToContain(extPage, url2);
  expect(urls).toEqual([url1, url2]);

  // Disable auto-capture before writing /users/* to avoid double writes.
  await extPage.getByRole('button', { name: 'History' }).click();
  await expect(extPage.getByText('Domains')).toBeVisible();
  await expect(extPage.getByText('example.test', { exact: true })).toBeVisible();
  await extPage.getByRole('button', { name: 'Disable auto-capture' }).click();
  await expect(extPage.getByRole('button', { name: 'Enable auto-capture' })).toBeVisible();

  // Third URL: different page type bucket should store independently.
  await appPage.goto(url3, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  // Store via debug API to avoid current-tab focus races in automated runs.
  await storeExtractionViaDebug(extPage, url3, 'Users 1', [
    ['Username', 'Role'],
    ['eva', 'admin'],
  ]);
  const urls3 = await waitForExtractionUrlsToContain(extPage, url3);
  expect(urls3).toEqual([url1, url2, url3]);

  // History UI: verify stored extractions are visible and preview can be opened.
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForExtractionUrlsToContain(extPage, url2);
  await expect(extPage.getByText(url2)).toBeVisible({ timeout: 20_000 });
  await expect(extPage.getByText(url1)).toBeVisible();
  await expect(extPage.getByText(url3)).toBeVisible();

  // Filters: narrow to products/2 only.
  await extPage.getByPlaceholder('example.com').fill('example.test');
  await extPage.getByPlaceholder('/path').fill('products/2');
  await extPage.getByRole('button', { name: 'Apply filters' }).click();
  await expect(extPage.getByText(url2)).toBeVisible();
  await expect(extPage.getByText(url1)).toHaveCount(0);
  await expect(extPage.getByText(url3)).toHaveCount(0);

  // Open the filtered entry (url2) and validate export.
  const openButtons = extPage.getByRole('button', { name: 'Open' });
  await expect(openButtons.first()).toBeVisible();
  await openButtons.first().click();

  // Export: download JSON and validate it includes stored content.
  const downloadPromise = extPage.waitForEvent('download');
  await extPage.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const jsonText = readFileSync(filePath as string, 'utf-8');
  const parsed = JSON.parse(jsonText);
  expect(parsed.headers).toEqual(['Name', 'Age']);
  expect(JSON.stringify(parsed.rows)).toContain('Charlie');

  // Expect the preview table to include the header and at least one cell from page 2.
  await expect(extPage.getByText('Name')).toBeVisible();
  await expect(extPage.getByText('Charlie')).toBeVisible();

  // Re-open popup and History to reset selection state.
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForExtractionUrlsToContain(extPage, url3);

  // Schema pinning: pin active schema for /products bucket and ensure products URLs remain visible.
  await extPage.getByPlaceholder('example.com').fill('example.test');
  await extPage.getByPlaceholder('/path').fill('');
  await extPage.getByRole('button', { name: 'Pin active schema' }).click();
  await extPage.getByRole('button', { name: 'Apply filters' }).click();
  await expect(extPage.getByText(url2).first()).toBeVisible();

  await context.close();
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

  // Opt-in by saving once.
  await appPage.goto(url1, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  const sqliteBtn = extPage.locator('.sqlite-btn');
  await expect(sqliteBtn).toBeVisible();
  await sqliteBtn.click();
  await extPage.waitForTimeout(500);

  // Disable auto-capture for the domain in History.
  await extPage.getByRole('button', { name: 'History' }).click();
  await expect(extPage.getByText('Domains')).toBeVisible();
  await expect(extPage.getByText(domain, { exact: true })).toBeVisible();
  await extPage.getByRole('button', { name: 'Disable auto-capture' }).click();
  await expect(extPage.getByRole('button', { name: 'Enable auto-capture' })).toBeVisible();

  // Navigate to second URL and open popup: should NOT auto-capture.
  await appPage.goto(url2, { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();
  await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
  await expect(extPage.locator('.sqlite-btn')).toBeVisible();
  const urlsAfterDisable = await listExtractionUrlsFromDebug(extPage);
  expect(urlsAfterDisable).toEqual([url1]);

  // Delete domain data.
  await extPage.getByRole('button', { name: 'History' }).click();
  await expect(extPage.getByText(domain, { exact: true })).toBeVisible();
  extPage.once('dialog', (d) => d.accept());
  await extPage.getByRole('button', { name: 'Delete data' }).click();
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
  await expect(extPage.locator('.sqlite-btn')).toBeVisible();
  await extPage.locator('.sqlite-btn').click();
  await extPage.waitForTimeout(500);
  expect(await listExtractionUrlsFromDebug(extPage)).toEqual([url1]);

  // Clear all.
  await extPage.getByRole('button', { name: 'History' }).click();
  await expect(extPage.getByText('Lifecycle')).toBeVisible();
  extPage.once('dialog', (d) => d.accept());
  await extPage.getByRole('button', { name: 'Clear all local data' }).click();
  await expect(extPage.getByText('No saved extractions yet.')).toBeVisible();

  // DB should now be empty.
  const urls = await listExtractionUrlsFromDebug(extPage);
  expect(urls).toEqual([]);
  await expect(extPage.getByText('example.test', { exact: true })).toHaveCount(0);

  await context.close();
});

