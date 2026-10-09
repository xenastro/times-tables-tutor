import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChildApp } from './child/ChildApp';
import { ParentApp } from './parent/ParentApp';
import { useRoute } from './router';
import './styles.css';

function App() {
  const path = useRoute();
  return path.startsWith('/parent') ? <ParentApp path={path} /> : <ChildApp path={path} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
