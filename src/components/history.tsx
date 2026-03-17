import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import Button from './button';
import './preview.css';
import {
  ExtractionSummary,
  applyRetentionKeepLastPerDomain,
  clearAllData,
  deleteDomainData,
  getExtractionTable,
  listExtractions,
  listDomainSchemaVersions,
  listRecentExtractions,
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
  const [filterSchemaVersion, setFilterSchemaVersion] = useState<string>(''); // number string
  const [domainSchemaVersions, setDomainSchemaVersions] = useState<number[]>([]);
  const [pinnedSchemaVersion, setPinnedSchema] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([listRecentExtractions(25), listEnabledDomains(), getRetentionPolicy()])
      .then(([extractions, domains, policy]) => {
        setItems(extractions);
        setEnabledDomains(domains);
        setRetention(policy);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const d = filterDomain.trim();
    if (!d) {
      setDomainSchemaVersions([]);
      setPinnedSchema(null);
      return;
    }
    Promise.all([listDomainSchemaVersions(d), getPinnedSchemaVersion(d)])
      .then(([versions, pinned]) => {
        setDomainSchemaVersions(versions);
        setPinnedSchema(pinned);
      })
      .catch(() => {
        setDomainSchemaVersions([]);
        setPinnedSchema(null);
      });
  }, [filterDomain]);

  useEffect(() => {
    if (!selectedId) {
      setTable(null);
      return;
    }
    getExtractionTable(selectedId, 20).then(setTable);
  }, [selectedId]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const domainsInDb = useMemo(() => Array.from(new Set(items.map((i) => i.domain))).sort(), [items]);

  const refresh = async () => {
    const [extractions, domains, policy] = await Promise.all([listRecentExtractions(25), listEnabledDomains(), getRetentionPolicy()]);
    setItems(extractions);
    setEnabledDomains(domains);
    setRetention(policy);
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
          schemaVersion,
        },
        50,
      );
      setItems(extractions);
      setSelectedId(null);
    } finally {
      setWorking(false);
    }
  };

  const resetFilters = async () => {
    setFilterDomain('');
    setFilterUrl('');
    setFilterAfter('');
    setFilterBefore('');
    setFilterSchemaVersion('');
    await refresh();
  };

  const pinSchema = async (version: number | null) => {
    const d = filterDomain.trim();
    if (!d) return;
    setWorking(true);
    try {
      setStatusMsg('');
      await setPinnedSchemaVersion(d, version);
      const pinned = await getPinnedSchemaVersion(d);
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
      const full = await getExtractionTable(selectedId, undefined);
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
      const full = await getExtractionTable(selectedId, undefined);
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
    const ok = window.confirm(`Delete all local data for ${domain}? This cannot be undone.`);
    if (!ok) return;
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
    const ok = window.confirm('Clear ALL locally stored data? This cannot be undone.');
    if (!ok) return;
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

  if (isLoading) {
    return <div className="results">Loading history…</div>;
  }

  return (
    <div className="results">
      <div className="table-actions">
        <Button variant="secondary" onClick={onBack}>Back</Button>
      </div>

      {statusMsg && <div className="pill">{statusMsg}</div>}

      <div className="table-preview">
        <div className="table-header">
          <caption className="title">Filters</caption>
        </div>
        <div className="table-body">
          <div className="table-actions">
            <div className="pill">Domain</div>
            <input
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
              style={{ width: '12rem' }}
              value={filterUrl}
              disabled={isWorking}
              onInput={(e: any) => setFilterUrl(String(e.currentTarget?.value ?? ''))}
              placeholder="/path"
            />
          </div>
          <div className="table-actions">
            <div className="pill">After</div>
            <input type="date" value={filterAfter} disabled={isWorking} onInput={(e: any) => setFilterAfter(String(e.currentTarget?.value ?? ''))} />
            <div className="pill">Before</div>
            <input type="date" value={filterBefore} disabled={isWorking} onInput={(e: any) => setFilterBefore(String(e.currentTarget?.value ?? ''))} />
          </div>
          <div className="table-actions">
            <div className="pill">Schema</div>
            <select
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
          <div className="table-actions">
            <Button variant="primary" disabled={isWorking} onClick={applyFilters}>Apply filters</Button>
            <Button variant="secondary" disabled={isWorking} onClick={resetFilters}>Reset</Button>
          </div>
        </div>
      </div>

      <div className="table-preview">
        <div className="table-header">
          <caption className="title">Domains</caption>
          <div className="pill">{`${domainsInDb.length} total`}</div>
        </div>
        <div className="table-body">
          {domainsInDb.length === 0 ? (
            <div className="results">No domains yet.</div>
          ) : (
            domainsInDb.map((d) => {
              const enabled = enabledDomains.includes(d);
              return (
                <div className="table-actions" key={d}>
                  <div className="pill">{d}</div>
                  <Button
                    variant={enabled ? 'secondary' : 'primary'}
                    disabled={isWorking}
                    onClick={() => toggleDomain(d, !enabled)}
                  >
                    {enabled ? 'Disable auto-capture' : 'Enable auto-capture'}
                  </Button>
                  <Button variant="secondary" disabled={isWorking} onClick={() => deleteDomain(d)}>
                    Delete data
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="table-preview">
        <div className="table-header">
          <caption className="title">Lifecycle</caption>
        </div>
        <div className="table-body">
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
            <Button variant="secondary" disabled={isWorking} onClick={clearAll}>
              Clear all local data
            </Button>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="table-preview">
          <div className="table-header">
            <caption className="title">{selected.pageTitle ?? selected.domain}</caption>
            <div className="pill">{`${selected.rowCount} rows`}</div>
          </div>
          <div className="table-body">
            <div className="pill">{selected.url}</div>
            <div className="pill">{formatTs(selected.extractedAt)}</div>
            <div className="pill">{`schema v${selected.schemaVersion}`}</div>
            <div className="table-actions">
              <Button variant="primary" disabled={isWorking} onClick={copySelected}>Copy TSV</Button>
              <Button variant="secondary" disabled={isWorking} onClick={() => downloadSelected('tsv')}>Download TSV</Button>
              <Button variant="secondary" disabled={isWorking} onClick={() => downloadSelected('csv')}>Download CSV</Button>
              <Button variant="secondary" disabled={isWorking} onClick={() => downloadSelected('json')}>Download JSON</Button>
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
          </div>
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="results">No saved extractions yet.</div>
          ) : (
            items.map((i) => (
              <div className="table-preview" key={i.id}>
                <div className="table-header">
                  <caption className="title">{i.pageTitle ?? i.domain}</caption>
                  <div className="pill">{`${i.rowCount} rows`}</div>
                </div>
                <div className="table-body">
                  <div className="pill">{i.url}</div>
                  <div className="pill">{formatTs(i.extractedAt)}</div>
                  <div className="table-actions">
                    <Button variant="primary" onClick={() => setSelectedId(i.id)}>Open</Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
};

export default History;

