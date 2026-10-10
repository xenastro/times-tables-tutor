import { useEffect, useState } from 'react';
import { api, ApiError } from '../data/api';
import { getDevice, setDevice, type DeviceRecord } from '../data/db';
import { t } from '../i18n';
import { navigate } from '../router';
import type { LearnerDTO } from '../shared/api';

/**
 * A parent signed in on a phone where a child already practises on their own: connect that
 * child to this account, then say whose phone it is (a child's own phone shouldn't stay signed in).
 */
export function ConnectHere({ onChanged }: { onChanged: () => void }) {
  const [device, setLocalDevice] = useState<DeviceRecord | null>(null);
  const [step, setStep] = useState<'hidden' | 'ask' | 'whose'>('hidden');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDevice().then(async (d) => {
      if (!d) return;
      try {
        const { learner } = await api<{ learner: LearnerDTO }>('GET', '/device/me', undefined, d.token);
        if (cancelled || learner.connected !== false) return;
        setLocalDevice({ ...d, learner });
        setStep('ask');
      } catch {
        /* offline, or the phone was unlinked */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (step === 'hidden' || !device) return null;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      const { learner } = await api<{ learner: LearnerDTO }>(
        'POST',
        '/learners/claim',
        { displayName: name.trim() || undefined },
        device.token,
      );
      await setDevice({ ...device, learner });
      setStep('whose');
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(t(`connect.errors.${code}`).startsWith('connect.') ? t('common.error') : t(`connect.errors.${code}`));
    } finally {
      setBusy(false);
    }
  }

  async function childsPhone() {
    // Don't leave the parent area signed in on the child's own phone.
    await api('POST', '/auth/logout').catch(() => undefined);
    navigate('/', { replace: true });
  }

  if (step === 'whose')
    return (
      <section className="card stack" aria-labelledby="whose-title">
        <h2 id="whose-title">{t('connect.whoseTitle')}</h2>
        <p className="muted small">{t('connect.whoseBody')}</p>
        <button className="btn btn-primary" onClick={() => void childsPhone()}>
          {t('connect.childsPhone')}
        </button>
        <button className="btn btn-soft" onClick={() => setStep('hidden')}>
          {t('connect.myPhone')}
        </button>
      </section>
    );

  return (
    <form className="card stack" onSubmit={connect} aria-labelledby="connect-title">
      <div className="row">
        <span className="avatar avatar-lg" aria-hidden="true">
          {device.learner.avatar}
        </span>
        <h2 id="connect-title">{t('connect.hereTitle')}</h2>
      </div>
      <p className="muted small">{t('connect.hereBody')}</p>
      <label className="field">
        {t('connect.nameLabel')}
        <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {t('connect.hereButton')}
      </button>
    </form>
  );
}
