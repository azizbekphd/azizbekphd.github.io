import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { GameScene } from './components/GameScene';

function MazeExperience() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/endless') {
      const seed = Math.random().toString(36).substring(7);
      navigate(`/endless/${seed}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <GameScene
      requestedPath={location.pathname}
      onPathChange={(path) => navigate(path, { replace: path.endsWith('/retry') })}
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<MazeExperience />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
