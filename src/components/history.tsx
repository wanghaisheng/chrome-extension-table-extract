import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import Button from './button';
import './preview.css';
import {
  ExtractionSummary,
  applyRetentionKeepLastPerDomain,
  clearAllData,
  deleteDomainData,
  exportDbBytes,
  getExtractionTable,
  listExtractions,
  listDomainSchemaVersionsForPattern,
  listRecentExtractions,
  restoreDbBytes,
} from '../utils/sqlite/wa';
import {
  clearSqliteLocalSettings,
  getPinnedSchemaVersion,
  getRetentionPolicy,
  listEnabledDomains,
  RetentionPolicy,
  setDomainEnabled,
  setPinnedSchemaVersion,
  setRetentionPolicy,
} from '../utils/sqlite/storage';
import { toCSV, toJSON, toTSV } from '../utils/export/serialize';
import { sortMergedRowsBySeqLikeColumn } from '../utils/export/merge-order';

type Props = {
  onBack: () => void;
};

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

const History: FunctionComponent<Props> = ({ onBack }) => {
  const [items, setItems] = useState<ExtractionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [enabledDomains, setEnabledDomains] = useState<string[]>([]);
  const [isWorking, setWorking] = useState(false);
  const [retention, setRetention] = useState<RetentionPolicy>({ enabled: false, keepLastPerDomain: 50 });
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterUrl, setFilterUrl] = useState<string>('');
  const [filterAfter, setFilterAfter] = useState<string>(''); // yyyy-mm-dd
  const [filterBefore, setFilterBefore] = useState<string>(''); // yyyy-mm-dd
  const [filterPattern, setFilterPattern] = useState<string>('/');
  const [filterSchemaVersion, setFilterSchemaVersion] = useState<string>(''); // number string
  const [domainSchemaVersions, setDomainSchemaVersions] = useState<number[]>([]);
  const [pinnedSchemaVersion, setPinnedSchema] = useState<number | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const confirmTimers = useRef<{ deleteDomain?: number; clearAll?: number }>({});
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [bulkDownloadFormat, setBulkDownloadFormat] = useState<'json' | 'tsv' | 'csv'>('json');
  const [historyTab, setHistoryTab] = useState<'results' | 'details' | 'data'>('results');

  useEffect(() => {
    (async () => {
      try {
        const [extractions, domains, policy] = await Promise.all([
          listRecentExtractions(25),
          listEnabledDomains(),
          getRetentionPolicy(),
        ]);
        setItems(extractions);
        setEnabledDomains(domains);
        setRetention(policy);
      } catch (e: any) {
        console.warn('Failed to load history state:', e);
        setItems([]);
        setEnabledDomains([]);
        setStatusMsg('Local history storage is temporarily unavailable. Please try again later.');
      } finally {
        setLoading(false);
      }
    })().catch((e) => console.warn('History init failed:', e));
  }, []);

  useEffect(() => {
    const d = filterDomain.trim();
    if (!d) {
      setDomainSchemaVersions([]);
      setPinnedSchema(null);
      return;
    }
    getPinnedSchemaVersion(d, filterPattern)
      .then((pinned) => setPinnedSchema(pinned))
      .catch(() => setPinnedSchema(null));
  }, [filterDomain]);

  useEffect(() => {
    const d = filterDomain.trim();
    if (!d) {
      setDomainSchemaVersions([]);
      setPinnedSchema(null);
      return;
    }
    Promise.all([listDomainSchemaVersionsForPattern(d, filterPattern), getPinnedSchemaVersion(d, filterPattern)])
      .then(([versions, pinned]) => {
        setDomainSchemaVersions(versions);
        setPinnedSchema(pinned);
      })
      .catch(() => {
        setDomainSchemaVersions([]);
        setPinnedSchema(null);
      });
  }, [filterDomain, filterPattern]);

  useEffect(() => {
    if (!selectedId) {
      setTable(null);
      return;
    }
    getExtractionTable(selectedId, 20).then(setTable);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId != null) setHistoryTab('details');
  }, [selectedId]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const domainsInDb = useMemo(() => Array.from(new Set(items.map((i) => i.domain))).sort(), [items]);
  const patternsForDomain = useMemo(() => {
    const d = filterDomain.trim();
    if (!d) return ['/'];
    const ps = Array.from(
      new Set(items.filter((i) => i.domain === d).map((i) => String(i.urlPattern ?? '/'))),
    )
      .filter(Boolean)
      .sort();
    return ps.length ? ps : ['/'];
  }, [items, filterDomain]);

  useEffect(() => {
    if (!filterDomain.trim()) {
      setFilterPattern('/');
      return;
    }
    if (!patternsForDomain.includes(filterPattern)) setFilterPattern(patternsForDomain[0] ?? '/');
  }, [filterDomain, patternsForDomain]);

  const refresh = async () => {
    try {
      const [extractions, domains, policy] = await Promise.all([
        listRecentExtractions(25),
        listEnabledDomains(),
        getRetentionPolicy(),
      ]);
      setItems(extractions);
      setEnabledDomains(domains);
      setRetention(policy);
    } catch (e: any) {
      console.warn('Failed to refresh history state:', e);
      setItems([]);
      setEnabledDomains([]);
      setStatusMsg('Local history storage is temporarily unavailable. Please try again later.');
    }
  };

  const applyFilters = async () => {
    setWorking(true);
    try {
      setStatusMsg('');
      const afterMs = filterAfter ? new Date(`${filterAfter}T00:00:00`).getTime() : undefined;
      const beforeMs = filterBefore ? new Date(`${filterBefore}T23:59:59`).getTime() : undefined;
      const explicitSchema = filterSchemaVersion.trim() ? Number(filterSchemaVersion) : undefined;
      const schemaVersion =
        Number.isFinite(explicitSchema as any) ? explicitSchema : (pinnedSchemaVersion ?? undefined);
      const extractions = await listExtractions(
        {
          domain: filterDomain.trim() || undefined,
          urlSubstring: filterUrl.trim() || undefined,
          extractedAfter: afterMs,
          extractedBefore: beforeMs,
          urlPattern: filterDomain.trim() ? filterPattern : undefined,
          schemaVersion,
        },
        50,
      );
      setItems(extractions);
      setSelectedId(null);
    } catch (e: any) {
      console.warn('Failed to apply history filters:', e);
      setItems([]);
      setSelectedId(null);
      setStatusMsg('Local history storage is temporarily unavailable. Please try again later.');
    } finally {
      setWorking(false);
    }
  };

  const resetFilters = async () => {
    setFilterDomain('');
    setFilterUrl('');
    setFilterAfter('');
    setFilterBefore('');
    setFilterPattern('/');
    setFilterSchemaVersion('');
    await refresh();
  };

  const pinSchema = async (version: number | null) => {
    const d = filterDomain.trim();
    if (!d) return;
    setWorking(true);
    try {
      setStatusMsg('');
      await setPinnedSchemaVersion(d, filterPattern, version);
      const pinned = await getPinnedSchemaVersion(d, filterPattern);
      setPinnedSchema(pinned);
      setStatusMsg(version == null ? 'Cleared pinned schema.' : `Pinned schema v${version} for ${d}.`);
    } finally {
      setWorking(false);
    }
  };

  const copySelected = async () => {
    if (!selectedId) return;
    setWorking(true);
    try {
      setStatusMsg('');
      const full = await getExtractionTable(selectedId);
      await navigator.clipboard.writeText(toTSV(full));
      setStatusMsg('Copied TSV to clipboard.');
    } finally {
      setWorking(false);
    }
  };

  const downloadSelected = async (format: 'tsv' | 'csv' | 'json') => {
    if (!selectedId) return;
    setWorking(true);
    try {
      setStatusMsg('');
      const full = await getExtractionTable(selectedId);
      const content =
        format === 'tsv' ? toTSV(full) :
        format === 'csv' ? toCSV(full) :
        toJSON(full);

      const mime = format === 'json' ? 'application/json' : 'text/plain';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-extract-${selectedId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(`Downloaded ${format.toUpperCase()}.`);
    } finally {
      setWorking(false);
    }
  };

  const bulkDownloadShownAsJson = async () => {
    if (items.length === 0) return;
    setWorking(true);
    try {
      setStatusMsg('');
      const exportItems = [...items].sort((a, b) => a.id - b.id);
      const payload: any = {
        exportedAt: Date.now(),
        scope: {
          domain: filterDomain.trim() || null,
          urlSubstring: filterUrl.trim() || null,
          extractedAfter: filterAfter || null,
          extractedBefore: filterBefore || null,
          urlPattern: filterDomain.trim() ? filterPattern : null,
          schemaVersion: filterSchemaVersion.trim() || (pinnedSchemaVersion != null ? `pinned:${pinnedSchemaVersion}` : null),
        },
        items: [] as any[],
      };
      let totalRows = 0;

      for (let i = 0; i < exportItems.length; i++) {
        const it = exportItems[i]!;
        setStatusMsg(`Exporting ${i + 1}/${exportItems.length}…`);
        const table = await getExtractionTable(it.id);
        totalRows += Math.max(0, (table?.length ?? 0) - 1);
        payload.items.push({
          id: it.id,
          domain: it.domain,
          url: it.url,
          urlPattern: it.urlPattern ?? '/',
          pageTitle: it.pageTitle ?? null,
          extractedAt: it.extractedAt,
          rowCount: it.rowCount,
          schemaVersion: it.schemaVersion,
          table,
        });
      }

      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const domain = filterDomain.trim() ? filterDomain.trim().replace(/[^a-zA-Z0-9.-]+/g, '_') : 'all';
      const pattern = filterDomain.trim() ? String(filterPattern || '/').replace(/[^a-zA-Z0-9/_-]+/g, '_') : 'any';
      a.download = `table-extract-bulk-${domain}-${pattern}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(`Downloaded bulk JSON (${exportItems.length} extractions, ${totalRows} rows).`);
    } finally {
      setWorking(false);
    }
  };

  const bulkDownloadShownAsMerged = async (format: 'tsv' | 'csv') => {
    if (items.length === 0) return;
    setWorking(true);
    try {
      setStatusMsg('');
      const exportItems = [...items].sort((a, b) => a.id - b.id);

      type ItemTable = {
        meta: {
          id: number;
          domain: string;
          url: string;
          urlPattern: string;
          pageTitle: string;
          extractedAt: number;
          rowCount: number;
          schemaVersion: number;
        };
        headers: string[];
        rows: string[][];
      };

      const tables: ItemTable[] = [];
      const headerSet = new Set<string>();

      // Base metadata columns for merged export.
      const metaHeaders = ['url', 'extracted_at', 'domain', 'url_pattern', 'schema_version', 'page_title'];

      for (let i = 0; i < exportItems.length; i++) {
        const it = exportItems[i]!;
        setStatusMsg(`Exporting ${i + 1}/${exportItems.length}…`);
        const table = await getExtractionTable(it.id);
        const headers = (table?.[0] ?? []).map((h) => String(h ?? ''));
        for (const h of headers) headerSet.add(h);
        tables.push({
          meta: {
            id: it.id,
            domain: it.domain,
            url: it.url,
            urlPattern: String(it.urlPattern ?? '/'),
            pageTitle: String(it.pageTitle ?? ''),
            extractedAt: it.extractedAt,
            rowCount: it.rowCount,
            schemaVersion: it.schemaVersion,
          },
          headers,
          rows: (table ?? []).slice(1).map((r) => (r ?? []).map((c) => String(c ?? ''))),
        });
      }

      const mergedHeaders = [...metaHeaders, ...Array.from(headerSet)];
      const headerIndex = new Map<string, number>();
      mergedHeaders.forEach((h, idx) => headerIndex.set(h, idx));

      const merged: string[][] = [mergedHeaders];
      for (const t of tables) {
        for (const row of t.rows) {
          const out = new Array<string>(mergedHeaders.length).fill('');
          out[headerIndex.get('url')!] = t.meta.url;
          out[headerIndex.get('extracted_at')!] = String(t.meta.extractedAt);
          out[headerIndex.get('domain')!] = t.meta.domain;
          out[headerIndex.get('url_pattern')!] = t.meta.urlPattern;
          out[headerIndex.get('schema_version')!] = String(t.meta.schemaVersion);
          out[headerIndex.get('page_title')!] = t.meta.pageTitle;

          for (let c = 0; c < Math.max(t.headers.length, row.length); c++) {
            const h = t.headers[c] ?? `col_${c}`;
            if (!headerIndex.has(h)) continue;
            out[headerIndex.get(h)!] = row[c] ?? '';
          }
          merged.push(out);
        }
      }

      const sorted = sortMergedRowsBySeqLikeColumn(merged);
      const content = format === 'tsv' ? toTSV(sorted.table) : toCSV(sorted.table);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const domain = filterDomain.trim() ? filterDomain.trim().replace(/[^a-zA-Z0-9.-]+/g, '_') : 'all';
      const pattern = filterDomain.trim() ? String(filterPattern || '/').replace(/[^a-zA-Z0-9/_-]+/g, '_') : 'any';
      a.download = `table-extract-bulk-${domain}-${pattern}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(`Downloaded bulk ${format.toUpperCase()} (${sorted.table.length - 1} rows).`);
    } finally {
      setWorking(false);
    }
  };

  const downloadDbBackup = async () => {
    setWorking(true);
    try {
      setStatusMsg('');
      const bytes = await exportDbBytes();
      if (!bytes || bytes.byteLength === 0) {
        setStatusMsg('No local database yet.');
        return;
      }

      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-extract-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg('Downloaded DB backup.');
    } catch (e: any) {
      console.warn('Failed to download DB backup:', e);
      setStatusMsg('DB backup failed. Please try again later.');
    } finally {
      setWorking(false);
    }
  };

  const startRestoreDbBackup = () => {
    restoreInputRef.current?.click();
  };

  const onRestoreDbBackupSelected = async (e: any) => {
    const file = e?.currentTarget?.files?.[0] as File | undefined;
    try {
      if (e?.currentTarget) e.currentTarget.value = '';
    } catch {
      // ignore
    }
    if (!file) return;

    setWorking(true);
    try {
      setStatusMsg(`Restoring from ${file.name}…`);
      const buf = await file.arrayBuffer();
      await restoreDbBytes(new Uint8Array(buf));
      setSelectedId(null);
      await refresh();
      setStatusMsg('Restore complete.');
    } catch (err: any) {
      console.warn('Failed to restore DB backup:', err);
      setStatusMsg('Restore failed. Please check the backup file and try again.');
    } finally {
      setWorking(false);
    }
  };

  const toggleDomain = async (domain: string, enabled: boolean) => {
    setWorking(true);
    try {
      await setDomainEnabled(domain, enabled);
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const deleteDomain = async (domain: string) => {
    setWorking(true);
    try {
      setStatusMsg('');
      await deleteDomainData(domain);
      await setDomainEnabled(domain, false);
      await refresh();
      setSelectedId(null);
    } finally {
      setWorking(false);
    }
  };

  const saveRetention = async (next: RetentionPolicy) => {
    setWorking(true);
    try {
      setStatusMsg('');
      await setRetentionPolicy(next);
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const applyRetentionNow = async () => {
    if (!retention.enabled) {
      setStatusMsg('Retention is disabled.');
      return;
    }
    setWorking(true);
    try {
      setStatusMsg('');
      const res = await applyRetentionKeepLastPerDomain(retention.keepLastPerDomain);
      await refresh();
      setStatusMsg(`Retention applied. Deleted ${res.deletedExtractions} extractions.`);
      setSelectedId(null);
    } finally {
      setWorking(false);
    }
  };

  const clearAll = async () => {
    setWorking(true);
    try {
      setStatusMsg('');
      await clearAllData();
      await clearSqliteLocalSettings();
      await refresh();
      setSelectedId(null);
      setStatusMsg('All local data cleared.');
    } finally {
      setWorking(false);
    }
  };

  const startConfirmDeleteDomain = (domain: string) => {
    setConfirmDeleteDomain(domain);
    if (confirmTimers.current.deleteDomain) window.clearTimeout(confirmTimers.current.deleteDomain);
    confirmTimers.current.deleteDomain = window.setTimeout(() => setConfirmDeleteDomain(null), 10_000);
  };

  const cancelConfirmDeleteDomain = () => {
    setConfirmDeleteDomain(null);
    if (confirmTimers.current.deleteDomain) window.clearTimeout(confirmTimers.current.deleteDomain);
    confirmTimers.current.deleteDomain = undefined;
  };

  const startConfirmClearAll = () => {
    setConfirmClearAll(true);
    if (confirmTimers.current.clearAll) window.clearTimeout(confirmTimers.current.clearAll);
    confirmTimers.current.clearAll = window.setTimeout(() => setConfirmClearAll(false), 10_000);
  };

  const cancelConfirmClearAll = () => {
    setConfirmClearAll(false);
    if (confirmTimers.current.clearAll) window.clearTimeout(confirmTimers.current.clearAll);
    confirmTimers.current.clearAll = undefined;
  };

  if (isLoading) {
    return <div className="results">Loading history…</div>;
  }

  return (
    <div className="results">
      <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <div className="tabs" role="tablist" aria-label="History sections" style={{ marginLeft: 'auto' }}>
          <Button
            data-testid="history-tab-results"
            variant="text"
            size="small"
            className={historyTab === 'results' ? 'tab tab-active' : 'tab'}
            aria-current={historyTab === 'results' ? 'page' : undefined}
            disabled={isWorking}
            onClick={() => setHistoryTab('results')}
          >
            Results
          </Button>
          <Button
            data-testid="history-tab-details"
            variant="text"
            size="small"
            className={historyTab === 'details' ? 'tab tab-active' : 'tab'}
            aria-current={historyTab === 'details' ? 'page' : undefined}
            disabled={isWorking}
            onClick={() => setHistoryTab('details')}
          >
            Details
          </Button>
          <Button
            data-testid="history-tab-data"
            variant="text"
            size="small"
            className={historyTab === 'data' ? 'tab tab-active' : 'tab'}
            aria-current={historyTab === 'data' ? 'page' : undefined}
            disabled={isWorking}
            onClick={() => setHistoryTab('data')}
          >
            Data
          </Button>
        </div>
      </div>

      {statusMsg && <div className="pill">{statusMsg}</div>}

      {historyTab === 'results' && (
        <>
          <div className="table-preview" data-testid="section-filters">
            <div className="table-header">
              <caption className="title">Filters</caption>
            </div>
            <div className="table-body">
              <div className="table-actions">
                <div className="pill">Domain</div>
                <input
                  data-testid="filter-domain"
                  style={{ width: '12rem' }}
                  value={filterDomain}
                  disabled={isWorking}
                  onInput={(e: any) => setFilterDomain(String(e.currentTarget?.value ?? ''))}
                  placeholder="example.com"
                />
              </div>
              <div className="table-actions">
                <div className="pill">URL contains</div>
                <input
                  data-testid="filter-url"
                  style={{ width: '12rem' }}
                  value={filterUrl}
                  disabled={isWorking}
                  onInput={(e: any) => setFilterUrl(String(e.currentTarget?.value ?? ''))}
                  placeholder="/path"
                />
              </div>
              <div className="table-actions history-filter-dates">
                <div className="pill">After</div>
                <input
                  data-testid="filter-after"
                  type="date"
                  value={filterAfter}
                  disabled={isWorking}
                  onInput={(e: any) => setFilterAfter(String(e.currentTarget?.value ?? ''))}
                />
                <div className="pill">Before</div>
                <input
                  data-testid="filter-before"
                  type="date"
                  value={filterBefore}
                  disabled={isWorking}
                  onInput={(e: any) => setFilterBefore(String(e.currentTarget?.value ?? ''))}
                />
              </div>
              <div className="table-actions">
                <Button
                  data-testid="filters-advanced-toggle"
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                >
                  {showAdvancedFilters ? 'Hide advanced' : 'Advanced…'}
                </Button>
              </div>
              {showAdvancedFilters && (
                <div className="table-actions">
                  <div className="pill">Schema scope</div>
                  <select
                    data-testid="filter-pattern"
                    style={{ width: '10rem' }}
                    value={filterPattern}
                    disabled={isWorking || !filterDomain.trim()}
                    onInput={(e: any) => setFilterPattern(String(e.currentTarget?.value ?? '/'))}
                  >
                    {patternsForDomain.map((p) => (
                      <option value={p} key={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="filter-schema-version"
                    style={{ width: '12rem' }}
                    value={filterSchemaVersion}
                    disabled={isWorking || !filterDomain.trim()}
                    onInput={(e: any) => setFilterSchemaVersion(String(e.currentTarget?.value ?? ''))}
                  >
                    <option value="">(any)</option>
                    {domainSchemaVersions.map((v) => (
                      <option value={String(v)} key={v}>
                        {pinnedSchemaVersion === v ? `v${v} (pinned)` : `v${v}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    disabled={isWorking || !filterDomain.trim() || domainSchemaVersions.length === 0}
                    onClick={() => {
                      const v = filterSchemaVersion.trim() ? Number(filterSchemaVersion) : (domainSchemaVersions[0] ?? null);
                      if (v && Number.isFinite(v)) pinSchema(v);
                    }}
                  >
                    Pin active schema
                  </Button>
                  <Button variant="secondary" disabled={isWorking || !filterDomain.trim()} onClick={() => pinSchema(null)}>
                    Clear pin
                  </Button>
                </div>
              )}
              <div className="table-actions">
                <Button data-testid="filters-apply" variant="primary" disabled={isWorking} onClick={applyFilters}>Apply filters</Button>
                <Button data-testid="filters-reset" variant="secondary" disabled={isWorking} onClick={resetFilters}>Reset</Button>
              </div>
            </div>
          </div>

          <div className="table-preview" data-testid="section-results">
            <div className="table-header">
              <caption className="title">Results</caption>
              <div className="table-actions history-results-downloads" style={{ marginTop: 0 }}>
                <div className="pill" data-testid="results-count">{`${items.length} shown`}</div>
                <select
                  data-testid="bulk-download-format"
                  value={bulkDownloadFormat}
                  disabled={isWorking || items.length === 0}
                  onInput={(e: any) => setBulkDownloadFormat((e.currentTarget?.value ?? 'json') as any)}
                  style={{ width: '11rem' }}
                >
                  <option value="json">JSON (all shown)</option>
                  <option value="tsv">TSV (merged)</option>
                  <option value="csv">CSV (merged)</option>
                </select>
                <Button
                  data-testid="bulk-download-go"
                  variant="secondary"
                  disabled={isWorking || items.length === 0}
                  onClick={() => {
                    if (bulkDownloadFormat === 'json') return bulkDownloadShownAsJson();
                    return bulkDownloadShownAsMerged(bulkDownloadFormat);
                  }}
                >
                  Download
                </Button>
              </div>
            </div>
            <div className="table-body">
              {items.length === 0 ? (
                <div className="results">No saved extractions yet.</div>
              ) : (
                items.map((i) => (
                  <div className="table-preview" key={i.id} data-testid="result-row">
                    <div className="table-header">
                      <caption className="title">{i.pageTitle ?? i.domain}</caption>
                      <div className="pill">{`${i.rowCount} rows`}</div>
                    </div>
                    <div className="table-body">
                      <div className="pill" style={{ whiteSpace: 'normal' }}>{i.url}</div>
                      <div className="table-actions" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div className="pill">{formatTs(i.extractedAt)}</div>
                          <div className="pill">{String(i.urlPattern ?? '/')}</div>
                          <div className="pill">{`schema v${i.schemaVersion}`}</div>
                        </div>
                        <Button data-testid="open-result" variant="primary" disabled={isWorking} onClick={() => setSelectedId(i.id)}>
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {historyTab === 'details' && (
      <div className="table-preview" data-testid="section-details">
        <div className="table-header">
          <caption className="title">Details</caption>
          {selected ? <div className="pill">{`${selected.rowCount} rows`}</div> : <div className="pill">none selected</div>}
        </div>
        <div className="table-body">
          {selected ? (
            <>
              <div className="pill" data-testid="details-scope" style={{ whiteSpace: 'normal' }}>
                {selected.domain} · {String(selected.urlPattern ?? '/')} · schema v{selected.schemaVersion}
              </div>
              <div className="pill" style={{ whiteSpace: 'normal' }}>{selected.url}</div>
              <div className="table-actions">
                <Button data-testid="copy-tsv" variant="primary" disabled={isWorking} onClick={copySelected}>Copy TSV</Button>
                <Button data-testid="download-tsv" variant="secondary" disabled={isWorking} onClick={() => downloadSelected('tsv')}>Download TSV</Button>
                <Button data-testid="download-csv" variant="secondary" disabled={isWorking} onClick={() => downloadSelected('csv')}>Download CSV</Button>
                <Button data-testid="download-json" variant="secondary" disabled={isWorking} onClick={() => downloadSelected('json')}>Download JSON</Button>
              </div>

              <div className="table-container" style={{ marginTop: '0.5rem' }}>
                {table ? (
                  <table>
                    <tbody>
                      {table.slice(0, 6).map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((col, cIdx) => (
                            <td key={cIdx}>{col}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>Loading preview…</div>
                )}
                {table && table.length > 6 && <div className="shade" />}
              </div>
            </>
          ) : (
            <div className="results">Select a result to preview and export.</div>
          )}
        </div>
      </div>
      )}

      {historyTab === 'data' && (
      <div className="table-preview" data-testid="section-data-management">
        <div className="table-header">
          <caption className="title">Data management</caption>
          <div className="pill">{`${domainsInDb.length} domains`}</div>
        </div>
        <div className="table-body">
          <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="pill">Backup</div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button data-testid="db-backup-download" variant="secondary" disabled={isWorking} onClick={downloadDbBackup}>
                Download backup
              </Button>
              <input
                ref={restoreInputRef}
                data-testid="db-backup-restore-input"
                type="file"
                accept=".sqlite,.db,application/octet-stream"
                style={{ display: 'none' }}
                onChange={onRestoreDbBackupSelected}
              />
              <Button data-testid="db-backup-restore" variant="secondary" disabled={isWorking} onClick={startRestoreDbBackup}>
                Restore from backup
              </Button>
            </div>
          </div>
          <div className="table-actions">
            <div className="pill">Retention</div>
            <Button
              variant={retention.enabled ? 'secondary' : 'primary'}
              disabled={isWorking}
              onClick={() => saveRetention({ ...retention, enabled: !retention.enabled })}
            >
              {retention.enabled ? 'Disable retention' : 'Enable retention'}
            </Button>
          </div>
          <div className="table-actions">
            <div className="pill">Keep last per domain</div>
            <input
              style={{ width: '6rem' }}
              type="number"
              min={1}
              value={retention.keepLastPerDomain}
              disabled={isWorking}
              onInput={(e: any) => setRetention((p) => ({ ...p, keepLastPerDomain: Number(e.currentTarget?.value ?? 50) }))}
            />
            <Button variant="secondary" disabled={isWorking} onClick={applyRetentionNow}>
              Apply now
            </Button>
          </div>

          <div className="table-actions">
            {confirmClearAll ? (
              <>
                <Button
                  data-testid="clear-all-confirm"
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() => {
                    cancelConfirmClearAll();
                    clearAll();
                  }}
                >
                  Confirm clear all
                </Button>
                <Button data-testid="clear-all-cancel" variant="secondary" disabled={isWorking} onClick={cancelConfirmClearAll}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button data-testid="clear-all" variant="secondary" disabled={isWorking} onClick={startConfirmClearAll}>
                Clear all local data
              </Button>
            )}
          </div>

          <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="pill">Domains</div>
            <div className="pill">{`${domainsInDb.length} total`}</div>
          </div>
          {domainsInDb.length === 0 ? (
            <div className="results">No domains yet.</div>
          ) : (
            domainsInDb.map((d) => {
              const enabled = enabledDomains.includes(d);
              const isConfirmingDelete = confirmDeleteDomain === d;
              return (
                <div className="table-actions" key={d} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div className="pill">{d}</div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button
                      variant={enabled ? 'secondary' : 'primary'}
                      disabled={isWorking}
                      onClick={() => toggleDomain(d, !enabled)}
                    >
                      {enabled ? 'Disable auto-capture' : 'Enable auto-capture'}
                    </Button>
                    {isConfirmingDelete ? (
                      <>
                        <Button
                          data-testid="delete-domain-confirm"
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() => {
                            cancelConfirmDeleteDomain();
                            deleteDomain(d);
                          }}
                        >
                          Confirm delete
                        </Button>
                        <Button
                          data-testid="delete-domain-cancel"
                          variant="secondary"
                          disabled={isWorking}
                          onClick={cancelConfirmDeleteDomain}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        data-testid="delete-domain"
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() => startConfirmDeleteDomain(d)}
                      >
                        Delete data
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default History;
