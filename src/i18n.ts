import en from './locales/en.json';

type Dict = { [k: string]: string | Dict };

// Arabic (and RTL) will be added as another dictionary; layout already uses logical CSS properties.
const dict: Dict = en;

/** A number (or a string of digits) as it should be displayed. */
export function n(x: number | string): string {
  return String(x);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') return key;
  return node.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
}
