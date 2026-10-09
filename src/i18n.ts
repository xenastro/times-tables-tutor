import en from './locales/en.json';

type Dict = { [k: string]: string | Dict };

// Arabic (and RTL) will be added as another dictionary; layout already uses logical CSS properties.
const dict: Dict = en;

export function t(key: string, vars?: Record<string, string | number>): string {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') return key;
  return node.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
}
