import { strategyFor, type Strategy } from '../engine/strategies';
import { t } from '../i18n';

/** "h groups of n" drawn as rows of dots, with the strategy's parts in different shades. */
export function DotPicture({ strategy }: { strategy: Strategy }) {
  const { groups, size, bands } = strategy;
  const gap = 4;
  const dot = 14;
  const bandGap = 10;
  const step = dot + gap;
  const width = size * step - gap;
  const height = groups * step - gap + (bands.length - 1) * bandGap;

  const rows = [];
  let y = 0;
  let row = 0;
  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi];
    for (let r = 0; r < band.rows; r++, row++) {
      for (let c = 0; c < size; c++) {
        const fill =
          band.tone === 'a' ? 'var(--accent)' : band.tone === 'b' ? 'var(--lv1)' : 'none';
        rows.push(
          <circle
            key={`${row}-${c}`}
            cx={c * step + dot / 2}
            cy={y + dot / 2}
            r={dot / 2}
            fill={fill}
            stroke={band.tone === 'removed' ? 'var(--ink-3)' : 'none'}
            strokeDasharray={band.tone === 'removed' ? '3 3' : undefined}
            strokeWidth={band.tone === 'removed' ? 1.5 : 0}
          />,
        );
      }
      y += step;
    }
    y += bandGap;
  }

  return (
    <svg
      className="dots"
      // Cap the dot size so small facts (like 7 × 1) don't turn into giant circles.
      style={{ maxWidth: size * 30 }}
      viewBox={`-2 -2 ${width + 4} ${height + 4}`}
      role="img"
      aria-label={`${groups} rows of ${size}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {rows}
    </svg>
  );
}

export function strategyText(s: Strategy): string {
  return t(`strategy.${s.kind}`, { ...s.vars, p: s.product });
}

export function StrategyView({ a, b, showPicture = true }: { a: number; b: number; showPicture?: boolean }) {
  const s = strategyFor(a, b);
  return (
    <div className="stack">
      <p className="strategy-text">{strategyText(s)}</p>
      {showPicture && <DotPicture strategy={s} />}
    </div>
  );
}
