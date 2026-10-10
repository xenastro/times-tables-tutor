import { savedParentLanguage, saveParentLanguage, setLocale, t } from './i18n';
import { goBack } from './router';
import { useState } from 'react';

const SECTIONS = ['who', 'stored', 'notStored', 'phone', 'keep', 'where', 'delete', 'contact'] as const;

/** /privacy: what the app keeps, where, and how to delete it. Plain words, no legalese. */
export function Privacy() {
  const [lang, setLang] = useState(savedParentLanguage);
  setLocale(lang);
  const deleted = new URLSearchParams(window.location.search).get('deleted') === '1';
  return (
    <main className="screen privacy">
      <header className="row spread">
        <div className="row">
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => goBack('/')}>
            <span className="flip-rtl">←</span>
          </button>
          <h1 style={{ fontSize: '1.4rem' }}>{t('privacy.title')}</h1>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const next = lang === 'ar' ? 'en' : 'ar';
            saveParentLanguage(next);
            setLang(next);
          }}
        >
          {t('parent.langSwitch')}
        </button>
      </header>
      {deleted && (
        <p className="banner" role="status">
          {t('account.deleted')}
        </p>
      )}
      <p className="muted">{t('privacy.intro')}</p>
      {SECTIONS.map((s) => (
        <section key={s} className="card stack">
          <h2>{t(`privacy.${s}Title`)}</h2>
          <p>{t(`privacy.${s}`)}</p>
        </section>
      ))}
      <p className="muted small">{t('privacy.updated')}</p>
    </main>
  );
}
