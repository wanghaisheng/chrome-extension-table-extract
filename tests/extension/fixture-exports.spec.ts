import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

function parseCsvLine(line: string): string[] {
  // Minimal CSV parser for our controlled fixtures (no embedded commas/newlines expected).
  if (line.includes('"')) {
    throw new Error(`Unexpected quoted CSV content: ${line.slice(0, 120)}`);
  }
  return line.split(',');
}

function loadCsvHeader(filePath: string): string[] {
  const csv = readFileSync(filePath, 'utf8').trim();
  const firstLine = csv.split(/\r?\n/)[0];
  if (!firstLine) return [];
  return parseCsvLine(firstLine);
}

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

async function waitForHistoryLoaded(extensionPage: any): Promise<void> {
  await expect(extensionPage.getByTestId('history-tab-results')).toBeVisible({ timeout: 30_000 });
}

async function exportLatestExtractionCsv(extPage: any, outputPath: string): Promise<void> {
  await extPage.getByRole('button', { name: 'History' }).click();
  await waitForHistoryLoaded(extPage);

  // Open the newest extraction (History list is ordered newest-first).
  await extPage.getByTestId('open-result').first().click({ timeout: 20_000 });
  await expect(extPage.getByTestId('download-csv')).toBeVisible({ timeout: 20_000 });

  const downloadPromise = extPage.waitForEvent('download', { timeout: 30_000 });
  await extPage.getByTestId('download-csv').click({ timeout: 20_000 });
  const download = await downloadPromise;
  await download.saveAs(outputPath);
}

test('exports fixture CSVs for manual review (cnki/scholar/pubmed)', async () => {
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

  const outDir = resolve(process.cwd(), 'test-results', 'fixture-exports');
  mkdirSync(outDir, { recursive: true });

  const fixtures: Array<{ name: string; url: string; file: string; expectText?: string }> = [
    {
      name: 'cnki',
      url: 'https://cnki.fixture.test/',
      file: resolve(process.cwd(), 'tests', 'cnki.html'),
    },
    {
      name: 'google-scholar-result',
      url: 'https://scholar.google.com/scholar?q=gut+health&hl=en&as_sdt=0,5',
      file: resolve(process.cwd(), 'tests', 'google-scholar-result.html'),
      expectText: 'Cited by',
    },
    {
      name: 'pubmed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=gut+health',
      file: resolve(process.cwd(), 'tests', 'pubmed.html'),
    },
  ];

  await appPage.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    const u = new URL(reqUrl);

    if (u.hostname === 'cnki.fixture.test') {
      const body = readFileSync(resolve(process.cwd(), 'tests', 'cnki.html'), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/html', body });
      return;
    }

    if (u.hostname === 'scholar.google.com' && u.pathname === '/scholar') {
      const body = readFileSync(resolve(process.cwd(), 'tests', 'google-scholar-result.html'), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/html', body });
      return;
    }

    if (u.hostname === 'pubmed.ncbi.nlm.nih.gov' && u.pathname === '/') {
      const body = readFileSync(resolve(process.cwd(), 'tests', 'pubmed.html'), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/html', body });
      return;
    }

    // Keep document requests deterministic.
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }

    await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' });
  });

  try {
    for (const fixture of fixtures) {
      await appPage.goto(fixture.url, { waitUntil: 'domcontentloaded' });
      await appPage.bringToFront();

      await extPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
      await waitForPopupLoaded(extPage);

      // Ensure extraction is present, then persist via the same button users click.
      const sqliteBtn = extPage.locator('button.sqlite-btn').first();
      await expect(sqliteBtn).toBeVisible({ timeout: 30_000 });
      if (fixture.expectText) {
        await expect(extPage.getByText(fixture.expectText).first()).toBeVisible({ timeout: 30_000 });
      }

      const label = (await sqliteBtn.innerText()).trim();
      if (label === 'Add to SQLite' || label === 'Retry SQLite') {
        await sqliteBtn.click({ timeout: 30_000 });
      }
      await expect(extPage.locator('button.sqlite-btn', { hasText: 'Saved' }).first()).toBeVisible({ timeout: 30_000 });

      const outputPath = join(outDir, `${fixture.name}.csv`);
      await exportLatestExtractionCsv(extPage, outputPath);

      // Basic schema assertions: ensure the exported CSV includes key columns for these fixtures.
      if (fixture.name === 'google-scholar-result') {
        const header = loadCsvHeader(outputPath);
        for (const col of ['Title', 'Link', 'AuthorsLine', 'Snippet', 'CitedByText']) {
          expect(header).toContain(col);
        }
      }
      if (fixture.name === 'pubmed') {
        const header = loadCsvHeader(outputPath);
        for (const col of ['Title', 'Link', 'PMID']) {
          expect(header).toContain(col);
        }
        // Ensure we didn't export the timeline-only table as the primary output.
        expect(header).not.toEqual(['Year', 'Number of Results']);
      }
    }
  } finally {
    await context.close();
  }
});
