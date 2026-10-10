import { useEffect, useRef, useState } from 'react';
import { useHumanCheck } from '../components/Turnstile';
import { api, ApiError, phoneLabel } from '../data/api';
import { requestPersistence, setDevice, type DeviceRecord } from '../data/db';
import type { Language } from '../engine/types';
import { saveParentLanguage, savedParentLanguage, setLocale, t } from '../i18n';
import { navigate } from '../router';
import { AVATARS, THEMES, type LearnerDTO } from '../shared/api';
import { THEME_SWATCH } from './Customize';

type Step = 'door' | 'look' | 'age' | 'code';

/** Ages on the buttons; 12 means "12 or older". Only the starting settings are kept, not the age. */
const AGES = [5, 6, 7, 8, 9, 10, 11, 12];
const YOUNG_UP_TO = 7;

function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'server_error';
  if (code === 'invalid_code') return t('welcome.invalidCode');
  if (code === 'too_many_attempts') return t('welcome.tooMany');
  if (code === 'offline') return t('welcome.offline');
  if (code === 'not_human') return t('welcome.notHuman');
  return t('common.error');
}

/**
 * The front door, on a phone that has no child yet: start practising straight away (no sign-in,
 * nothing personal), carry on from another phone with its code, or go to the grown-ups' area.
 */
export function Welcome({ onPaired }: { onPaired: (d: DeviceRecord) => void }) {
  const [lang, setLang] = useState<Language>(savedParentLanguage);
  setLocale(lang);
  const [step, setStep] = useState<Step>('door');

  const switchLang = (next: Language) => {
    saveParentLanguage(next);
    setLang(next);
  };

  async function done(res: { token: string; learner: LearnerDTO }) {
    const device: DeviceRecord = { token: res.token, learner: res.learner, lastSeq: 0 };
    await setDevice(device);
    void requestPersistence();
    onPaired(device);
  }

  if (step === 'look' || step === 'age') return <Start lang={lang} step={step} setStep={setStep} onDone={done} />;
  if (step === 'code') return <CodeEntry onBack={() => setStep('door')} onDone={done} />;

  return (
    <main className="screen door">
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => switchLang(lang === 'ar' ? 'en' : 'ar')}>
          {lang === 'ar' ? 'English' : 'العربية'}
        </button>
      </div>
      <div className="stack door-brand">
        <img src="/icon-192.png" alt="" width={88} height={88} style={{ borderRadius: 22 }} />
        <h1 style={{ fontSize: '2rem' }}>{t('app.name')}</h1>
        <p className="muted">{t('app.tagline')}</p>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <button className="btn btn-primary btn-big" onClick={() => setStep('look')}>
          {t('welcome.start')}
        </button>
        <button className="btn btn-soft" onClick={() => setStep('code')}>
          {t('welcome.haveCode')}
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 20, marginTop: 'auto' }}>
        <button className="link" onClick={() => navigate('/parent')}>
          {t('welcome.grownUp')}
        </button>
        <button className="link" onClick={() => navigate('/privacy')}>
          {t('privacy.link')}
        </button>
      </div>
    </main>
  );
}

function Start({
  lang,
  step,
  setStep,
  onDone,
}: {
  lang: Language;
  step: 'look' | 'age';
  setStep: (s: Step) => void;
  onDone: (res: { token: string; learner: LearnerDTO }) => Promise<void>;
}) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(THEMES[0]);
  const [age, setAge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The bot check runs while the child is choosing.
  const human = useHumanCheck();
  const sent = useRef(false);
  const waiting = age !== null;

  // Without a token when the check couldn't run (a filtered network): the server then allows only a few.
  const token = human.token ?? (human.failed ? '' : null);
  // Sends as soon as both the age and the bot check are ready.
  useEffect(() => {
    if (age === null || token === null || sent.current) return;
    sent.current = true;
    const settings =
      age <= YOUNG_UP_TO
        ? { profile: 'young', sessionLength: 20, pictureHints: 'always', thresholdOffsetMs: 1500, language: lang }
        : { profile: 'standard', language: lang };
    api<{ token: string; learner: LearnerDTO }>('POST', '/start', {
      avatar,
      theme,
      settings,
      label: phoneLabel(),
      turnstileToken: token,
    })
      .then(onDone)
      .catch((err) => {
        sent.current = false;
        human.reset();
        setError(errorText(err));
        setAge(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [age, token]);

  function choose(a: number) {
    setError(null);
    setAge(a);
  }

  return (
    <main className="screen">
      <header className="row">
        <button
          className="icon-btn"
          aria-label={t('common.back')}
          onClick={() => (step === 'age' ? setStep('look') : setStep('door'))}
        >
          <span className="flip-rtl">←</span>
        </button>
      </header>
      {step === 'look' ? (
        <>
          <h1 style={{ fontSize: '1.5rem' }}>{t('welcome.pickTitle')}</h1>
          <section className="card stack">
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button key={a} aria-pressed={avatar === a} onClick={() => setAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
          </section>
          <section className="card stack">
            <h2>{t('me.theme')}</h2>
            <div className="swatches">
              {THEMES.map((th) => (
                <button
                  key={th}
                  aria-label={th}
                  aria-pressed={theme === th}
                  style={{ background: THEME_SWATCH[th] }}
                  onClick={() => {
                    setTheme(th);
                    document.documentElement.dataset.accent = th;
                  }}
                />
              ))}
            </div>
          </section>
          <button className="btn btn-primary btn-big" disabled={!avatar} onClick={() => setStep('age')}>
            {t('common.continue')}
          </button>
        </>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="avatar avatar-lg" aria-hidden="true">
              {avatar}
            </span>
          </div>
          <h1 style={{ fontSize: '1.5rem', textAlign: 'center' }}>{t('welcome.ageTitle')}</h1>
          <div className="age-grid">
            {AGES.map((a) => (
              <button
                key={a}
                className="btn btn-soft"
                aria-pressed={age === a}
                disabled={waiting}
                onClick={() => choose(a)}
              >
                {a === AGES[AGES.length - 1] ? t('welcome.agePlus', { n: a }) : a}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>
            {t('welcome.ageNote')}
          </p>
          {waiting && (
            <p className="note" role="status" style={{ textAlign: 'center' }}>
              {t('welcome.starting')}
            </p>
          )}
          {error && (
            <p className="error-text" role="alert" style={{ textAlign: 'center' }}>
              {error}
            </p>
          )}
        </>
      )}
      {human.needsTap && (
        <p className="note" style={{ textAlign: 'center' }}>
          {t('welcome.tapBox')}
        </p>
      )}
      {human.widget}
    </main>
  );
}

function CodeEntry({ onBack, onDone }: { onBack: () => void; onDone: (res: { token: string; learner: LearnerDTO }) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDone(await api<{ token: string; learner: LearnerDTO }>('POST', '/pair', { code, label: phoneLabel() }));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <header className="row">
        <button className="icon-btn" aria-label={t('common.back')} onClick={onBack}>
          <span className="flip-rtl">←</span>
        </button>
      </header>
      <form className="card stack" onSubmit={link}>
        <h1 style={{ fontSize: '1.4rem' }}>{t('welcome.codeTitle')}</h1>
        <p className="muted">{t('welcome.codeBody')}</p>
        <label className="field">
          {t('welcome.codeLabel')}
          <input
            className="input num"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ fontSize: '1.8rem', letterSpacing: '0.3em', textAlign: 'center' }}
            aria-describedby={error ? 'pair-error' : undefined}
          />
        </label>
        {error && (
          <p id="pair-error" className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-big" disabled={code.length !== 6 || busy}>
          {busy ? t('welcome.linking') : t('welcome.link')}
        </button>
      </form>
    </main>
  );
}
