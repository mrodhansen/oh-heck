import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { PlayModePage } from './pages/PlayModePage';
import { ScoreModePage } from './pages/ScoreModePage';
import { HomePage } from './pages/HomePage';
import { NewGamePage } from './pages/NewGamePage';
import { GamePage } from './pages/GamePage';
import { StatsPage } from './pages/StatsPage';
import { RulesPage } from './pages/RulesPage';
import { AccountPage } from './pages/AccountPage';
import { ClaimableGamesPage } from './pages/ClaimableGamesPage';
import { TournamentsPage } from './pages/TournamentsPage';
import { TournamentPage } from './pages/TournamentPage';
import { LiveHubPage } from './pages/LiveHubPage';
import { LiveSessionPage } from './pages/LiveSessionPage';
import { SyncStatus } from './components/SyncStatus';
import { useAuth } from './useAuth';

export function App() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const inGame = pathname.startsWith('/games/');
  const inLive = pathname.startsWith('/live/');
  const inTournamentDeep =
    pathname.startsWith('/play/tournaments/') &&
    pathname !== '/play/tournaments';
  const hideChrome = inGame || inLive || inTournamentDeep;

  return (
    <div className={`app-shell ${hideChrome ? 'app-shell-game' : ''}`}>
      {!hideChrome && (
        <header className="topbar">
          <div className="brand">
            <h1>Oh Heck</h1>
            <NavLink to="/rules" className="rules-help" title="Rules" aria-label="Rules">
              ?
            </NavLink>
          </div>
          <nav className="nav-links">
            <NavLink to="/" end>
              Play
            </NavLink>
            <NavLink to="/stats">Stats</NavLink>
            <NavLink to="/account">{user ? user.firstName : 'Account'}</NavLink>
          </nav>
        </header>
      )}
      <SyncStatus />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<PlayModePage />} />
          <Route path="/play/live" element={<LiveHubPage />} />
          <Route path="/live/:id" element={<LiveSessionPage />} />
          <Route path="/play/score" element={<ScoreModePage />} />
          <Route path="/play/single" element={<HomePage />} />
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/play/tournaments" element={<TournamentsPage />} />
          <Route path="/play/tournaments/:id" element={<TournamentPage />} />
          <Route path="/games/:id" element={<GamePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/claimable" element={<ClaimableGamesPage />} />
          <Route path="/rules" element={<RulesPage />} />
        </Routes>
      </main>
    </div>
  );
}
