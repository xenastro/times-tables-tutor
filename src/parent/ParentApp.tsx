import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';
import { Auth } from './Auth';
import { ChildDetail } from './ChildDetail';
import { ChildrenList } from './ChildrenList';

export function ParentApp({ path }: { path: string }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.accent = 'teal';
    api<{ email: string }>('GET', '/auth/me')
      .then((r) => setEmail(r.email))
      .catch((err) => setEmail(err instanceof ApiError && err.status === 401 ? null : null));
  }, []);

  const signOut = useCallback(async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    setEmail(null);
    navigate('/parent', { replace: true });
  }, []);

  if (email === undefined) return null;
  if (email === null) return <Auth onSignedIn={setEmail} />;

  const childMatch = path.match(/^\/parent\/child\/([\w-]+)/);
  return (
    <div className="parent">
      {childMatch ? (
        <ChildDetail id={childMatch[1]} />
      ) : (
        <>
          <header className="parent-header">
            <h1>{t('parent.title')}</h1>
            <button className="btn btn-ghost" onClick={signOut}>
              {t('parent.signOut')}
            </button>
          </header>
          <p className="muted small">{email}</p>
          <ChildrenList />
        </>
      )}
    </div>
  );
}
