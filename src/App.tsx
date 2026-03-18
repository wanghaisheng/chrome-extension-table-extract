import { FunctionalComponent } from 'preact';
import { useEffect, useState, useReducer } from 'preact/hooks';
import './index.css';
import FeedbackForm from './components/feedback-form';
import NoResults from './components/no-results';
import Header from './components/header';
import Preview from './components/preview';
import LoadingSkeleton from './components/loading-skeleton';
import { ExceptionMessage } from "./types";
import History from './components/history';
import { getRetentionPolicy, isDomainEnabled } from './utils/sqlite/storage';
import {
  applyRetentionKeepLastPerDomain,
  clearAllData,
  getExtractionTable,
  listDomainUrlPatterns,
  listExtractionUrls,
  listRecentExtractions,
  storeExtraction,
} from './utils/sqlite/wa';

function isResponseIsAnException(response: ExceptionMessage) {
  return response.code >= 0 && typeof response.message === 'string';
}

const App: FunctionalComponent = () => {
  const [isLoading, setLoading] = useState(true);
  const [exceptionOnScrapperResult, setException] = useState("");
  const [results, setResults] = useState([]);
  const [isReportFormOpen, toggleReportTab] = useReducer((isOpen) => !isOpen, false);
  const [activePanel, setActivePanel] = useState<'extract' | 'history'>('extract');

  const hasExceptions = Boolean(exceptionOnScrapperResult);
  const showLoading = !hasExceptions && isLoading;
  const showResults = !showLoading && results.length > 0;
  const noResults = !showLoading && (!hasExceptions && results.length === 0);

  useEffect(() => {
    // Debug surface for E2E tests and local diagnostics.
    (window as any).__tableExtractDebug = {
      listExtractionUrls,
      listRecentExtractions,
      listDomainUrlPatterns,
      getExtractionTable,
      applyRetentionKeepLastPerDomain,
      clearAllData,
      storeExtraction,
    };

    chrome.runtime.sendMessage({ action: 'rows-x:scrap' }, (response) => {
      if (isResponseIsAnException(response)) {
        setResults([]);
        setException(response.message);
      } else {
        setResults(response);
        setException('');
      }

      setLoading(false);
    });
  }, []);

  useEffect(() => {
    (async () => {
      if (!Array.isArray(results) || results.length === 0) return;

      const tabResp = await chrome.runtime.sendMessage({ action: 'table-extract:get-current-web-tab' });
      if (!tabResp?.ok) return;

      const url = tabResp.url as string;
      const pageTitle = tabResp.title as string;
      const domain = new URL(url).hostname;
      const enabled = await isDomainEnabled(domain);
      if (!enabled) return;

      await Promise.all(
        results.map((r: any) =>
          storeExtraction({
            url,
            pageTitle,
            table: r.table,
          }),
        ),
      );

      const policy = await getRetentionPolicy();
      if (policy.enabled) {
        await applyRetentionKeepLastPerDomain(policy.keepLastPerDomain);
      }

      console.log('Auto-captured extractions for domain:', domain);
    })().catch((e) => console.warn('Auto-capture to SQLite failed:', e));
  }, [results]);

  return (
    <>
      <Header
        onReportClick={toggleReportTab}
        activePanel={activePanel}
        onSelectPanel={(panel) => setActivePanel(panel)}
      />
      <div className="container">
        {isReportFormOpen ? (
          <FeedbackForm />
        ) : (
          <>
            {showLoading && (<LoadingSkeleton />)}
            {!showLoading && activePanel === 'history' ? (
              <History onBack={() => setActivePanel('extract')} />
            ) : (
              <>
                {showResults && <Preview results={results} />}
                {noResults && <NoResults />}
                {hasExceptions && <NoResults message={exceptionOnScrapperResult} />}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default App;
