import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../data/api';
import { t } from '../i18n';
import type { DeviceDTO } from '../shared/api';
import { relativeDay } from './format';

export function Devices({ learnerId }: { learnerId: string }) {
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [justLinked, setJustLinked] = useState(false);
  const countRef = useRef(0);

  const refresh = useCallback(async () => {
    const r = await api<{ devices: DeviceDTO[] }>('GET', `/learners/${learnerId}/devices`);
    setDevices(r.devices);
    return r.devices;
  }, [learnerId]);

  useEffect(() => {
    void refresh().then((d) => (countRef.current = d.length));
  }, [refresh]);

  // While a code is showing, watch for the phone to link.
  useEffect(() => {
    if (!code) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(async () => {
      const d = await refresh().catch(() => null);
      if (d && d.length > countRef.current) {
        countRef.current = d.length;
        setCode(null);
        setJustLinked(true);
      }
    }, 3000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [code, refresh]);

  async function newCode() {
    setJustLinked(false);
    const r = await api<{ code: string; expiresAt: number }>('POST', `/learners/${learnerId}/pairing-code`);
    setNow(Date.now());
    setCode(r);
  }

  async function unlink(id: string) {
    await api('DELETE', `/learners/${learnerId}/devices/${id}`);
    const d = await refresh();
    countRef.current = d.length;
  }

  const minutesLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 60000)) : 0;
  const expired = code && code.expiresAt <= now;

  return (
    <section className="card stack">
      <h2>{t('parent.devices')}</h2>
      {devices.length ? (
        <div className="list">
          {devices.map((d) => (
            <div key={d.id} className="row spread">
              <span className="stack" style={{ gap: 0 }}>
                <span>{d.label ?? t('parent.phone')}</span>
                <span className="muted small">
                  {t('parent.pairedOn', { when: relativeDay(d.pairedAt) })}
                  {d.lastSeenAt ? ` · ${t('parent.seen', { when: relativeDay(d.lastSeenAt) })}` : ''}
                </span>
              </span>
              <button className="btn btn-ghost" onClick={() => void unlink(d.id)}>
                {t('parent.unlink')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('parent.noDevices')}</p>
      )}
      {justLinked && <p className="pill good" style={{ alignSelf: 'flex-start' }}>✓ Linked</p>}
      {code && !expired ? (
        <div className="stack">
          <p>{t('parent.linkSteps', { url: window.location.host })}</p>
          <div className="code-display" aria-live="polite">
            {code.code}
          </div>
          <p className="muted small">{t('parent.linkExpires', { m: minutesLeft })}</p>
          <p className="muted small">{t('parent.linkInstall')}</p>
        </div>
      ) : (
        <button className="btn btn-soft" onClick={() => void newCode()}>
          {t('parent.linkPhone')}
        </button>
      )}
    </section>
  );
}
