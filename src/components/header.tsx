import { JSX } from 'preact';
import  { Dispatch } from 'preact/compat';

import './header.css';
import Button from './button';

interface Props {
  onReportClick: Dispatch<unknown>;
  activePanel: 'extract' | 'history' | 'wizard';
  onSelectPanel: (panel: 'extract' | 'history' | 'wizard') => void;
}

const Header = ({ onReportClick, activePanel, onSelectPanel }: Props): JSX.Element => {
  return (
    <header className="header">
      <img src="/logo.svg"/>
      <div class="options">
        <div className="tabs" role="tablist" aria-label="Panels">
          <Button
            variant="text"
            size="small"
            className={activePanel === 'extract' ? 'tab tab-active' : 'tab'}
            aria-current={activePanel === 'extract' ? 'page' : undefined}
            onClick={() => onSelectPanel('extract')}
          >
            Extract
          </Button>
          <Button
            variant="text"
            size="small"
            className={activePanel === 'history' ? 'tab tab-active' : 'tab'}
            aria-current={activePanel === 'history' ? 'page' : undefined}
            onClick={() => onSelectPanel('history')}
          >
            History
          </Button>
          <Button
            variant="text"
            size="small"
            className={activePanel === 'wizard' ? 'tab tab-active' : 'tab'}
            aria-current={activePanel === 'wizard' ? 'page' : undefined}
            onClick={() => onSelectPanel('wizard')}
          >
            Wizard
          </Button>
        </div>
        <Button variant="text" size="small" onClick={onReportClick as () => void}>Report</Button>
        <Button size="small" onClick={() => window.close()}>
          <img src="/icons/close.svg"/>
        </Button>
      </div>
    </header>
  );
};

export default Header;
