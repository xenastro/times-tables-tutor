import { describe, expect, it } from 'vitest';
import { n, setLocale, t, tIn } from './i18n';
import ar from './locales/ar.json';
import en from './locales/en.json';

type Dict = { [k: string]: string | Dict };

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

function vars(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

function get(d: Dict, key: string): string {
  return key.split('.').reduce<string | Dict>((node, part) => (node as Dict)[part], d) as string;
}

describe('translations', () => {
  it('Arabic has every English text, with the same placeholders', () => {
    const enKeys = keys(en);
    expect(keys(ar).sort()).toEqual([...enKeys].sort());
    for (const k of enKeys) expect(vars(get(ar, k)), k).toEqual(vars(get(en, k)));
  });

  it('shows digits the way the learner chose, whichever language the text is in', () => {
    setLocale('en', 'eastern');
    expect(t('practice.reveal', { a: 7, b: 8, p: 56 })).toBe('٧ × ٨ = ٥٦');
    expect(n(144)).toBe('١٤٤');
    setLocale('ar', 'western');
    expect(t('home.startNote')).toBe('حوالي 5 دقائق.');
    setLocale('ar', 'eastern');
    expect(t('home.startNote')).toBe('حوالي ٥ دقائق.');
    // Speech always gets Western digits.
    expect(tIn('ar', 'speech.times', { x: 7, y: 8 })).toBe('7 ضرب 8');
    setLocale('en', 'western');
    expect(t('home.startNote')).toBe('About 5 minutes.');
  });
});
