import { browserSupportsWebAuthn, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useState } from 'react';
import { HumanCheckBox } from '../components/Turnstile';
import { api, ApiError } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';
import { ForgotPassword } from './ResetPassword';

function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'server_error';
  const msg = t(`parent.errors.${code}`);
  return msg.startsWith('parent.errors.') ? (code === 'offline' ? t('common.offline') : t('common.error')) : msg;
}

export function Auth({ onSignedIn, onSwitchLanguage }: { onSignedIn: (email: string) => void; onSwitchLanguage: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [human, setHuman] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r =
        mode === 'signin'
          ? await api<{ email: string }>('POST', '/auth/login', { email, password })
          : await api<{ email: string }>('POST', '/auth/signup', { email, password, turnstileToken: human });
      onSignedIn(r.email);
    } catch (err) {
      setAttempt((a) => a + 1);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function passkey() {
    setBusy(true);
    setError(null);
    try {
      const { options, challengeId } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>(
        'POST',
        '/auth/passkey/login-options',
      );
      const response = await startAuthentication({ optionsJSON: options });
      const r = await api<{ email: string }>('POST', '/auth/passkey/login', { challengeId, response });
      onSignedIn(r.email);
    } catch (err) {
      // Closing the phone's prompt isn't an error worth showing.
      if (!(err instanceof Error && err.name === 'NotAllowedError')) setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
        <img src="/icon-192.png" alt="" width={64} height={64} style={{ borderRadius: 16 }} />
        <h1 style={{ fontSize: '1.6rem' }}>{t('parent.title')}</h1>
        <p className="muted small">{t('parent.authNote')}</p>
      </div>
      <div className="segmented" role="tablist" style={{ justifyContent: 'center' }}>
        <button className="chip" role="tab" aria-pressed={mode === 'signin'} aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
          {t('parent.signIn')}
        </button>
        <button className="chip" role="tab" aria-pressed={mode === 'signup'} aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
          {t('parent.signUp')}
        </button>
      </div>
      {mode === 'forgot' ? (
        <ForgotPassword onBack={() => setMode('signin')} />
      ) : (
        <form className="card stack" onSubmit={submit}>
          <label className="field">
            {t('parent.email')}
            <input
              className="input"
              type="email"
              autoComplete={mode === 'signin' ? 'username webauthn' : 'email'}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            {t('parent.password')}
            <input
              className="input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <span className="muted small" style={{ fontWeight: 400 }}>{t('parent.passwordHint')}</span>}
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          {mode === 'signup' && <HumanCheckBox onToken={setHuman} attempt={attempt} />}
          <button className="btn btn-primary btn-big" disabled={busy || (mode === 'signup' && human === null)}>
            {mode === 'signin' ? t('parent.signIn') : t('parent.signUp')}
          </button>
          {mode === 'signin' && browserSupportsWebAuthn() && (
            <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void passkey()}>
              {t('passkeys.signIn')}
            </button>
          )}
          {mode === 'signin' && (
            <button type="button" className="link" onClick={() => setMode('forgot')}>
              {t('reset.forgot')}
            </button>
          )}
        </form>
      )}
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button className="link" onClick={() => navigate('/')}>
          {t('app.name')}
        </button>
        <button className="link" onClick={() => navigate('/privacy')}>
          {t('privacy.link')}
        </button>
        <button className="link" onClick={onSwitchLanguage}>
          {t('parent.langSwitch')}
        </button>
      </div>
    </main>
  );
}
