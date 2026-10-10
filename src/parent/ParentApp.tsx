import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../data/api';
import { saveParentLanguage, savedParentLanguage, setLocale, t } from '../i18n';
import { navigate } from '../router';
import { Auth } from './Auth';
import { ChildDetail } from './ChildDetail';
import { ChildrenList } from './ChildrenList';
import { VoiceRecorder } from './VoiceRecorder';

export function ParentApp({ path }: { path: string }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [lang, setLang] = useState(savedParentLanguage);
  setLocale(lang);
  const switchLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    saveParentLanguage(next);
    setLang(next);
  };

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
  if (email === null) return <Auth onSignedIn={setEmail} onSwitchLanguage={switchLang} />;

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
          <p className="muted small">{email}</p>
          <ChildrenList />
          <VoiceRecorder />
        </>
      )}
    </div>
  );
}
