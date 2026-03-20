/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ERROR_MESSAGES, ErrorCodes } from './error-codes';
import { getCurrentTab, runScrapper } from './utils/chrome';
import { reportUsage } from './utils/rows-api/report';
import { getScrapperOptionsByUrl } from './utils/scrapperUtils';

async function getCurrentWebTab(): Promise<chrome.tabs.Tab | undefined> {
  // In real usage the UI is a popup, but in automated tests it may be opened as a tab.
  // Prefer the active http(s) tab; otherwise pick the most recently accessed http(s) tab.
  const active = await getCurrentTab();
  if (active?.url?.startsWith('http://') || active?.url?.startsWith('https://')) {
    return active;
  }

  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const httpTabs = tabs.filter((t) => t.url?.startsWith('http://') || t.url?.startsWith('https://'));
  if (httpTabs.length === 0) return active;

  const activeHttp = httpTabs.find((t) => t.active);
  if (activeHttp) return activeHttp;

  return httpTabs.reduce((best, t) => ((t.lastAccessed ?? 0) > (best.lastAccessed ?? 0) ? t : best), httpTabs[0]);
}

async function scrap() {
  const tab = await getCurrentWebTab();

  if (!tab || !tab.url || !tab.title) {
    return;
  }

  if (tab.url.includes('chrome://')) {
    return {
      code: ErrorCodes.GOOGLE_CHROME_INTERNAL_PAGES,
      message: ERROR_MESSAGES.get(ErrorCodes.GOOGLE_CHROME_INTERNAL_PAGES)
    };
  }

  if (tab.url.startsWith('file://')) {
    return {
      code: ErrorCodes.FILE_URLS_NOT_ALLOWED,
      message: ERROR_MESSAGES.get(ErrorCodes.FILE_URLS_NOT_ALLOWED)
    };
  }

  const options = getScrapperOptionsByUrl(tab.url, tab.title);

  try {
    return await runScrapper(tab, options);
  } catch (error) {
    console.warn('Scraper injection failed:', error);
    return {
      code: ErrorCodes.SCRIPT_INJECTION_FAILED,
      message: ERROR_MESSAGES.get(ErrorCodes.SCRIPT_INJECTION_FAILED)
    };
  }
}

async function openInRows(message: { data: string; }) {
  const tab = await getCurrentWebTab();

  if (!tab || !tab.url || !tab.title) {
    return;
  }

  const tabUrl = tab.url;

  chrome.tabs.create({ url: 'https://rows.com/new' }, (tab) => {
    return storeRowsXData(message.data, tab.id!).then(() => reportUsage({ action: 'open_in_Rows', url: tabUrl }));
  });
}

async function storeRowsXData(tsv: string, tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [tsv],
    func: (tsv) => {
      window.localStorage.setItem('rows_x', JSON.stringify({ source: '%ROWS_X%', data: tsv }));
    },
  });
}

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  switch (message.action) {
    case 'rows-x:scrap':
      scrap().then((data) => sendResponse(data));
      break;
    case 'rows-x:store':
      openInRows(message);
      break;
    case 'table-extract:get-current-web-tab':
      getCurrentWebTab()
        .then((tab) => {
          if (!tab?.url) {
            sendResponse({ ok: false, error: 'No active web tab' });
            return;
          }
          sendResponse({ ok: true, url: tab.url, title: tab.title ?? '' });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error?.stack ?? error?.message ?? error) }));
      break;
    default:
      break;
  }

  return true; // return true to indicate you want to send a response asynchronously
});

// Listener when the extension is uninstalled
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    const uninstall_form_link = 'https://rows.com/share/uninstall-survey-1N9rGowAFzUfdRn4BLihHnOb6qUq1pdLRfHSEEHa9eoE';
    chrome.runtime.setUninstallURL(uninstall_form_link);
  }
});
