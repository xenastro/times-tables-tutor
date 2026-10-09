import { useEffect, useState } from 'react';

const EVENT = 'app:navigate';

/** Minimal history-based routing, so the Android back button works as expected. */
export function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return path;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === window.location.pathname) return;
  if (opts.replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}

/** Go back if we navigated here inside the app, otherwise go to `fallback`. */
export function goBack(fallback: string) {
  if (window.history.state && window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
