import { Link } from 'react-router-dom';
import { useApiStatus, useOnline } from '../useOnline';

export function PlayModePage() {
  const online = useOnline();
  const apiReady = useApiStatus() === 'ready';

  return (
    <div className="page-fit">
      <div className="page-fit-body stack play-mode-actions">
        {online && apiReady ? (
          <Link className="btn mode-card" to="/play/live">
            <span className="mode-card-title">Play Online</span>
            <span className="mode-card-meta">Play Oh Heck online</span>
          </Link>
        ) : null}
        <Link className="btn mode-card" to="/play/score">
          <span className="mode-card-title">Score Game</span>
          <span className="mode-card-meta">
            Keep score of an in-person game
          </span>
        </Link>
      </div>
    </div>
  );
}
