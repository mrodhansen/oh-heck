import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { NewGamePage } from './pages/NewGamePage';
import { GamePage } from './pages/GamePage';
import { StatsPage } from './pages/StatsPage';
import { RulesPage } from './pages/RulesPage';

export function App() {
  const { pathname } = useLocation();
  const inGame = pathname.startsWith('/games/');

  return (
    <div className={`app-shell ${inGame ? 'app-shell-game' : ''}`}>
      {!inGame && (
        <header className="topbar">
          <div className="brand">
            <h1>Oh Heck</h1>
          </div>
          <nav className="nav-links">
            <NavLink to="/" end>
              Play
            </NavLink>
            <NavLink to="/stats">Stats</NavLink>
            <NavLink to="/rules">Rules</NavLink>
          </nav>
        </header>
      )}
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/games/:id" element={<GamePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/rules" element={<RulesPage />} />
        </Routes>
      </main>
    </div>
  );
}
