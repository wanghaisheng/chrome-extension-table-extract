const DB_STORAGE_KEY = 'table_extract_sqlite_db_v1';
const ENABLED_DOMAINS_KEY = 'table_extract_sqlite_enabled_domains_v1';
const RETENTION_POLICY_KEY = 'table_extract_sqlite_retention_policy_v1';
const DEDUP_POLICY_KEY = 'table_extract_sqlite_dedup_policy_v1';
const PINNED_SCHEMA_KEY = 'table_extract_sqlite_pinned_schema_per_domain_and_pattern_v1';
const PINNED_SCHEMA_KEY_LEGACY = 'table_extract_sqlite_pinned_schema_per_domain_v1';

export type RetentionPolicy = {
  enabled: boolean;
  keepLastPerDomain: number;
};

export type DedupPolicy = {
  enabled: boolean;
  mode: 'identical_to_last';
};

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

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  const res = await chrome.storage.local.get(RETENTION_POLICY_KEY);
  const raw = res?.[RETENTION_POLICY_KEY] as Partial<RetentionPolicy> | undefined;
  const keepLast = Number(raw?.keepLastPerDomain ?? 50);
  return {
    enabled: Boolean(raw?.enabled ?? false),
    keepLastPerDomain: Number.isFinite(keepLast) ? keepLast : 50,
  };
}

export async function setRetentionPolicy(policy: RetentionPolicy): Promise<void> {
  await chrome.storage.local.set({ [RETENTION_POLICY_KEY]: policy });
}

export async function getDedupPolicy(): Promise<DedupPolicy> {
  const res = await chrome.storage.local.get(DEDUP_POLICY_KEY);
  const raw = res?.[DEDUP_POLICY_KEY] as Partial<DedupPolicy> | undefined;
  const mode = raw?.mode === 'identical_to_last' ? raw.mode : 'identical_to_last';
  return {
    enabled: Boolean(raw?.enabled ?? false),
    mode,
  };
}

export async function setDedupPolicy(policy: DedupPolicy): Promise<void> {
  await chrome.storage.local.set({ [DEDUP_POLICY_KEY]: policy });
}

export async function clearSqliteLocalSettings(): Promise<void> {
  await chrome.storage.local.remove([
    ENABLED_DOMAINS_KEY,
    RETENTION_POLICY_KEY,
    DEDUP_POLICY_KEY,
    PINNED_SCHEMA_KEY,
    PINNED_SCHEMA_KEY_LEGACY,
    DB_STORAGE_KEY,
  ]);
}

export async function getPinnedSchemaVersions(): Promise<Record<string, number>> {
  const res = await chrome.storage.local.get([PINNED_SCHEMA_KEY, PINNED_SCHEMA_KEY_LEGACY]);
  const current = (res?.[PINNED_SCHEMA_KEY] as Record<string, number> | undefined) ?? {};
  const legacy = (res?.[PINNED_SCHEMA_KEY_LEGACY] as Record<string, number> | undefined) ?? {};

  // One-way migration: map legacy "domain -> version" to "domain::/ -> version".
  const migrated: Record<string, number> = { ...current };
  let didMigrate = false;
  for (const d of Object.keys(legacy)) {
    const v = legacy[d];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const key = `${d}::/`;
    if (migrated[key] == null) {
      migrated[key] = v;
      didMigrate = true;
    }
  }
  if (didMigrate) {
    await chrome.storage.local.set({ [PINNED_SCHEMA_KEY]: migrated });
    await chrome.storage.local.remove([PINNED_SCHEMA_KEY_LEGACY]);
  }

  return migrated;
}

export async function getPinnedSchemaVersion(domain: string, urlPattern = '/'): Promise<number | null> {
  const all = await getPinnedSchemaVersions();
  const v = all[`${domain}::${urlPattern || '/'}`];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function setPinnedSchemaVersion(domain: string, urlPattern: string, version: number | null): Promise<void> {
  const all = await getPinnedSchemaVersions();
  const key = `${domain}::${urlPattern || '/'}`;
  if (version == null) {
    delete all[key];
  } else {
    all[key] = Math.max(1, Math.floor(version));
  }
  await chrome.storage.local.set({ [PINNED_SCHEMA_KEY]: all });
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

