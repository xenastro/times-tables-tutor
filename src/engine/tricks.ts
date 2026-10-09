/**
 * Short animated "tricks" (like a YouTube short): a row of tokens that move, appear,
 * disappear and light up, frame by frame, with a caption. Pure data so it can be tested.
 */

export interface Token {
  id: string;
  text: string;
  /** Symbols (×, =, +) are drawn lighter. */
  sym?: boolean;
}

export interface TokenState {
  /** Horizontal slot (can be fractional). */
  x: number;
  /** Vertical offset in rows (negative = up). */
  y?: number;
  hidden?: boolean;
  lit?: boolean;
}

export interface Frame {
  /** How long this frame holds before the next one. */
  ms: number;
  caption: string | null;
  captionVars?: Record<string, number>;
  tokens: Record<string, TokenState>;
}

export interface TrickShow {
  slots: number;
  /** Rows of vertical room needed above and below the main row. */
  rowsAbove: number;
  rowsBelow: number;
  tokens: Token[];
  frames: Frame[];
  /** Screen-reader summary (i18n key + vars). */
  summary: string;
  summaryVars: Record<string, number>;
}

const digits = (n: number) => String(n).split('');

/** Build a frame: every token gets a state; unspecified tokens keep `base`. */
function frame(
  ms: number,
  caption: string | null,
  base: Record<string, TokenState>,
  overrides: Record<string, Partial<TokenState>> = {},
  captionVars?: Record<string, number>,
): Frame {
  const tokens: Record<string, TokenState> = {};
  for (const [id, s] of Object.entries(base)) tokens[id] = { ...s, ...overrides[id] };
  return { ms, caption, captionVars, tokens };
}

/** Lay tokens out left to right starting at slot 0. */
function row(ids: string[], start = 0): Record<string, TokenState> {
  return Object.fromEntries(ids.map((id, i) => [id, { x: start + i }]));
}

/* ------------------------------------------------------------------ 7 × 8 */

export function sevenEightTrick(eightFirst = false): TrickShow {
  const tokens: Token[] = [
    { id: 'd7', text: '7' },
    { id: 'times', text: '×', sym: true },
    { id: 'd8', text: '8' },
    { id: 'eq', text: '=', sym: true },
    { id: 'd5', text: '5' },
    { id: 'd6', text: '6' },
  ];
  const A = row(['d7', 'times', 'd8', 'eq', 'd5', 'd6']);
  const B = row(['d5', 'd6', 'eq', 'd7', 'times', 'd8']);
  const lift = { d5: { y: -1 }, d6: { y: -1 }, d7: { y: 1 }, times: { y: 1 }, d8: { y: 1 } };
  const C: Record<string, TokenState> = {
    d5: { x: 1 },
    d6: { x: 2 },
    d7: { x: 3 },
    d8: { x: 4 },
    eq: { x: 2.5, hidden: true },
    times: { x: 3.5, hidden: true },
  };
  const liftOn = (base: Record<string, TokenState>) =>
    Object.fromEntries(Object.entries(base).map(([id, s]) => [id, { ...s, ...(lift as Record<string, Partial<TokenState>>)[id] }]));
  return {
    slots: 6,
    rowsAbove: 1,
    rowsBelow: 1,
    tokens,
    summary: 'trick.78.summary',
    summaryVars: {},
    frames: [
      frame(1200, null, A),
      frame(450, 'trick.78.flip', liftOn(A)),
      frame(750, 'trick.78.flip', liftOn(B)),
      frame(900, 'trick.78.flip', B),
      frame(600, 'trick.78.drop', B, { eq: { hidden: true }, times: { hidden: true } }),
      frame(700, 'trick.78.drop', C),
      frame(500, 'trick.78.count', C, { d5: { lit: true } }),
      frame(500, 'trick.78.count', C, { d6: { lit: true } }),
      frame(500, 'trick.78.count', C, { d7: { lit: true } }),
      frame(700, 'trick.78.count', C, { d8: { lit: true } }),
      frame(1400, 'trick.78.count', C, { d5: { lit: true }, d6: { lit: true }, d7: { lit: true }, d8: { lit: true } }),
      frame(1000, 'trick.78.back', B),
      frame(450, 'trick.78.back', liftOn(B)),
      frame(750, 'trick.78.back', liftOn(A)),
      // Asked as 8 × 7? The 7 and 8 swap places: the order doesn't matter.
      ...(eightFirst
        ? [
            frame(1200, 'trick.78.back', A),
            frame(400, 'trick.78.turn', A, { d7: { y: -1 }, d8: { y: 1 } }),
            frame(700, 'trick.78.turn', A, { d7: { x: 2, y: -1 }, d8: { x: 0, y: 1 } }),
            frame(0, 'trick.78.turn', A, { d7: { x: 2 }, d8: { x: 0 } }),
          ]
        : [frame(0, 'trick.78.back', A)]),
    ],
  };
}

/* ------------------------------------------------------------------ × 10 */

/** 7 × 10 = 70: the 7 moves up a place and a 0 fills the gap. Keeps the displayed order. */
export function tenTrick(a: number, b: number): TrickShow {
  const n = a === 10 ? b : a;
  const nd = digits(n);
  const tokens: Token[] = [];
  const left: string[] = [];
  const add = (id: string, text: string, sym = false) => {
    tokens.push({ id, text, sym });
    return id;
  };
  // The question, in the order shown.
  const factor = (v: number, tag: string) => digits(v).map((d, i) => add(`${tag}${i}`, d));
  const first = a === 10 ? factor(10, 't') : factor(n, 'n');
  const times = add('times', '×', true);
  const second = a === 10 ? factor(n, 'n') : factor(10, 't');
  const eq = add('eq', '=', true);
  left.push(...first, times, ...second, eq);
  // The answer: the digits of n, then the 0.
  const r = nd.map((d, i) => add(`r${i}`, d));
  const zero = add('z', '0');

  const start = row(left);
  const resultStart = left.length;
  const nIds = nd.map((_, i) => `n${i}`);
  const nSlot = (i: number) => start[nIds[i]].x;
  const tZero = start['t1'].x;

  // Answer tokens start hidden on top of the n digits / the 10's zero.
  const base: Record<string, TokenState> = { ...start };
  r.forEach((id, i) => (base[id] = { x: nSlot(i), hidden: true }));
  base[zero] = { x: tZero, hidden: true };

  const moved: Record<string, Partial<TokenState>> = {};
  r.forEach((id, i) => (moved[id] = { x: resultStart + i, y: 0, hidden: false }));
  const lifted: Record<string, Partial<TokenState>> = {};
  r.forEach((id, i) => (lifted[id] = { x: nSlot(i), y: -1, hidden: false }));
  const zeroIn = { x: resultStart + nd.length, y: 0, hidden: false };

  const litAll: Record<string, Partial<TokenState>> = { ...moved, [zero]: { ...zeroIn, lit: true } };
  r.forEach((id, i) => (litAll[id] = { x: resultStart + i, lit: true, hidden: false }));

  return {
    slots: resultStart + nd.length + 1,
    rowsAbove: 1,
    rowsBelow: 0,
    tokens,
    summary: 'trick.ten.summary',
    summaryVars: { n, p: n * 10 },
    frames: [
      frame(900, null, base),
      frame(500, 'trick.ten.move', base, lifted, { n }),
      frame(900, 'trick.ten.move', base, moved, { n }),
      frame(500, 'trick.ten.zero', base, { ...moved, [zero]: { x: tZero, y: -1, hidden: false } }),
      frame(900, 'trick.ten.zero', base, { ...moved, [zero]: zeroIn }),
      frame(0, 'trick.ten.done', base, litAll, { a, b, p: a * b }),
    ],
  };
}

/* ------------------------------------------------------------------ × 11 */

/** 11 × 4 = 44: the 4 copies itself twice. Only for single digits. */
export function elevenTrick(a: number, b: number): TrickShow {
  const n = a === 11 ? b : a;
  const elevenFirst = a === 11;
  const tokens: Token[] = [
    { id: 'e0', text: '1' },
    { id: 'e1', text: '1' },
    { id: 'n', text: String(n) },
    { id: 'times', text: '×', sym: true },
    { id: 'eq', text: '=', sym: true },
    { id: 'r0', text: String(n) },
    { id: 'r1', text: String(n) },
  ];
  const order = elevenFirst ? ['e0', 'e1', 'times', 'n', 'eq'] : ['n', 'times', 'e0', 'e1', 'eq'];
  const base: Record<string, TokenState> = row(order);
  const nx = base.n.x;
  base.r0 = { x: nx, hidden: true };
  base.r1 = { x: nx, hidden: true };
  return {
    slots: 7,
    rowsAbove: 1,
    rowsBelow: 0,
    tokens,
    summary: 'trick.eleven.summary',
    summaryVars: { n, p: 11 * n },
    frames: [
      frame(900, null, base),
      frame(500, 'trick.eleven.copy', base, { r0: { x: nx, y: -1, hidden: false }, n: { lit: true } }, { n }),
      frame(800, 'trick.eleven.copy', base, { r0: { x: 5, hidden: false }, n: { lit: true } }, { n }),
      frame(500, 'trick.eleven.again', base, { r0: { x: 5, hidden: false }, r1: { x: nx, y: -1, hidden: false }, n: { lit: true } }),
      frame(800, 'trick.eleven.again', base, { r0: { x: 5, hidden: false }, r1: { x: 6, hidden: false }, n: { lit: true } }),
      frame(0, 'trick.eleven.done', base, { r0: { x: 5, lit: true, hidden: false }, r1: { x: 6, lit: true, hidden: false } }, { a, b, p: a * b }),
    ],
  };
}

/* ------------------------------------------------------------------ × 9 */

/** 9 × 7 = 63: 6 is one less than 7, and 6 + 3 = 9. For 2..10. */
export function nineTrick(a: number, b: number): TrickShow {
  const n = a === 9 ? b : a;
  const p = 9 * n;
  const [tens, ones] = p < 100 ? [Math.floor(p / 10), p % 10] : [0, 0];
  const nineFirst = a === 9;
  const tokens: Token[] = [
    { id: 'nine', text: '9' },
    { id: 'times', text: '×', sym: true },
    { id: 'n', text: String(n) },
    { id: 'eq', text: '=', sym: true },
    { id: 'T', text: String(tens) },
    { id: 'O', text: String(ones) },
    // Second row: T + O = 9
    { id: 'T2', text: String(tens) },
    { id: 'plus', text: '+', sym: true },
    { id: 'O2', text: String(ones) },
    { id: 'eq2', text: '=', sym: true },
    { id: 'nine2', text: '9' },
  ];
  const order = nineFirst ? ['nine', 'times', 'n', 'eq', 'T', 'O'] : ['n', 'times', 'nine', 'eq', 'T', 'O'];
  // n is two slots wide when it's 10.
  const base: Record<string, TokenState> = row(order);
  const second = { T2: 0.5, plus: 1.5, O2: 2.5, eq2: 3.5, nine2: 4.5 };
  for (const [id, x] of Object.entries(second)) base[id] = { x, y: 1.2, hidden: true };
  const show2 = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { hidden: false }]));
  return {
    slots: 6,
    rowsAbove: 0,
    rowsBelow: 1.3,
    tokens,
    summary: 'trick.nine.summary',
    summaryVars: { n, p, tens, ones },
    frames: [
      frame(900, null, base),
      frame(900, 'trick.nine.less', base, { n: { lit: true } }, { n, tens }),
      frame(1300, 'trick.nine.less', base, { n: { lit: true }, T: { lit: true } }, { n, tens }),
      frame(700, 'trick.nine.sum', base, { T: { lit: true }, O: { lit: true } }, { tens, ones }),
      frame(500, 'trick.nine.sum', base, { T: { lit: true }, O: { lit: true }, ...show2(['T2']) }, { tens, ones }),
      frame(500, 'trick.nine.sum', base, { T: { lit: true }, O: { lit: true }, ...show2(['T2', 'plus', 'O2']) }, { tens, ones }),
      frame(1300, 'trick.nine.sum', base, { T: { lit: true }, O: { lit: true }, ...show2(['T2', 'plus', 'O2', 'eq2', 'nine2']), nine2: { hidden: false, lit: true } }, { tens, ones }),
      frame(0, 'trick.nine.done', base, show2(['T2', 'plus', 'O2', 'eq2', 'nine2']), { a, b, p }),
    ],
  };
}

/** Which animated trick (if any) goes with a guide's closing note. */
export function trickFor(note: string, a: number, b: number): TrickShow | null {
  switch (note) {
    case 'sevenEightTrick':
      return sevenEightTrick(a === 8);
    case 'tenTrick':
      return tenTrick(a, b);
    case 'elevenTrick':
      return elevenTrick(a, b);
    case 'nineTrick':
      return nineTrick(a, b);
    default:
      return null;
  }
}
