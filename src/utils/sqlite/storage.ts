const DB_STORAGE_KEY = 'table_extract_sqlite_db_v1';
const ENABLED_DOMAINS_KEY = 'table_extract_sqlite_enabled_domains_v1';

export async function getEnabledDomains(): Promise<Record<string, true>> {
  const res = await chrome.storage.local.get(ENABLED_DOMAINS_KEY);
  return (res?.[ENABLED_DOMAINS_KEY] as Record<string, true> | undefined) ?? {};
}

export async function listEnabledDomains(): Promise<string[]> {
  const domains = await getEnabledDomains();
  return Object.keys(domains).sort();
}

export async function setDomainEnabled(domain: string, enabled: boolean): Promise<void> {
  const domains = await getEnabledDomains();
  if (enabled) {
    domains[domain] = true;
  } else {
    delete domains[domain];
  }
  await chrome.storage.local.set({ [ENABLED_DOMAINS_KEY]: domains });
}

export async function isDomainEnabled(domain: string): Promise<boolean> {
  const domains = await getEnabledDomains();
  return Boolean(domains[domain]);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function loadDbBytes(): Promise<Uint8Array | null> {
  const res = await chrome.storage.local.get(DB_STORAGE_KEY);
  const base64 = res?.[DB_STORAGE_KEY] as string | undefined;
  if (!base64) return null;
  return base64ToUint8(base64);
}

export async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  const base64 = uint8ToBase64(bytes);
  await chrome.storage.local.set({ [DB_STORAGE_KEY]: base64 });
}

