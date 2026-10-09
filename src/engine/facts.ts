/**
 * Facts are unordered pairs: 3×7 and 7×3 share one key, "3x7" (smaller factor first).
 */
export interface Fact {
  key: string;
  a: number;
  b: number;
}

export function factKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

export function parseKey(key: string): Fact {
  const [a, b] = key.split('x').map(Number);
  return { key, a, b };
}

/** All facts with both factors in 1..max. 10 → 55 facts, 12 → 78. */
export function allFacts(max: number): Fact[] {
  const out: Fact[] = [];
  for (let a = 1; a <= max; a++) {
    for (let b = a; b <= max; b++) out.push({ key: `${a}x${b}`, a, b });
  }
  return out;
}

/**
 * Tables from easiest to hardest strategy. A fact's "home" table is whichever of its
 * factors comes first here, and that table's strategy is the one we teach.
 */
export const EASE = [1, 10, 2, 5, 11, 9, 4, 3, 12, 8, 6, 7];

/** Teaching groups, introduced in this order. ×11 and ×12 are the bonus group. */
export const GROUPS: number[][] = [[1, 10, 2], [5], [4, 3, 8], [9, 6, 7], [11, 12]];
export const BONUS_GROUP = 4;

export function homeTable(a: number, b: number): number {
  return EASE.indexOf(a) <= EASE.indexOf(b) ? a : b;
}

/** The other factor, i.e. the size of each group when we picture "home groups of n". */
export function otherFactor(a: number, b: number): number {
  return homeTable(a, b) === a ? b : a;
}

export function groupOf(a: number, b: number): number {
  if (Math.max(a, b) > 10) return BONUS_GROUP;
  const h = homeTable(a, b);
  return GROUPS.findIndex((g) => g.includes(h));
}

/** Facts in the order we teach them: by group, then home table (by ease), then size. */
export function teachingOrder(facts: Fact[]): Fact[] {
  return [...facts].sort((x, y) => {
    const g = groupOf(x.a, x.b) - groupOf(y.a, y.b);
    if (g) return g;
    const hx = homeTable(x.a, x.b);
    const hy = homeTable(y.a, y.b);
    const h = EASE.indexOf(hx) - EASE.indexOf(hy);
    if (h) return h;
    return otherFactor(x.a, x.b) - otherFactor(y.a, y.b);
  });
}

/** "Rule" tables we can credit in bulk during the check-up if the samples are fluent. */
export const RULE_TABLES = [1, 10];
