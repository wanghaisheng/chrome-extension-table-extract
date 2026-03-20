import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

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
  throw new Error('Failed to locate extension id from service workers');
}

async function waitForPopupLoaded(extensionPage: any): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug), { timeout: 20_000 });
  await extensionPage.waitForFunction(() => !document.querySelector('.skeleton-results'), { timeout: 30_000 });
}

test('Wizard import custom YAML affects scraping (custom-first) and delete falls back', async () => {
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

  const scholarUrl = 'https://scholar.google.com/scholar?q=gut+health&hl=en&as_sdt=0,5';

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    const u = new URL(reqUrl);

    if (u.hostname === 'scholar.google.com' && u.pathname === '/scholar') {
      const body = readFileSync(resolve(process.cwd(), 'tests', 'google-scholar-result.html'), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/html', body });
      return;
    }

    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  try {
    // Import custom YAML via Wizard.
    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);
    await extPage.getByRole('button', { name: 'Wizard' }).click();
    await extPage.getByTestId('wizard-import-input').setInputFiles(resolve(process.cwd(), 'tests/fixtures/scrapers/custom-scholar.yml'));
    await expect(extPage.getByText(/Imported/i)).toBeVisible({ timeout: 10_000 });
    await expect(extPage.getByTestId('wizard-custom-list')).toContainText('custom-scholar', { timeout: 10_000 });

    // Visit Scholar fixture and scrape: custom-first should override built-in scholar yml header/columns.
    await appPage.goto(scholarUrl, { waitUntil: 'domcontentloaded' });
    await appPage.bringToFront();
    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);
    await expect(extPage.getByText('XTitle')).toBeVisible({ timeout: 20_000 });
    await expect(extPage.getByText('XLink')).toBeVisible({ timeout: 20_000 });

    // Delete custom scraper.
    await extPage.getByRole('button', { name: 'Wizard' }).click();
    await expect(extPage.getByTestId('wizard-custom-list')).toBeVisible();
    await extPage.getByTestId('wizard-delete').first().click();
    await expect(extPage.getByTestId('wizard-custom-list')).toContainText('0 total', { timeout: 10_000 });

    // Scrape again: should fall back to built-in scholar yml (Title/Link columns).
    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);
    await expect(extPage.getByRole('cell', { name: 'Title', exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(extPage.getByRole('cell', { name: 'Link', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});
