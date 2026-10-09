import { useState } from 'react';
import { FactMap, Legend } from '../components/FactMap';
import { Sheet } from '../components/FactSheet';
import { GuideSteps } from '../components/StrategyView';
import { factKey } from '../engine/facts';
import { t } from '../i18n';
import { goBack } from '../router';
import { useLearner } from './LearnerContext';

export function MapScreen() {
  const { state, settings } = useLearner();
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const fact = selected ? state.facts[factKey(...selected)] : null;

  return (
    <main className="screen">
      <header className="row">
        <button className="icon-btn" aria-label={t('common.back')} onClick={() => goBack('/')}>
          ←
        </button>
        <h1 style={{ fontSize: '1.4rem' }}>{t('map.title')}</h1>
      </header>
      <section className="card stack">
        <FactMap state={state} showBonus onSelect={(a, b) => setSelected([a, b])} />
        <Legend />
      </section>
      <p className="muted small">{state.activeMax === 12 ? t('home.bonusUnlocked') : t('home.bonusLocked')}</p>

      {selected && fact && (
        <Sheet onClose={() => setSelected(null)}>
          <p className="fact num" style={{ fontSize: '2.4rem', fontWeight: 700 }}>
            {selected[0]} × {selected[1]} = {selected[0] * selected[1]}
          </p>
          <span className={`pill ${fact.level >= 3 ? 'good' : fact.level >= 1 ? 'warm' : ''}`} style={{ alignSelf: 'flex-start' }}>
            {t(`map.factLevel${fact.level}`)}
          </span>
          <GuideSteps a={selected[0]} b={selected[1]} showBar={settings.pictureHints !== 'off'} />
        </Sheet>
      )}
    </main>
  );
}
