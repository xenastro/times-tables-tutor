import { homeTable, otherFactor } from './facts';

export type StrategyKind =
  | 'times1'
  | 'times10'
  | 'double'
  | 'halfOf10'
  | 'eleven'
  | 'tenPlusOne'
  | 'tenMinusOne'
  | 'doubleDouble'
  | 'doublePlusOne'
  | 'tenPlusTwo'
  | 'doubleThreeTimes'
  | 'fivePlusOne'
  | 'fivePlusTwo'
  | 'fiveSixSevenEight';

/** A band of rows in the dot picture. `tone` picks its colour; 'removed' is drawn faded. */
export interface Band {
  rows: number;
  tone: 'a' | 'b' | 'removed';
}

export interface Strategy {
  kind: StrategyKind;
  /** The picture is `groups` rows of `size` dots. */
  groups: number;
  size: number;
  product: number;
  /** Numbers the explanation text needs, e.g. intermediate doubles. */
  vars: Record<string, number>;
  bands: Band[];
}

export function strategyFor(x: number, y: number): Strategy {
  const h = homeTable(x, y);
  const n = otherFactor(x, y);
  const product = h * n;
  const base = { groups: h, size: n, product };

  if (product === 56 && (x === 7 || x === 8)) {
    return { groups: 7, size: 8, product, kind: 'fiveSixSevenEight', vars: { n: 8 }, bands: [{ rows: 7, tone: 'a' }] };
  }

  switch (h) {
    case 1:
      return { ...base, kind: 'times1', vars: { n }, bands: [{ rows: 1, tone: 'a' }] };
    case 10:
      return { ...base, kind: 'times10', vars: { n }, bands: [{ rows: 10, tone: 'a' }] };
    case 2:
      return { ...base, kind: 'double', vars: { n }, bands: [{ rows: 1, tone: 'a' }, { rows: 1, tone: 'b' }] };
    case 5:
      return {
        ...base,
        kind: 'halfOf10',
        vars: { n, ten: 10 * n },
        bands: [{ rows: 5, tone: 'a' }],
      };
    case 11:
      if (n <= 9) return { ...base, kind: 'eleven', vars: { n }, bands: [{ rows: 10, tone: 'a' }, { rows: 1, tone: 'b' }] };
      return {
        ...base,
        kind: 'tenPlusOne',
        vars: { n, ten: 10 * n },
        bands: [{ rows: 10, tone: 'a' }, { rows: 1, tone: 'b' }],
      };
    case 9:
      return {
        ...base,
        groups: 10,
        kind: 'tenMinusOne',
        vars: { n, ten: 10 * n },
        bands: [{ rows: 9, tone: 'a' }, { rows: 1, tone: 'removed' }],
      };
    case 4:
      return {
        ...base,
        kind: 'doubleDouble',
        vars: { n, d1: 2 * n },
        bands: [{ rows: 2, tone: 'a' }, { rows: 2, tone: 'b' }],
      };
    case 3:
      return {
        ...base,
        kind: 'doublePlusOne',
        vars: { n, d1: 2 * n },
        bands: [{ rows: 2, tone: 'a' }, { rows: 1, tone: 'b' }],
      };
    case 12:
      return {
        ...base,
        kind: 'tenPlusTwo',
        vars: { n, ten: 10 * n, two: 2 * n },
        bands: [{ rows: 10, tone: 'a' }, { rows: 2, tone: 'b' }],
      };
    case 8:
      return {
        ...base,
        kind: 'doubleThreeTimes',
        vars: { n, d1: 2 * n, d2: 4 * n },
        bands: [{ rows: 4, tone: 'a' }, { rows: 4, tone: 'b' }],
      };
    case 6:
      return {
        ...base,
        kind: 'fivePlusOne',
        vars: { n, five: 5 * n },
        bands: [{ rows: 5, tone: 'a' }, { rows: 1, tone: 'b' }],
      };
    case 7:
    default:
      return {
        ...base,
        kind: 'fivePlusTwo',
        vars: { n, five: 5 * n, two: 2 * n },
        bands: [{ rows: 5, tone: 'a' }, { rows: 2, tone: 'b' }],
      };
  }
}
