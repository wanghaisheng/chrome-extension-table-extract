import { getCurrentTab } from '../chrome';
import fetch from './fetch';
import UAParser from 'ua-parser-js';

interface ReportUsageParams {
  action: 'copy_values' | 'open_in_Rows';
  url?: string;
}

export async function createNewReportEntryRow(feedback?: string): Promise<void | null> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID as string | undefined;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const tableId = import.meta.env.VITE_TABLE_ID as string | undefined;
  if (!spreadsheetId || !tableId) return null;

  const tab = await getCurrentTab();

  if (!tab?.url) {
    return null;
  }

  const userAgent = new UAParser(navigator.userAgent);

  const row_cells = [
    new Date().toUTCString(),
    tab.url,
    new URL(tab.url).hostname,
    userAgent.getBrowser().name,
    userAgent.getBrowser().version,
    feedback ?? 'no table detected'
  ];

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    await fetch.post(
      `https://api.rows.com/v1/spreadsheets/${spreadsheetId}/tables/${tableId}/values/A1:F:append`,
      { values: [row_cells] }
    );
  } catch {
    // best-effort; ignore network/config errors
  }
}

export async function reportUsage(params: ReportUsageParams): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID as string | undefined;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const tableIdUsage = import.meta.env.VITE_TABLE_ID_USAGE as string | undefined;
  if (!spreadsheetId || !tableIdUsage) return;

  const { action } = params;
  const tab = await getCurrentTab();
  const url = params.url ?? tab?.url;
  if (!tab || !url) {
    return;
  }

  const userAgent = new UAParser(navigator.userAgent);

  const row_cells = [
    new Date(),
    url,
    new URL(url).hostname,
    userAgent.getBrowser().name,
    userAgent.getBrowser().version,
    action,
  ];

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    await fetch.post(
      `https://api.rows.com/v1/spreadsheets/${spreadsheetId}/tables/${tableIdUsage}/values/A1:F:append`,
      { values: [row_cells] }
    );
  } catch {
    // best-effort; ignore network/config errors
  }
}
