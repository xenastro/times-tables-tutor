import { useState } from 'react';
import { withDefaults, type LearnerSettings } from '../engine/types';
import { api } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';
import type { LearnerDTO } from '../shared/api';

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  note,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  note?: string;
}) {
  return (
    <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 6 }}>
      <legend style={{ fontWeight: 600, marginBottom: 6 }}>{label}</legend>
      <div className="segmented">
        {options.map((o) => (
          <button type="button" key={String(o.value)} className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {note && <p className="muted small">{note}</p>}
    </fieldset>
  );
}

export function SettingsPanel({ learner, onSaved }: { learner: LearnerDTO; onSaved: (l: LearnerDTO) => void }) {
  const [s, setS] = useState<LearnerSettings>(withDefaults(learner.settings));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState('');

  const set = <K extends keyof LearnerSettings>(k: K, v: LearnerSettings[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setStatus('idle');
  };

  async function save() {
    setStatus('saving');
    try {
      const { learner: l } = await api<{ learner: LearnerDTO }>('PATCH', `/learners/${learner.id}`, { settings: s });
      onSaved(l);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  async function remove() {
    await api('DELETE', `/learners/${learner.id}`);
    navigate('/parent', { replace: true });
  }

  return (
    <section className="card stack" style={{ gap: 16 }}>
      <h2>{t('parent.settings')}</h2>
      <Choice
        label={t('parent.profile')}
        value={s.profile}
        onChange={(v) => set('profile', v)}
        options={[
          { value: 'standard', label: t('parent.profileStandard') },
          { value: 'young', label: t('parent.profileYoung') },
        ]}
      />
      <Choice
        label={t('parent.range')}
        value={String(s.range)}
        onChange={(v) => set('range', v === 'auto' ? 'auto' : (Number(v) as 10 | 12))}
        options={[
          { value: 'auto', label: t('parent.rangeAuto') },
          { value: '10', label: t('parent.range10') },
          { value: '12', label: t('parent.range12') },
        ]}
      />
      <Choice
        label={t('parent.sessionLength')}
        value={s.sessionLength}
        onChange={(v) => set('sessionLength', v)}
        options={[
          { value: 20, label: t('parent.lenShort') },
          { value: 30, label: t('parent.lenNormal') },
          { value: 40, label: t('parent.lenLong') },
        ]}
      />
      <Choice
        label={t('parent.pictures')}
        value={s.pictureHints}
        onChange={(v) => set('pictureHints', v)}
        options={[
          { value: 'always', label: t('parent.picAlways') },
          { value: 'mistakes', label: t('parent.picMistakes') },
          { value: 'off', label: t('parent.picOff') },
        ]}
      />
      <Choice
        label={t('parent.readAloud')}
        value={s.readAloud ? 'on' : 'off'}
        onChange={(v) => set('readAloud', v === 'on')}
        note={t('parent.readAloudNote')}
        options={[
          { value: 'on', label: t('parent.on') },
          { value: 'off', label: t('parent.off') },
        ]}
      />
      <Choice
        label={t('parent.pace')}
        value={s.thresholdOffsetMs}
        onChange={(v) => set('thresholdOffsetMs', v)}
        note={t('parent.paceNote')}
        options={[
          { value: -500, label: t('parent.paceStrict') },
          { value: 0, label: t('parent.paceNormal') },
          { value: 1500, label: t('parent.paceGentle') },
          { value: 3000, label: t('parent.paceGentler') },
        ]}
      />
      <div className="row">
        <button className="btn btn-primary" onClick={() => void save()} disabled={status === 'saving'}>
          {t('common.save')}
        </button>
        {status === 'saved' && <span className="pill good">✓ {t('common.saved')}</span>}
        {status === 'error' && <span className="error-text">{t('common.error')}</span>}
      </div>

      <details>
        <summary className="muted small" style={{ cursor: 'pointer', padding: '8px 0' }}>
          {t('parent.danger')}
        </summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <label className="field">
            {t('parent.deleteConfirm')}
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn btn-danger" disabled={confirm !== 'DELETE'} onClick={() => void remove()}>
            {t('parent.deleteChild', { name: learner.displayName })}
          </button>
        </div>
      </details>
    </section>
  );
}
