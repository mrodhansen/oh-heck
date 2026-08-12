import { Link } from 'react-router-dom';
import { useOnline } from '../useOnline';

export function PlayModePage() {
  const online = useOnline();

  return (
    <div className="page-fit">
      <div className="page-fit-body stack play-mode-actions">
        {online ? (
          <Link className="btn mode-card" to="/play/live">
            <span className="mode-card-title">Play</span>
            <span className="mode-card-meta">
              Join or host a live online game
            </span>
          </Link>
        ) : null}
        <Link className="btn mode-card" to="/play/score">
          <span className="mode-card-title">Score Game</span>
          <span className="mode-card-meta">
            Single table or tournament scorekeeper
          </span>
        </Link>
      </div>
    </div>
  );
}
