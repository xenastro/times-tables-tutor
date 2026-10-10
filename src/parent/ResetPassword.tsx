import { useState } from 'react';
import { api, ApiError } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';

/** "Forgot password?": asks for the email and sends a one-time link (if email is set up). */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ emailEnabled: boolean; devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api<{ emailEnabled: boolean; devLink?: string }>('POST', '/auth/reset-request', { email }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      const msg = t(`parent.errors.${code}`);
      setError(msg.startsWith('parent.errors.') ? t('common.error') : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{t('reset.forgotTitle')}</h2>
      {result ? (
        <>
          <p role="status">{result.emailEnabled ? t('reset.sent') : t('reset.noEmail')}</p>
          {/* Local development only: the server hands back the link instead of emailing it. */}
          {result.devLink && (
            <a className="link" href={result.devLink.replace(/^https?:\/\/[^/]+/, '')}>
              {t('reset.devLink')}
            </a>
          )}
        </>
      ) : (
        <>
          <p className="muted">{t('reset.forgotBody')}</p>
          <label className="field">
            {t('parent.email')}
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn btn-primary btn-big" disabled={busy}>
            {t('reset.send')}
          </button>
        </>
      )}
      <button type="button" className="link" onClick={onBack}>
        {t('reset.backToSignIn')}
      </button>
    </form>
  );
}

/** /parent/reset?token=…: choose a new password. */
export function ResetPassword({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>('POST', '/auth/reset', { token, password });
      onSignedIn(r.email);
      navigate('/parent', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(code === 'weak_password' ? t('parent.errors.weak_password') : code === 'invalid_reset' ? t('reset.invalid') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <form className="card stack" onSubmit={submit}>
        <h1 style={{ fontSize: '1.4rem' }}>{t('reset.newTitle')}</h1>
        <label className="field">
          {t('reset.newPassword')}
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="muted small" style={{ fontWeight: 400 }}>
            {t('parent.passwordHint')}
          </span>
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>
          {t('reset.save')}
        </button>
      </form>
    </main>
  );
}

/** At the bottom of the parent area: delete the account and everything in it. */
export function DeleteAccount() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      await api('DELETE', '/auth/account', { password });
      navigate('/privacy?deleted=1', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('parent.errors.invalid_login') : t('common.error'));
    }
  }

  return (
    <details className="card">
      <summary className="muted small" style={{ cursor: 'pointer' }}>
        {t('account.delete')}
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p className="small">{t('account.deleteNote')}</p>
        <label className="field">
          {t('parent.password')}
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          {t('parent.deleteConfirm')}
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn btn-danger" disabled={confirm !== 'DELETE' || !password} onClick={() => void remove()}>
          {t('account.deleteButton')}
        </button>
      </div>
    </details>
  );
}
