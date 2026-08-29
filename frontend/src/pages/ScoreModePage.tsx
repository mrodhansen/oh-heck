import { Link } from 'react-router-dom';

export function ScoreModePage() {
  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">Score Game</h2>
      </div>
      <div className="page-fit-body stack score-mode-actions">
        <Link className="btn mode-card" to="/play/single">
          <span className="mode-card-title">Single</span>
          <span className="mode-card-meta">One table · score as usual</span>
        </Link>
        <Link className="btn mode-card" to="/play/tournaments">
          <span className="mode-card-title">Tournament</span>
          <span className="mode-card-meta">Multiple tables · high table</span>
        </Link>
        <a
          className="btn mode-card"
          href={`${import.meta.env.BASE_URL}oh-heck-scoresheet.xlsx`}
          download="Oh Heck Scoresheet.xlsx"
        >
          <span className="mode-card-title">Download scoresheet</span>
          <span className="mode-card-meta">Blank Excel card for paper scoring</span>
        </a>
        <Link className="btn mode-card" to="/play/upload">
          <span className="mode-card-title">Upload game</span>
          <span className="mode-card-meta">Import a file or scorecard photo</span>
        </Link>
      </div>
      <div className="action-bar">
        <Link to="/" className="btn primary block">
          Back
        </Link>
      </div>
    </div>
  );
}
