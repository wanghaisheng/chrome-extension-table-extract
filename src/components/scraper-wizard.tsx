import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import Button from './button';
import './preview.css';
import { deleteCustomScraper, importCustomScraperYaml, listCustomScrapers } from '../utils/scrappers/custom-yml';

type Row = { id: string; name: string; addedAt: number; header?: string; url: string | string[] };

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function aiStatus(): { supported: boolean; hint: string } {
  // Placeholder: Chrome built-in AI APIs are evolving and may not exist in stable.
  const anyGlobal = globalThis as any;
  const supported = Boolean(anyGlobal?.ai || anyGlobal?.navigator?.ai);
  return {
    supported,
    hint: supported
      ? 'Built-in AI API detected (placeholder).'
      : 'Built-in AI API not detected. Import a YAML file to add a custom scraper.',
  };
}

const ScraperWizard: FunctionComponent = () => {
  const [items, setItems] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>('');
  const [isWorking, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusInfo = useMemo(() => aiStatus(), []);

  const reload = async () => {
    const rows = await listCustomScrapers();
    setItems(rows);
  };

  useEffect(() => {
    reload().catch((e) => setStatus(`Failed to load custom scrapers: ${String(e?.message ?? e)}`));
  }, []);

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    setWorking(true);
    setStatus('');
    try {
      const yamlText = await file.text();
      await importCustomScraperYaml({ name: file.name, yamlText });
      setStatus(`Imported ${file.name}`);
      await reload();
    } catch (e: any) {
      setStatus(String(e?.message ?? e));
    } finally {
      setWorking(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDelete = async (id: string) => {
    setWorking(true);
    setStatus('');
    try {
      await deleteCustomScraper(id);
      await reload();
      setStatus('Deleted.');
    } catch (e: any) {
      setStatus(String(e?.message ?? e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="results">
      <div className="table-preview" data-testid="wizard-ai-status">
        <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="pill">AI status</div>
          <div className="pill">{statusInfo.supported ? 'Supported' : 'Unavailable'}</div>
        </div>
        <div className="results" style={{ padding: '0.75rem' }}>{statusInfo.hint}</div>
      </div>

      <div className="table-preview" data-testid="wizard-import">
        <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="pill">Import custom scrapper.yml</div>
          <Button
            variant="secondary"
            disabled={isWorking}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file
          </Button>
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".yml,.yaml,text/yaml"
            style={{ display: 'none' }}
            onChange={(e: any) => onImportFile((e.currentTarget?.files?.[0] as File | undefined) ?? null)}
            data-testid="wizard-import-input"
          />
        </div>
        {status ? <div className="results" style={{ padding: '0.75rem' }}>{status}</div> : null}
      </div>

      <div className="table-preview" data-testid="wizard-custom-list">
        <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="pill">Custom scrapers</div>
          <div className="pill">{`${items.length} total`}</div>
        </div>

        {items.length === 0 ? (
          <div className="results" style={{ padding: '0.75rem' }}>No custom scrapers yet.</div>
        ) : (
          items.map((it) => (
            <div className="table-actions" key={it.id} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div className="pill">{it.name}</div>
                <div className="pill" style={{ whiteSpace: 'normal' }}>{Array.isArray(it.url) ? it.url.join(', ') : it.url}</div>
                <div className="pill">{formatTs(it.addedAt)}</div>
              </div>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => onDelete(it.id)}
                data-testid="wizard-delete"
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="table-preview" data-testid="wizard-coming-soon">
        <div className="table-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="pill">Generate (coming soon)</div>
        </div>
        <div className="results" style={{ padding: '0.75rem' }}>
          Next: analyze the current page and generate a YAML scraper using built-in AI (Prompt API), then preview + export.
        </div>
      </div>
    </div>
  );
};

export default ScraperWizard;
