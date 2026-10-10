import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useCallback, useEffect, useState } from 'react';
import { api, phoneLabel } from '../data/api';
import { t } from '../i18n';
import type { PasskeyDTO } from '../shared/api';
import { relativeDay } from './format';

/** Passkeys: sign in with the phone's fingerprint, face or screen lock instead of the password. */
export function Passkeys() {
  const [passkeys, setPasskeys] = useState<PasskeyDTO[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'added' | 'error'>('idle');

  const load = useCallback(() => {
    api<{ passkeys: PasskeyDTO[] }>('GET', '/auth/passkeys')
      .then((r) => setPasskeys(r.passkeys))
      .catch(() => setPasskeys([]));
  }, []);

  useEffect(load, [load]);

  if (!browserSupportsWebAuthn() || !passkeys) return null;

  async function add() {
    setStatus('busy');
    try {
      const { options, challengeId } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>(
        'POST',
        '/auth/passkey/register-options',
      );
      const response = await startRegistration({ optionsJSON: options });
      await api('POST', '/auth/passkey/register', { challengeId, response, label: phoneLabel() });
      setStatus('added');
      load();
    } catch (err) {
      // Closing the phone's prompt isn't an error worth showing.
      setStatus(err instanceof Error && err.name === 'NotAllowedError' ? 'idle' : 'error');
    }
  }

  async function remove(id: string) {
    await api('DELETE', `/auth/passkeys/${encodeURIComponent(id)}`).catch(() => undefined);
    load();
  }

  return (
    <section className="card stack" aria-labelledby="passkeys-title">
      <h2 id="passkeys-title">{t('passkeys.title')}</h2>
      <p className="muted small">{t('passkeys.note')}</p>
      {passkeys.length > 0 && (
        <div className="list">
          {passkeys.map((p) => (
            <div key={p.id} className="row spread">
              <span className="stack" style={{ gap: 0 }}>
                <span>{p.label ?? t('passkeys.unnamed')}</span>
                <span className="muted small">
                  {t('passkeys.added', { when: relativeDay(p.createdAt) })}
                  {p.lastUsedAt ? ` · ${t('passkeys.used', { when: relativeDay(p.lastUsedAt) })}` : ''}
                </span>
              </span>
              <button className="btn btn-ghost" onClick={() => void remove(p.id)}>
                {t('passkeys.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
      {status === 'added' && <p className="pill good" style={{ alignSelf: 'flex-start' }}>✓ {t('passkeys.addedNow')}</p>}
      {status === 'error' && (
        <p className="error-text" role="alert">
          {t('passkeys.failed')}
        </p>
      )}
      <button className="btn btn-soft" disabled={status === 'busy'} onClick={() => void add()}>
        {t('passkeys.add')}
      </button>
    </section>
  );
}
