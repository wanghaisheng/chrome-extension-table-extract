import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import Button from './button';
import './preview.css';
import { ExtractionSummary, deleteDomainData, getExtractionTable, listRecentExtractions } from '../utils/sqlite/wa';
import { listEnabledDomains, setDomainEnabled } from '../utils/sqlite/storage';

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

  useEffect(() => {
    Promise.all([listRecentExtractions(25), listEnabledDomains()])
      .then(([extractions, domains]) => {
        setItems(extractions);
        setEnabledDomains(domains);
      })
      .finally(() => setLoading(false));
  }, []);

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
    const [extractions, domains] = await Promise.all([listRecentExtractions(25), listEnabledDomains()]);
    setItems(extractions);
    setEnabledDomains(domains);
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
      await deleteDomainData(domain);
      await setDomainEnabled(domain, false);
      await refresh();
      setSelectedId(null);
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

