import { Link } from 'react-router-dom';
import { useApiStatus, useOnline } from '../useOnline';
import { modeCard, modeCardMeta, modeCardTitle, pageFit, pageFitBody, stack } from '../ui';
import { cn } from '../cn';

export function PlayModePage() {
  const online = useOnline();
  const apiReady = useApiStatus() === 'ready';

  return (
    <div className={pageFit}>
      <div className={cn(pageFitBody, stack, 'pt-4')}>
        {online && apiReady ? (
          <Link className={modeCard} to="/play/live">
            <span className={modeCardTitle}>Play Online</span>
            <span className={modeCardMeta}>Play Oh Heck online</span>
          </Link>
        ) : null}
        <Link className={modeCard} to="/play/score">
          <span className={modeCardTitle}>Score Game</span>
          <span className={modeCardMeta}>
            Keep score of an in-person game
          </span>
        </Link>
      </div>
    </div>
  );
}
