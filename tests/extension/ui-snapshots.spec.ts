import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync } from 'fs';
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
  throw new Error('Failed to locate extension id via service worker.');
}

async function waitForPopupLoaded(extensionPage: any): Promise<void> {
  await extensionPage.waitForFunction(() => Boolean((window as any).__tableExtractDebug), { timeout: 20_000 });
  await extensionPage.waitForFunction(() => !document.querySelector('.skeleton-results'), { timeout: 30_000 });
}

async function gotoHistory(extensionPage: any): Promise<void> {
  await extensionPage.getByRole('button', { name: 'History' }).click();
  await expect(extensionPage.getByText('Loading history…')).toHaveCount(0, { timeout: 30_000 });
  await expect(extensionPage.getByTestId('history-tab-results')).toBeVisible({ timeout: 30_000 });
}

test('UI snapshots: extract/history at popup sizes', async () => {
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
  const outDir = resolve(process.cwd(), 'reports', 'ui', 'screenshots');
  mkdirSync(outDir, { recursive: true });

  // Use a deterministic web tab so the popup has a "current tab".
  const appPage = await context.newPage();
  await appPage.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await appPage.bringToFront();

  const viewports = [
    { name: 'popup-360x600', width: 360, height: 600 },
    { name: 'popup-320x540', width: 320, height: 540 },
    { name: 'popup-280x480', width: 280, height: 480 },
  ];

  for (const vp of viewports) {
    await extPage.setViewportSize({ width: vp.width, height: vp.height });
    await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
    await waitForPopupLoaded(extPage);

    await extPage.screenshot({ path: join(outDir, `${vp.name}-extract.png`), fullPage: true });

    await gotoHistory(extPage);
    await extPage.screenshot({ path: join(outDir, `${vp.name}-history-results.png`), fullPage: true });

    // Data tab.
    await extPage.getByTestId('history-tab-data').click();
    await expect(extPage.getByTestId('section-data-management')).toBeVisible({ timeout: 30_000 });
    await extPage.screenshot({ path: join(outDir, `${vp.name}-history-data.png`), fullPage: true });
  }

  await context.close();
});

