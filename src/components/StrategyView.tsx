import { useEffect, useRef } from 'react';
import { guideFor, type Bar, type Expr } from '../engine/guide';
import { trickFor } from '../engine/tricks';
import { t } from '../i18n';
import { TrickShow } from './TrickShow';

/**
 * Bar model: one labelled block per group. Tone "b" is the part being added, "removed" is
 * taken away, "faded" is the part we don't need. When the bar changes between steps, new
 * blocks pop in one after another and changed blocks recolour, so the step is *seen*.
 */
export function BarModel({ bar, compact }: { bar: Bar; compact?: boolean }) {
  const prevCount = useRef(0);
  const firstNew = prevCount.current;
  useEffect(() => {
    prevCount.current = bar.segments.length;
  });
  return (
    <div
      className={`bar-model${compact ? ' compact' : ''}`}
      role="img"
      aria-label={`${bar.segments.length} groups of ${bar.size}`}
    >
      {bar.segments.map((tone, i) => (
        <div
          key={i}
          className={`seg seg-${tone}${i >= firstNew ? ' enter' : ''}`}
          style={{ '--d': `${Math.max(0, i - firstNew) * 140}ms` } as React.CSSProperties}
        >
          {bar.size}
        </div>
      ))}
    </div>
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

/** An expression; a swapped factor visibly flips from the old number to the new one. */
export function ExprView({ expr }: { expr: Expr }) {
  if (expr.op !== 'times' || !expr.from) return <>{exprText(expr)}</>;
  const swapped = (v: number) => (
    <span className="swap">
      <span className="swap-old" aria-hidden="true">
        {expr.from!.value}
      </span>
      <span className="swap-new">{v}</span>
    </span>
  );
  return (
    <>
      {expr.from.pos === 'x' ? swapped(expr.x) : expr.x} × {expr.from.pos === 'y' ? swapped(expr.y) : expr.y}
    </>
  );
}

/** A closing memory tip: an animated short when there is one, otherwise a line of text. */
export function NoteView({ note, a, b, vars }: { note: string; a: number; b: number; vars: Record<string, number> }) {
  const show = trickFor(note, a, b);
  if (show) return <TrickShow show={show} />;
  return <p className="guide-note">{t(`guide.${note}`, vars)}</p>;
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
      {last.note && <NoteView note={last.note} a={a} b={b} vars={last.vars} />}
    </div>
  );
}
