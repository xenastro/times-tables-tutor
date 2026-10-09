import { useState } from 'react';
import { api, ApiError } from '../data/api';
import { requestPersistence, setDevice, type DeviceRecord } from '../data/db';
import { t } from '../i18n';
import { navigate } from '../router';
import type { LearnerDTO } from '../shared/api';

export function Welcome({ onPaired }: { onPaired: (d: DeviceRecord) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; learner: LearnerDTO }>('POST', '/pair', {
        code,
        label: navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.slice(0, 60) ?? null,
      });
      const device: DeviceRecord = { token: res.token, learner: res.learner, lastSeq: 0 };
      await setDevice(device);
      void requestPersistence();
      onPaired(device);
    } catch (err) {
      const codeErr = err instanceof ApiError ? err.code : 'server_error';
      setError(
        codeErr === 'invalid_code'
          ? t('welcome.invalidCode')
          : codeErr === 'too_many_attempts'
            ? t('welcome.tooMany')
            : codeErr === 'offline'
              ? t('common.offline')
              : t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
        <img src="/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 18 }} />
        <h1 style={{ fontSize: '1.8rem' }}>{t('app.name')}</h1>
        <p className="muted">{t('app.tagline')}</p>
      </div>
      <form className="card stack" onSubmit={link}>
        <h2>{t('welcome.title')}</h2>
        <p className="muted">{t('welcome.body')}</p>
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
      <button className="link" style={{ alignSelf: 'center' }} onClick={() => navigate('/parent')}>
        {t('welcome.parentLink')}
      </button>
    </main>
  );
}
