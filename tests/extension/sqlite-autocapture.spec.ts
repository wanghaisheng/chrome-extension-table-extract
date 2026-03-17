import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';


function base64ToUint8(base64: string): Uint8Array {
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const urls = await extensionPage.evaluate(async () => {
      const dbg = (window as any).__tableExtractDebug;
      if (!dbg?.listExtractionUrls) return null;
      return await dbg.listExtractionUrls();
    });
    if (Array.isArray(urls)) return urls;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Debug API __tableExtractDebug.listExtractionUrls not available');
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

  const url1 = 'https://example.test/page-1';
  const url2 = 'https://example.test/page-2';

  const html1 = `
    <html><head><title>Page 1</title></head>
    <body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>40</td></tr>
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

  const urls = await listExtractionUrlsFromDebug(extPage);
  expect(urls).toEqual([url1, url2]);

  await context.close();
});

