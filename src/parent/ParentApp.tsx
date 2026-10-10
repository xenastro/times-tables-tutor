import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, PARENT_LOCKED } from '../data/api';
import { saveParentLanguage, savedParentLanguage, setLocale, t } from '../i18n';
import { navigate } from '../router';
import { Auth } from './Auth';
import { ChildDetail } from './ChildDetail';
import { ChildrenList } from './ChildrenList';
import { ConnectHere } from './ConnectHere';
import { Passkeys } from './Passkeys';
import { DeleteAccount, ResetPassword } from './ResetPassword';

interface Me {
  email: string;
  /** This phone also holds a child's practice: the area locks when idle. */
  shared: boolean;
  locked: boolean;
}

export function ParentApp({ path }: { path: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [lang, setLang] = useState(savedParentLanguage);
  /** Bumped when a child is connected here, so the list reloads. */
  const [version, setVersion] = useState(0);
  setLocale(lang);
  const switchLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    saveParentLanguage(next);
    setLang(next);
  };

  const refresh = useCallback(() => {
    api<Me>('GET', '/auth/me')
      .then(setMe)
      .catch((err) => setMe(err instanceof ApiError && err.status === 401 ? null : null));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.accent = 'teal';
    refresh();
    const onLocked = () => setMe((m) => (m ? { ...m, locked: true } : m));
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener(PARENT_LOCKED, onLocked);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(PARENT_LOCKED, onLocked);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    setMe(null);
    navigate('/parent', { replace: true });
  }, []);

  const backToChild = useCallback(async () => {
    await api('POST', '/auth/lock').catch(() => undefined);
    navigate('/', { replace: true });
  }, []);

  // A reset link works whether or not this browser is signed in.
  if (path === '/parent/reset') return <ResetPassword onSignedIn={refresh} />;
  if (me === undefined) return null;
  if (me === null) return <Auth onSignedIn={refresh} onSwitchLanguage={switchLang} />;
  if (me.locked) return <Unlock email={me.email} onUnlocked={refresh} onSignOut={signOut} />;

  const childMatch = path.match(/^\/parent\/child\/([\w-]+)/);
  return (
    <div className="parent">
      {childMatch ? (
        <ChildDetail id={childMatch[1]} />
      ) : (
        <>
          <header className="parent-header">
            <h1>{t('parent.title')}</h1>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-ghost" onClick={switchLang} lang={lang === 'ar' ? 'en' : 'ar'}>
                {t('parent.langSwitch')}
              </button>
              <button className="btn btn-ghost" onClick={signOut}>
                {t('parent.signOut')}
              </button>
            </div>
          </header>
          <p className="muted small">{me.email}</p>
          {me.shared && (
            <button className="btn btn-soft" onClick={() => void backToChild()}>
              {t('lock.backToChild')}
            </button>
          )}
          <ConnectHere
            onChanged={() => {
              setVersion((v) => v + 1);
              refresh();
            }}
          />
          <ChildrenList key={version} />
          <Passkeys />
          <DeleteAccount />
          <button className="link" style={{ alignSelf: 'center' }} onClick={() => navigate('/privacy')}>
            {t('privacy.link')}
          </button>
        </>
      )}
    </div>
  );
}

/** On a phone shared with a child: the parent area asks for the password again. */
function Unlock({ email, onUnlocked, onSignOut }: { email: string; onUnlocked: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/auth/unlock', { password });
      onUnlocked();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(code === 'invalid_login' ? t('lock.wrong') : code === 'too_many_attempts' ? t('parent.errors.too_many_attempts') : t('common.error'));
      setBusy(false);
    }
  }

  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <form className="card stack" onSubmit={submit}>
        <h1 style={{ fontSize: '1.4rem' }}>🔒 {t('lock.title')}</h1>
        <p className="muted">{t('lock.body')}</p>
        <p className="muted small">{email}</p>
        <label className="field">
          {t('parent.password')}
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-big" disabled={busy || !password}>
          {t('lock.unlock')}
        </button>
      </form>
      <div className="row" style={{ justifyContent: 'center', gap: 20 }}>
        <button className="link" onClick={() => navigate('/')}>
          {t('lock.toChild')}
        </button>
        <button className="link" onClick={onSignOut}>
          {t('parent.signOut')}
        </button>
      </div>
    </main>
  );
}
