import { Link } from 'react-router-dom';

export function PlayModePage() {
  return (
    <div className="page-fit">
      <div className="page-fit-header play-home-header">
        <h2 className="page-title">Play</h2>
        <p className="lede">Online cards or keep score at the table.</p>
      </div>
      <div className="page-fit-body stack">
        <Link className="btn mode-card" to="/play/live">
          <span className="mode-card-title">Play</span>
          <span className="mode-card-meta">
            Join or host a live online game
          </span>
        </Link>
        <Link className="btn mode-card" to="/play/score">
          <span className="mode-card-title">Score</span>
          <span className="mode-card-meta">
            Single table or tournament scorekeeper
          </span>
        </Link>
      </div>
    </div>
  );
}
