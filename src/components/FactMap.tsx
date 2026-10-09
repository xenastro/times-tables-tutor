import { factKey } from '../engine/facts';
import type { LearnerState } from '../engine/mastery';
import { t } from '../i18n';

interface Props {
  state: LearnerState;
  /** Show the 12×12 grid (bonus rows dimmed if still locked). */
  showBonus?: boolean;
  compact?: boolean;
  /** Keys to animate (facts that just moved up). */
  highlight?: Set<string>;
  onSelect?: (a: number, b: number) => void;
  /** Products appear in cells at or above this level (they've been "earned"). */
  showProductsFrom?: number;
}

export function FactMap({ state, showBonus, compact, highlight, onSelect, showProductsFrom = 3 }: Props) {
  const size = showBonus || state.activeMax === 12 ? 12 : 10;
  const cells = [];
  if (!compact) {
    cells.push(<div key="corner" className="hd" aria-hidden="true">×</div>);
    for (let b = 1; b <= size; b++) cells.push(<div key={`h${b}`} className="hd">{b}</div>);
  }
  for (let a = 1; a <= size; a++) {
    if (!compact) cells.push(<div key={`r${a}`} className="hd">{a}</div>);
    for (let b = 1; b <= size; b++) {
      const key = factKey(a, b);
      const f = state.facts[key];
      const locked = Math.max(a, b) > state.activeMax;
      const cls = `cell l${f.level}${locked ? ' locked' : ''}${highlight?.has(key) ? ' pop' : ''}`;
      const label = `${a} × ${b}: ${t(`map.factLevel${f.level}`)}`;
      const content = !compact && f.level >= showProductsFrom ? a * b : '';
      cells.push(
        onSelect ? (
          <button key={`${a}-${b}`} className={cls} aria-label={label} onClick={() => onSelect(a, b)}>
            {content}
          </button>
        ) : (
          <div key={`${a}-${b}`} className={cls} role="img" aria-label={label}>
            {content}
          </div>
        ),
      );
    }
  }
  return (
    <div className={`factmap${compact ? ' compact' : ''}`} style={{ gridTemplateColumns: `repeat(${compact ? size : size + 1}, 1fr)` }}>
      {cells}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--lv0)' }} />{t('map.legendNew')}</span>
      <span><i style={{ background: 'var(--lv1)' }} />{t('map.legendLearning')}</span>
      <span><i style={{ background: 'var(--lv3)' }} />{t('map.legendFluent')}</span>
      <span><i style={{ background: 'var(--lv5)' }} />{t('map.legendMastered')}</span>
    </div>
  );
}
