import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChildApp } from './child/ChildApp';
import { Guide } from './child/Guide';
import { TurnaroundShow } from './components/TurnaroundShow';
import { ParentApp } from './parent/ParentApp';
import { useRoute } from './router';
import './styles.css';

/** Development-only preview of a single guide: /dev/guide?a=7&b=8 */
function GuidePreview() {
  const q = new URLSearchParams(window.location.search);
  return (
    <main className="practice">
      <div className="practice-top" />
      <Guide a={Number(q.get('a') ?? 7)} b={Number(q.get('b') ?? 8)} mode="new" showBars onFinish={() => undefined} />
    </main>
  );
}

/** Development-only preview of the turnaround short: /dev/turnaround?a=3&b=7 */
function TurnaroundPreview() {
  const q = new URLSearchParams(window.location.search);
  return (
    <main className="screen">
      <TurnaroundShow a={Number(q.get('a') ?? 3)} b={Number(q.get('b') ?? 7)} />
    </main>
  );
}

function App() {
  const path = useRoute();
  if (import.meta.env.DEV && path === '/dev/guide') return <GuidePreview />;
  if (import.meta.env.DEV && path === '/dev/turnaround') return <TurnaroundPreview />;
  return path.startsWith('/parent') ? <ParentApp path={path} /> : <ChildApp path={path} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
