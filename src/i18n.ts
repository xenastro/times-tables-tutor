import { toEasternDigits, toWesternDigits } from './engine/arabic';
import type { Language, Numerals } from './engine/types';
import ar from './locales/ar.json';
import en from './locales/en.json';

type Dict = { [k: string]: string | Dict };

const DICTS: Record<Language, Dict> = { en, ar };

let language: Language = 'en';
let numerals: Numerals = 'western';

/**
 * Switches the language and digits used by `t` and `n`. Call before rendering (it is cheap and
 * idempotent). Arabic also turns the page right-to-left; sums stay left-to-right (see `.math`).
 */
export function setLocale(lang: Language, digits: Numerals = 'western') {
  language = lang;
  numerals = digits;
  if (typeof document !== 'undefined') {
    const el = document.documentElement;
    if (el.lang !== lang) el.lang = lang;
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (el.dir !== dir) el.dir = dir;
  }
}

export function currentLanguage(): Language {
  return language;
}

/** A number (or a string with digits, like "7 × 8") as it should be displayed: 0123 or ٠١٢٣. */
export function n(x: number | string): string {
  // Either way round: the Arabic texts are written with ٠١٢٣, the English ones with 0123.
  return numerals === 'eastern' ? toEasternDigits(String(x)) : toWesternDigits(String(x));
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  // Anything not translated yet falls back to English rather than showing a key.
  const s = lookup(DICTS[language], key) ?? lookup(en, key);
  if (s === undefined) return key;
  return n(s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`)));
}

/** Like `t`, but always in the given language with Western digits (for speech). */
export function tIn(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const s = lookup(DICTS[lang], key) ?? lookup(en, key);
  if (s === undefined) return key;
  return toWesternDigits(s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`)));
}

const PARENT_LANG_KEY = 'tt_parent_lang';

/** The parent area (and the screens before a phone is linked) remember their own language. */
export function savedParentLanguage(): Language {
  try {
    const saved = localStorage.getItem(PARENT_LANG_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* private mode */
  }
  // First visit: follow the phone's language.
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('ar') ? 'ar' : 'en';
}

export function saveParentLanguage(lang: Language) {
  try {
    localStorage.setItem(PARENT_LANG_KEY, lang);
  } catch {
    /* private mode */
  }
}
