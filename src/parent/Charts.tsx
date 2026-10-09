import { useState } from 'react';

export interface Point {
  label: string;
  value: number | null;
  /** Shown on hover/tap. */
  detail: string;
}

const W = 640;
const H = 190;
const PAD = { top: 26, right: 8, bottom: 24, left: 34 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

function Frame({ max, children, labels }: { max: number; children: React.ReactNode; labels: string[] }) {
  const ticks = [0, max / 2, max];
  const plotH = H - PAD.top - PAD.bottom;
  const step = (W - PAD.left - PAD.right) / labels.length;
  return (
    <>
      {ticks.map((tv) => {
        const y = PAD.top + plotH - (tv / max) * plotH;
        return (
          <g key={tv}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end">
              {Number.isInteger(tv) ? tv : tv.toFixed(1)}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        // Label every other day to avoid crowding on phones.
        (labels.length - 1 - i) % 2 === 0 ? (
          <text key={i} x={PAD.left + step * i + step / 2} y={H - 6} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
      {children}
    </>
  );
}

function Tooltip({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(60, text.length * 6.6 + 16);
  const cx = Math.min(Math.max(x, PAD.left + w / 2), W - PAD.right - w / 2);
  return (
    <g pointerEvents="none">
      <rect x={cx - w / 2} y={Math.max(0, y - 30)} width={w} height={22} rx={6} fill="var(--ink)" />
      <text x={cx} y={Math.max(0, y - 30) + 15} textAnchor="middle" style={{ fill: 'var(--bg)', fontWeight: 600 }}>
        {text}
      </text>
    </g>
  );
}

export function BarChart({ data, label }: { data: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value ?? 0)));
  const plotH = H - PAD.top - PAD.bottom;
  const step = (W - PAD.left - PAD.right) / data.length;
  const barW = Math.min(22, step * 0.6);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
      <Frame max={max} labels={data.map((d) => d.label)}>
        {data.map((d, i) => {
          const v = d.value ?? 0;
          const h = (v / max) * plotH;
          const x = PAD.left + step * i + (step - barW) / 2;
          const base = PAD.top + plotH;
          const r = Math.min(4, h / 2, barW / 2);
          return (
            <g key={i}>
              {v > 0 ? (
                // Rounded top, square base anchored to the baseline.
                <path
                  className="bar"
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              ) : (
                <rect className="bar-empty" x={x} y={base - 2} width={barW} height={2} rx={1} />
              )}
              <rect
                x={PAD.left + step * i}
                y={PAD.top}
                width={step}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              >
                <title>{d.detail}</title>
              </rect>
            </g>
          );
        })}
        {hover !== null && (
          <Tooltip
            x={PAD.left + step * hover + step / 2}
            y={PAD.top + plotH - ((data[hover].value ?? 0) / max) * plotH}
            text={data[hover].detail}
          />
        )}
      </Frame>
    </svg>
  );
}

export function LineChart({ data, label }: { data: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const max = niceMax(Math.max(1, ...values));
  const plotH = H - PAD.top - PAD.bottom;
  const step = (W - PAD.left - PAD.right) / data.length;
  const xy = (i: number, v: number) => [PAD.left + step * i + step / 2, PAD.top + plotH - (v / max) * plotH] as const;

  // Connect only consecutive days with data; leave gaps for days without practice.
  const segments: string[] = [];
  let current = '';
  data.forEach((d, i) => {
    if (d.value == null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    const [x, y] = xy(i, d.value);
    current += `${current ? 'L' : 'M'}${x},${y} `;
  });
  if (current) segments.push(current);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
      <Frame max={max} labels={data.map((d) => d.label)}>
        {segments.map((s, i) => (
          <path key={i} className="line" d={s} />
        ))}
        {hover !== null && data[hover].value != null && (
          <line className="grid-line" x1={xy(hover, 0)[0]} x2={xy(hover, 0)[0]} y1={PAD.top} y2={PAD.top + plotH} />
        )}
        {data.map((d, i) =>
          d.value == null ? null : <circle key={i} className="pt" cx={xy(i, d.value)[0]} cy={xy(i, d.value)[1]} r={hover === i ? 6 : 4} />,
        )}
        {data.map((d, i) => (
          <rect
            key={`h${i}`}
            x={PAD.left + step * i}
            y={PAD.top}
            width={step}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          >
            <title>{d.detail}</title>
          </rect>
        ))}
        {hover !== null && data[hover].value != null && (
          <Tooltip x={xy(hover, data[hover].value!)[0]} y={xy(hover, data[hover].value!)[1]} text={data[hover].detail} />
        )}
      </Frame>
    </svg>
  );
}
