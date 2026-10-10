import { useState } from 'react';
import { api, ApiError } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';

export function Auth({ onSignedIn, onSwitchLanguage }: { onSignedIn: (email: string) => void; onSwitchLanguage: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
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
          : await api<{ email: string }>('POST', '/auth/signup', { email, password, inviteCode: invite });
      onSignedIn(r.email);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      const msg = t(`parent.errors.${code}`);
      setError(msg.startsWith('parent.errors.') ? (code === 'offline' ? t('common.offline') : t('common.error')) : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
        <img src="/icon-192.png" alt="" width={64} height={64} style={{ borderRadius: 16 }} />
        <h1 style={{ fontSize: '1.6rem' }}>{t('parent.title')}</h1>
      </div>
      <div className="segmented" role="tablist" style={{ justifyContent: 'center' }}>
        <button className="chip" role="tab" aria-pressed={mode === 'signin'} aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
          {t('parent.signIn')}
        </button>
        <button className="chip" role="tab" aria-pressed={mode === 'signup'} aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
          {t('parent.signUp')}
        </button>
      </div>
      <form className="card stack" onSubmit={submit}>
        <label className="field">
          {t('parent.email')}
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
        {mode === 'signup' && (
          <label className="field">
            {t('parent.invite')}
            <input className="input" autoComplete="off" value={invite} onChange={(e) => setInvite(e.target.value)} />
          </label>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>
          {mode === 'signin' ? t('parent.signIn') : t('parent.signUp')}
        </button>
      </form>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button className="link" onClick={() => navigate('/')}>
          {t('app.name')}
        </button>
        <button className="link" onClick={onSwitchLanguage}>
          {t('parent.langSwitch')}
        </button>
      </div>
    </main>
  );
}
