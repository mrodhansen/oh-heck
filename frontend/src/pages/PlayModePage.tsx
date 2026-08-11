import { Link } from 'react-router-dom';
import { useOnline } from '../useOnline';

export function PlayModePage() {
  const online = useOnline();

  return (
    <div className="page-fit">
      <div className="page-fit-header play-home-header">
        <h2 className="page-title">Play</h2>
        <p className="lede">
          {online
            ? 'Online cards or keep score at the table.'
            : 'Keep score at the table (offline).'}
        </p>
      </div>
      <div className="page-fit-body stack">
        {online ? (
          <Link className="btn mode-card" to="/play/live">
            <span className="mode-card-title">Play</span>
            <span className="mode-card-meta">
              Join or host a live online game
            </span>
          </Link>
        ) : null}
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
