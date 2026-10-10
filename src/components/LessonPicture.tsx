import { useEffect, useRef } from 'react';
import type { Picture } from '../engine/lessons';
import { n } from '../i18n';

/**
 * Pictures for the "Understand" lessons. Each one grows by one group, row or jump per step, and
 * the new part arrives with a calm animation so the child sees what was added.
 */
export function LessonPicture({ picture }: { picture: Picture }) {
  switch (picture.kind) {
    case 'groups':
      return <Groups groups={picture.groups} each={picture.each} />;
    case 'array':
      return <ArrayPicture rows={picture.rows} cols={picture.cols} turned={!!picture.turned} />;
    case 'line':
      return <NumberLine step={picture.step} hops={picture.hops} landed={picture.landed} max={picture.max} />;
  }
}

/** Remembers how many items were shown last time, so only new ones animate in. */
function usePrevious(count: number): number {
  const prev = useRef(0);
  const before = prev.current;
  useEffect(() => {
    prev.current = count;
  });
  return before;
}

const ITEM = '🍎';

function Groups({ groups, each }: { groups: number; each: number }) {
  const before = usePrevious(groups);
  return (
    <div className="lp-groups" role="img" aria-label={`${groups} × ${each}`}>
      {Array.from({ length: groups }, (_, g) => (
        <div key={`${g}-${each}`} className={`lp-plate${g >= before ? ' enter' : ''}`} style={{ '--d': `${(g - before) * 300}ms`, '--cols': Math.min(each, 3) } as React.CSSProperties}>
          {Array.from({ length: each }, (_, i) => (
            <span key={i} aria-hidden="true">
              {ITEM}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ArrayPicture({ rows, cols, turned }: { rows: number; cols: number; turned: boolean }) {
  const before = usePrevious(rows);
  return (
    <div className="lp-array-stage" role="img" aria-label={turned ? `${cols} × ${rows}` : `${rows} × ${cols}`}>
      <div className={`lp-array${turned ? ' turned' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 30px)` }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          return (
            <span
              key={i}
              className={r >= before ? 'enter' : undefined}
              style={{ '--d': `${(r - before) * 300 + (i % cols) * 120}ms` } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}

const LINE_W = 320;
const PAD = 18;

/** 0 to `max` with `hops` jumps of `step`. The newest jump draws itself; its landing waits for the child. */
function NumberLine({ step, hops, landed, max }: { step: number; hops: number; landed: number; max: number }) {
  const x = (v: number) => PAD + (v / max) * (LINE_W - 2 * PAD);
  const tickEvery = max <= 20 ? 1 : step / 2;
  const ticks = Array.from({ length: Math.floor(max / tickEvery) + 1 }, (_, i) => i * tickEvery);
  const y = 92;
  return (
    <svg className="lp-line" viewBox={`0 0 ${LINE_W} 124`} role="img" aria-label={`${hops} × ${step}`}>
      <line x1={PAD} x2={LINE_W - PAD} y1={y} y2={y} className="lp-axis" />
      {ticks.map((v) => (
        <line key={v} x1={x(v)} x2={x(v)} y1={y - (v % step === 0 ? 8 : 4)} y2={y + (v % step === 0 ? 8 : 4)} className="lp-tick" />
      ))}
      <text x={x(0)} y={y + 26} className="lp-label">
        {n(0)}
      </text>
      {Array.from({ length: hops }, (_, h) => {
        const from = x(h * step);
        const to = x((h + 1) * step);
        const mid = (from + to) / 2;
        const isNew = h >= landed;
        return (
          <g key={h}>
            <path
              d={`M ${from} ${y - 4} Q ${mid} ${y - 70} ${to} ${y - 4}`}
              className={`lp-hop${isNew ? ' new' : ''}`}
              pathLength={1}
            />
            <text x={mid} y={y - 44} className="lp-hop-label">
              +{n(step)}
            </text>
            <circle cx={to} cy={y} r={6} className={`lp-dot${isNew ? ' new' : ''}`} />
            <text x={to} y={y + 26} className={`lp-label${isNew ? ' unknown' : ''}`}>
              {isNew ? '?' : n((h + 1) * step)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
