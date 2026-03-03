import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate, Link } from 'react-router-dom';
import { GameScene } from './components/GameScene';
import { level1, level2 } from './levels';
import { generateMaze } from './utils/mazeGenerator';
import { useMemo } from 'react';

function PortfolioPage({ map, sectionId }: { map: number[][], sectionId: string }) {
  const navigate = useNavigate();
  return <GameScene key={sectionId} map={map} onNavigate={navigate} />;
}

function Section({ title, description, backTo = "/" }: { title: string, description: string, backTo?: string }) {
  return (
    <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', flexDirection: 'column', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', background: '#1a1a1a' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '10px' }}>{title}</h1>
      <p style={{ opacity: 0.8, maxWidth: '600px', fontSize: '1.2rem', lineHeight: '1.6' }}>{description}</p>
      <Link to={backTo} style={{ color: '#00ccff', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 'bold', border: '2px solid #00ccff', padding: '12px 30px', borderRadius: '50px', marginTop: '30px', transition: 'all 0.2s' }}>
        RETURN TO NAVIGATION
      </Link>
    </div>
  );
}

function EndlessRedirect() {
  const seed = useMemo(() => Math.random().toString(36).substring(7), []);
  return <Navigate to={`/endless/${seed}`} replace />;
}

function EndlessPage() {
  const { seed } = useParams();
  const navigate = useNavigate();
  const map = useMemo(() => generateMaze(seed || "default", 15), [seed]);
  
  return <GameScene key={seed} map={map} onNavigate={navigate} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortfolioPage map={level1} sectionId="home" />} />
        <Route path="/projects" element={<PortfolioPage map={level2} sectionId="projects" />} />
        <Route path="/skills" element={<Section title="Skills & Expertise" description="A collection of technical proficiencies including React, Three.js, TypeScript, and high-performance physics-based simulations." />} />
        <Route path="/contact" element={<Section title="Let's Connect" description="Ready to build something together? Reach out via email or find me on LinkedIn." />} />
        
        <Route path="/endless" element={<EndlessRedirect />} />
        <Route path="/endless/:seed" element={<EndlessPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
