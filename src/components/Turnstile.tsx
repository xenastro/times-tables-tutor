import { useEffect, useRef, useState } from 'react';
import { api } from '../data/api';
import { currentLanguage, t } from '../i18n';

/** Give up waiting after this long: the check may be blocked (a network filter) or stuck. */
const GIVE_UP_MS = 20_000;

/**
 * Cloudflare Turnstile, the bot check on the three screens that create something (a child
 * starting, parent sign-up, password reset). It works out of sight and shows at most a
 * checkbox; nothing is shown or loaded when the server has no key (local development).
 */

interface Config {
  turnstileSiteKey: string | null;
  emailEnabled: boolean;
}

let configPromise: Promise<Config> | null = null;

export function loadConfig(): Promise<Config> {
  configPromise ??= api<Config>('GET', '/config').catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface HumanCheck {
  /** The token to send, '' when the check is off. null while it is still working. */
  token: string | null;
  /** Put this where a checkbox may appear. */
  widget: React.ReactNode;
  /** The check couldn't run here (blocked, offline, or it gave up). */
  failed: boolean;
  /** Turnstile wants a tap on its checkbox. */
  needsTap: boolean;
  /** Tokens work once: call after each submit (and to try again after a failure). */
  reset(): void;
}

export function useHumanCheck(): HumanCheck {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token !== null || failed) return;
    const timer = window.setTimeout(() => setFailed(true), GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [token, failed, attempt]);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then(async (cfg) => {
        if (!cfg.turnstileSiteKey) {
          if (!cancelled) setToken('');
          return;
        }
        const ts = await loadScript();
        if (cancelled || !ref.current) return;
        idRef.current = ts.render(ref.current, {
          sitekey: cfg.turnstileSiteKey,
          appearance: 'interaction-only',
          language: currentLanguage(),
          callback: (tok: string) => {
            setFailed(false);
            setNeedsTap(false);
            setToken(tok);
          },
          'before-interactive-callback': () => setNeedsTap(true),
          'after-interactive-callback': () => setNeedsTap(false),
          'expired-callback': () => setToken(null),
          'error-callback': () => {
            setToken(null);
            setFailed(true);
            return true;
          },
        });
      })
      // Offline, or the script is blocked.
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, []);

  return {
    token,
    failed,
    needsTap: needsTap && token === null && !failed,
    widget: <div ref={ref} className="turnstile" />,
    reset() {
      if (idRef.current && window.turnstile) {
        setToken(null);
        setFailed(false);
        setAttempt((a) => a + 1);
        window.turnstile.reset(idRef.current);
      }
    },
  };
}

/** The check as a component, for forms where it appears only in one mode. Bump `attempt` after each submit. */
export function HumanCheckBox({ onToken, attempt }: { onToken: (token: string | null) => void; attempt: number }) {
  const human = useHumanCheck();
  useEffect(() => onToken(human.token), [human.token, onToken]);
  useEffect(() => {
    if (attempt) human.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return (
    <>
      {human.widget}
      {human.failed && (
        <p className="muted small" role="status">
          {t('parent.humanFailed')}{' '}
          <button type="button" className="link" onClick={() => human.reset()}>
            {t('parent.humanRetry')}
          </button>
        </p>
      )}
    </>
  );
}
