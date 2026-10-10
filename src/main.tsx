import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChildApp } from './child/ChildApp';
import { Guide, type GuideMode } from './child/Guide';
import { Lesson } from './child/Lesson';
import type { LessonId } from './engine/lessons';
import { NumberWordsShow } from './components/NumberWordsShow';
import { TurnaroundShow } from './components/TurnaroundShow';
import { setLocale } from './i18n';
import { ParentApp } from './parent/ParentApp';
import { Privacy } from './Privacy';
import { useRoute } from './router';
import './styles.css';

/** Development-only preview of a single guide: /dev/guide?a=7&b=8 (add &missing=a or b, and &intro=1, for ? × 8 = 56). */
function GuidePreview() {
  const q = new URLSearchParams(window.location.search);
  const missing = q.get('missing');
  return (
    <main className="practice">
      <div className="practice-top" />
      <Guide
        a={Number(q.get('a') ?? 7)}
        b={Number(q.get('b') ?? 8)}
        mode={(q.get('mode') as GuideMode) ?? 'new'}
        showBars
        onFinish={() => undefined}
        missing={missing === 'a' || missing === 'b' ? missing : undefined}
        intro={q.get('intro') === '1'}
      />
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

/** Development-only preview of an "Understand" lesson: /dev/lesson?id=groups */
function LessonPreview() {
  const id = (new URLSearchParams(window.location.search).get('id') ?? 'groups') as LessonId;
  const [done, setDone] = useState(false);
  return done ? <main className="screen"><h1>Lesson done</h1></main> : <Lesson id={id} onExit={() => undefined} onDone={() => setDone(true)} />;
}

/** Development-only preview of the units-first number words: /dev/words?n=56&lang=ar&digits=eastern */
function WordsPreview() {
  const q = new URLSearchParams(window.location.search);
  setLocale(q.get('lang') === 'ar' ? 'ar' : 'en', q.get('digits') === 'eastern' ? 'eastern' : 'western');
  return (
    <main className="screen">
      <NumberWordsShow n={Number(q.get('n') ?? 56)} />
    </main>
  );
}

function App() {
  const path = useRoute();
  if (import.meta.env.DEV && path === '/dev/words') return <WordsPreview />;
  if (import.meta.env.DEV && path === '/dev/guide') return <GuidePreview />;
  if (import.meta.env.DEV && path === '/dev/turnaround') return <TurnaroundPreview />;
  if (import.meta.env.DEV && path === '/dev/lesson') return <LessonPreview />;
  if (path === '/privacy') return <Privacy />;
  return path.startsWith('/parent') ? <ParentApp path={path} /> : <ChildApp path={path} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
