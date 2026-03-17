import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  use: {
    // Use Playwright-managed Chromium for extension stability.
    channel: 'chromium',
    // Extensions are most reliable in headful mode.
    headless: false,
  },
});

