import { Link } from 'react-router-dom';
import {
  actionBar,
  btnClass,
  modeCard,
  modeCardMeta,
  modeCardTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageTitle,
  stack,
} from '../ui';
import { cn } from '../cn';

export function ScoreModePage() {
  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <h2 className={pageTitle}>Score Game</h2>
      </div>
      <div className={cn(pageFitBody, stack, 'pt-4')}>
        <Link className={modeCard} to="/play/single">
          <span className={modeCardTitle}>Single</span>
          <span className={modeCardMeta}>One table · score as usual</span>
        </Link>
        <Link className={modeCard} to="/play/tournaments">
          <span className={modeCardTitle}>Tournament</span>
          <span className={modeCardMeta}>Multiple tables · high table</span>
        </Link>
        <a
          className={modeCard}
          href={`${import.meta.env.BASE_URL}oh-heck-scoresheet.xlsx`}
          download="Oh Heck Scoresheet.xlsx"
        >
          <span className={modeCardTitle}>Download scoresheet</span>
          <span className={modeCardMeta}>Blank Excel card for paper scoring</span>
        </a>
        <Link className={modeCard} to="/play/upload">
          <span className={modeCardTitle}>Upload game</span>
          <span className={modeCardMeta}>Import a file or scorecard photo</span>
        </Link>
      </div>
      <div className={actionBar}>
        <Link to="/" className={btnClass({ kind: 'primary', block: true })}>
          Back
        </Link>
      </div>
    </div>
  );
}
