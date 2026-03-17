import Button from './button';
import './preview.css';
import { array2tsv, hasImage } from '../utils/copy';
import { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ScrapperResults } from '../utils/chrome';
import { reportUsage } from '../utils/rows-api/report';
import { applyRetentionKeepLastPerDomain, storeExtraction } from '../utils/sqlite/wa';
import { getRetentionPolicy, setDomainEnabled } from '../utils/sqlite/storage';

interface Props {
  results: ScrapperResults;
}

const Preview: FunctionComponent<Props> = ({ results = [] }) => {
  const [sqliteStatusByKey, setSqliteStatusByKey] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  const keyForResult = useMemo(() => {
    return (result: { title?: string; table: string[][] }) =>
      `${result.title ?? ''}::${result.table.length}x${(result.table[0] ?? []).length}`;
  }, []);

  const addToSQLite = async (result: { title?: string; table: string[][] }) => {
    const key = keyForResult(result);
    if (sqliteStatusByKey[key] === 'saving') return;

    try {
      setSqliteStatusByKey((prev) => ({ ...prev, [key]: 'saving' }));
      const tabResp = await chrome.runtime.sendMessage({ action: 'table-extract:get-current-web-tab' });
      if (!tabResp?.ok) {
        throw new Error(tabResp?.error ?? 'Failed to get current tab');
      }

      const url = tabResp.url as string;
      const pageTitle = tabResp.title as string;
      const { extractionId, domain } = await storeExtraction({ url, pageTitle, table: result.table });
      await setDomainEnabled(domain, true);
      const policy = await getRetentionPolicy();
      if (policy.enabled) {
        await applyRetentionKeepLastPerDomain(policy.keepLastPerDomain);
      }
      console.log('Stored extraction in SQLite:', { extractionId, domain });
      setSqliteStatusByKey((prev) => ({ ...prev, [key]: 'saved' }));
    } catch (error) {
      console.error('Failed to store data in SQLite:', error);
      setSqliteStatusByKey((prev) => ({ ...prev, [key]: 'error' }));
    }
  };
  
  const copyToClipboard = async (result: {
    title?: string;
    table: string[][];
    includeHeader?: boolean;
  }) => {
    let tableToCopy = result.table;
    if (!result.includeHeader) {
      tableToCopy = result.table.slice(1); // Remove the first row (header)
    }
  
    try {
      await navigator.clipboard.writeText(array2tsv(tableToCopy));
    
      // Send usage report
      await reportUsage({action: 'copy_values'});
    } catch (error) {
      console.error("Failed to copy data to clipboard:", error);
    }
  
    setTimeout(() => window.close(), 200);
  };  

  const renderCell = (cell: string) => {
    if (hasImage(cell)) {
      return <img alt="rows_x_image" src={cell} />;
    }
  
    return cell;
  };

  return (
    <div className="results">
      {results.map((result) => {
        const key = keyForResult(result);
        const status = sqliteStatusByKey[key] ?? 'idle';
        const sqliteLabel =
          status === 'saving' ? 'Saving…' :
          status === 'saved' ? 'Saved' :
          status === 'error' ? 'Retry SQLite' :
          'Add to SQLite';

        return (
          <div className="table-preview">
            <div className="table-header">
              <caption className="title">{result.title}</caption>
              <div className="pill">{`${result.table.length - 1} records`}</div>
            </div>
            <div className="table-body">
              <div className="table-container">
                <table>
                  {result.table.slice(0, 6).map((row) => (
                    <tr>
                      {row.map((col) => (
                        <td>{renderCell(col)}</td>
                      ))}
                    </tr>
                  ))}
                </table>
                {result.table.length > 5 && <div className="shade" />}
              </div>
              <div className="table-actions">
                <Button
                  className="copy-btn"
                  variant="secondary"
                  onClick={() => copyToClipboard(result)}
                >
                  <img alt="copy" src="/icons/copy.svg" />
                </Button>
                <Button
                  className="sqlite-btn"
                  variant="primary"
                  disabled={status === 'saving' || status === 'saved'}
                  onClick={() => addToSQLite(result)}
                >
                  {sqliteLabel}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Preview;
