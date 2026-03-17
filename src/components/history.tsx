import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import Button from './button';
import './preview.css';
import { ExtractionSummary, getExtractionTable, listRecentExtractions } from '../utils/sqlite/wa';

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

  useEffect(() => {
    listRecentExtractions(25)
      .then((res) => setItems(res))
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

  if (isLoading) {
    return <div className="results">Loading history…</div>;
  }

  return (
    <div className="results">
      <div className="table-actions">
        <Button variant="secondary" onClick={onBack}>Back</Button>
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
                  {table.slice(0, 6).map((row) => (
                    <tr>
                      {row.map((col) => (
                        <td>{col}</td>
                      ))}
                    </tr>
                  ))}
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
              <div className="table-preview">
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

