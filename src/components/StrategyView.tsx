import { guideFor, type Bar, type Expr } from '../engine/guide';
import { t } from '../i18n';

/**
 * Bar model: one labelled block per group. Blocks in tone "b" are the part being added,
 * "removed" is taken away, "faded" is the half we don't need.
 */
export function BarModel({ bar, compact }: { bar: Bar; compact?: boolean }) {
  const count = bar.segments.length;
  const gap = 4;
  const h = compact ? 30 : 40;
  const w = 44;
  const width = count * w + (count - 1) * gap;
  return (
    <svg
      className="bar-model"
      viewBox={`0 0 ${width} ${h}`}
      style={{ maxWidth: count * (compact ? 34 : 48) }}
      role="img"
      aria-label={`${count} groups of ${bar.size}`}
    >
      {bar.segments.map((tone, i) => {
        const x = i * (w + gap);
        const removed = tone === 'removed';
        return (
          <g key={i} className={`seg seg-${tone}`}>
            <rect
              x={removed ? x + 1 : x}
              y={removed ? 1 : 0}
              width={removed ? w - 2 : w}
              height={removed ? h - 2 : h}
              rx={7}
              strokeDasharray={removed ? '4 3' : undefined}
            />
            <text x={x + w / 2} y={h / 2 + 1} textAnchor="middle" dominantBaseline="middle">
              {bar.size}
            </text>
            {removed && <line x1={x + 8} y1={h - 8} x2={x + w - 8} y2={8} />}
          </g>
        );
      })}
    </svg>
  );
}

export function exprText(e: Expr): string {
  switch (e.op) {
    case 'times':
      return `${e.x} × ${e.y}`;
    case 'plus':
      return `${e.x} + ${e.y}`;
    case 'minus':
      return `${e.x} − ${e.y}`;
    case 'half':
      return `${t('guide.half')} ${e.x}`;
  }
}

/** The whole method at a glance, with every answer filled in (for the fact map and the parent view). */
export function GuideSteps({ a, b, showBar = true }: { a: number; b: number; showBar?: boolean }) {
  const g = guideFor(a, b);
  const last = g.steps[g.steps.length - 1];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <ol className="guide-list">
        {g.steps.map((s, i) => (
          <li key={i}>
            <span className="muted">{t(`guide.${s.text}`, s.vars)}</span>
            <strong className="num">
              {exprText(s.expr)} = {s.answer}
            </strong>
          </li>
        ))}
      </ol>
      {showBar && <BarModel bar={last.bar} />}
      {last.note && <p className="guide-note">{t(`guide.${last.note}`, last.vars)}</p>}
    </div>
  );
}
