import { guideFor, missingGuideFor, type Expr } from './guide';
import { LESSONS, lessonFor } from './lessons';

/**
 * The Arabic the app can say out loud. Every phrase is a recorded clip that ships with the app
 * (made once by `scripts/make-voice.mjs`), so every phone sounds the same and needs no Arabic
 * voice of its own.
 *
 * Grammar (Fus-ha): a number on its own, or in a sum ("سبعة ضرب ثمانية", "سبعون زائد سبعة"),
 * is said in the nominative: ستة وخمسون. After نصف it is genitive: نصف الستين. Only the words
 * that change (the tens, اثنان, اثنا عشر) show it; everything else is read in pause form, the way
 * a teacher reads numbers aloud.
 *
 * The phrasing keeps to forms the voice says reliably: a missing-number question ends in the
 * nominative ("كم ضرب سبعة، والناتج ستة وخمسون؟") rather than after يساوي, which the voice
 * reads as ستة وخمسون whatever the spelling; and half takes the article (نصف الأربعين), which
 * the voice reads correctly where it drifts on نصف أربعين.
 *
 * Neural voices choose those endings from their own guess at the grammar, not from the spelling,
 * so the clip maker listens to each clip and, where the ending came out wrong, tries the other
 * ways of writing it (`SPELLINGS`) until it comes out right.
 */

/** The voice the clips are made with, and the folder they live in (change both together). */
export const VOICE = { name: 'ar-QA-AmalNeural', dir: 'amal1' };

/** A clip's file name (without extension): "t7x8", "n56", "p70_7", "gx7_56"… */
export type ClipKey = string;

/** Nominative, accusative (after يساوي), genitive (after نصف). */
type Case = 'nom' | 'acc' | 'gen';

/** The full case ending of a declinable number word (used by the 'full' spelling). */
const MARK: Record<Case, string> = { nom: 'ٌ', acc: 'ً', gen: 'ٍ' };

interface Word {
  /** Written with tashkeel, so the voice reads it the Fus-ha way. */
  text: string;
  /** Exact pronunciation (IPA) of a tens word: one of the ways to pin its ending. */
  ipa?: string;
  /** Joined to the word before by و ("and"). */
  and?: boolean;
  /** Its full case ending, written out only by the 'full' spelling. */
  mark?: string;
}

const UNITS = ['صِفْر', 'وَاحِد', 'اِثْنَان', 'ثَلَاثَة', 'أَرْبَعَة', 'خَمْسَة', 'سِتَّة', 'سَبْعَة', 'ثَمَانِيَة', 'تِسْعَة'];
const TEEN_UNITS = ['', 'أَحَدَ', 'اِثْنَا', 'ثَلَاثَةَ', 'أَرْبَعَةَ', 'خَمْسَةَ', 'سِتَّةَ', 'سَبْعَةَ', 'ثَمَانِيَةَ', 'تِسْعَةَ'];
const TENS = ['', 'عَشَرَة', 'عِشْر', 'ثَلَاث', 'أَرْبَع', 'خَمْس', 'سِتّ', 'سَبْع', 'ثَمَان', 'تِسْع'];
const TENS_IPA = ['', '', 'ʕiʃr', 'θalaːθ', 'ʔarbaʕ', 'xams', 'sitt', 'sabʕ', 'θamaːn', 'tisʕ'];
const HUNDRED = 'مِئَة';
const AND = 'وَ';

function tens(t: number, c: Case): Word {
  const [ending, ipa] = c === 'nom' ? ['ُون', 'uːn'] : ['ِين', 'iːn'];
  return { text: TENS[t] + ending, ipa: TENS_IPA[t] + ipa, mark: 'َ' };
}

/** The words of `n` (0–199) in the given case. */
export function numberWords(n: number, c: Case = 'nom'): Word[] {
  if (!Number.isInteger(n) || n < 0 || n > 199) throw new Error(`unsupported number ${n}`);
  if (n >= 100) {
    const rest = n - 100;
    const hundred = { text: HUNDRED, mark: MARK[c] };
    if (!rest) return [hundred];
    const [first, ...more] = numberWords(rest, c);
    return [hundred, { ...first, and: true }, ...more];
  }
  if (n === 2) return [{ text: c === 'nom' ? UNITS[2] : 'اِثْنَيْن' }];
  if (n < 10) return [{ text: UNITS[n], mark: MARK[c] }];
  if (n === 10) return [{ text: TENS[1], mark: MARK[c] }];
  if (n < 20) {
    const unit = n === 12 && c !== 'nom' ? 'اِثْنَيْ' : TEEN_UNITS[n - 10];
    return [{ text: unit }, { text: TEEN_TEN }];
  }
  const t = Math.floor(n / 10);
  const u = n % 10;
  const ten = tens(t, c);
  if (!u) return [ten];
  return [...numberWords(u, c), { ...ten, and: true }];
}

/** A number read in pause form even in the 'full' spelling (the factor in "كم ضرب سبعة…"). */
const bare = (words: Word[]): Word[] => words.map(({ mark: _, ...w }) => w);

const TIMES: Word = { text: 'ضَرْب' };
const PLUS: Word = { text: 'زَائِد' };
const MINUS: Word = { text: 'نَاقِص' };
const HALF: Word = { text: 'نِصْف' };
/** "and the result is": a missing-number question names the result in the nominative. */
const RESULT: Word = { text: 'وَالنَّاتِج' };
/** "How many": the gap in a missing-number question. (أي عدد would also read as "any number".) */
const HOW_MANY: Word = { text: 'كَمْ' };

/** A short pause after the last word: "كم ضرب سبعة، والناتج…". */
const pause = (words: Word[]): Word[] => words.map((w, i) => (i === words.length - 1 ? { ...w, text: w.text + '،' } : w));

const TEEN_TEN = 'عَشَر';
/** A definite noun takes no tanween: مِئَةٍ → المِئَةِ. */
const UNNUNATED: Record<string, string> = { 'ٌ': 'ُ', 'ً': 'َ', 'ٍ': 'ِ' };

/** With the article: نصف الأربعين، نصف المئة والعشرين، نصف الاثني عشر. */
const definite = (words: Word[]): Word[] =>
  words.map((w) =>
    w.text === TEEN_TEN
      ? w
      : {
          ...w,
          text: 'ال' + w.text.replace(/^اِ/, 'ا'),
          ...(w.ipa ? { ipa: 'al' + w.ipa } : {}),
          ...(w.mark ? { mark: UNNUNATED[w.mark] ?? w.mark } : {}),
        },
  );

/* ------------------------------------------------------------------ keys */

export const numberKey = (n: number): ClipKey => `n${n}`;
export const timesKey = (x: number, y: number): ClipKey => `t${x}x${y}`;

/** The clip for a sum as it is said aloud. */
export function exprKey(e: Expr): ClipKey {
  switch (e.op) {
    case 'times':
      return timesKey(e.x, e.y);
    case 'plus':
      return `p${e.x}_${e.y}`;
    case 'minus':
      return `m${e.x}_${e.y}`;
    case 'half':
      return `h${e.x}`;
    case 'gap':
      return `g${e.pos}${e.known}_${e.p}`;
  }
}

/** The clip for a practice question. */
export function questionKey(q: { a: number; b: number; form?: string; missing?: 'a' | 'b' }): ClipKey {
  if (q.form === 'missing') {
    return exprKey({ op: 'gap', pos: q.missing === 'a' ? 'x' : 'y', known: q.missing === 'a' ? q.b : q.a, p: q.a * q.b });
  }
  return timesKey(q.a, q.b);
}

/** The words a clip says. */
export function clipWords(key: ClipKey): Word[] {
  const m = /^(n|t|p|m|h|gx|gy)(\d+)(?:[x_](\d+))?$/.exec(key);
  if (!m) throw new Error(`unknown clip ${key}`);
  const [, kind, s1, s2] = m;
  const x = Number(s1);
  const y = Number(s2);
  switch (kind) {
    case 'n':
      return numberWords(x);
    case 't':
      return [...numberWords(x), TIMES, ...numberWords(y)];
    case 'p':
      return [...numberWords(x), PLUS, ...numberWords(y)];
    case 'm':
      return [...numberWords(x), MINUS, ...numberWords(y)];
    case 'h':
      return [HALF, ...definite(numberWords(x, 'gen'))];
    case 'gx':
      return [HOW_MANY, TIMES, ...pause(bare(numberWords(x))), RESULT, ...numberWords(y)];
    default:
      return [...bare(numberWords(x)), TIMES, ...pause([HOW_MANY]), RESULT, ...numberWords(y)];
  }
}

const strip = (s: string) => s.replace(/[ً-ْ]/g, '');

/** What a clip says, as plain text (no tashkeel). */
export function clipText(key: ClipKey): string {
  const text = clipWords(key)
    .map((w) => strip((w.and ? AND : '') + w.text))
    .join(' ');
  return key.startsWith('g') ? `${text}؟` : text;
}

/**
 * Ways of writing the tens words, tried in order until the voice says the ending right: as
 * written; with every number word's full case ending (يساوي سِتَّةً وَخَمْسِينَ); with a stop on
 * the ن (خَمْسُونْ); with just the tens' ending (خَمْسُونَ); or as IPA.
 */
export const SPELLINGS = ['plain', 'full', 'stopped', 'vowelled', 'ipa'] as const;
export type Spelling = (typeof SPELLINGS)[number];

function spell(w: Word, how: Spelling): string {
  if (how === 'full') return w.text + (w.mark ?? '');
  if (!w.ipa || how === 'plain') return w.text;
  if (how === 'vowelled') return w.text + 'َ';
  if (how === 'stopped') return w.text + 'ْ';
  return `<phoneme alphabet="ipa" ph="${w.ipa}">${w.text}</phoneme>`;
}

/** Whether a clip has a word whose ending the voice may get wrong. */
export const hasTens = (key: ClipKey): boolean => clipWords(key).some((w) => w.ipa);

/** The SSML body the voice reads for a clip. */
export function clipSsml(key: ClipKey, how: Spelling = 'plain'): string {
  const body = clipWords(key)
    .map((w) => (w.and ? AND : '') + spell(w, how))
    .join(' ');
  return key.startsWith('g') ? `${body}؟` : body;
}

/* ------------------------------------------------------------------ the full set */

const MAX = 12;

/** The clips that bilingual mode uses: every question and every answer. */
export function bilingualClips(): ClipKey[] {
  const keys = new Set<ClipKey>();
  for (let a = 1; a <= MAX; a++) {
    for (let b = 1; b <= MAX; b++) {
      keys.add(timesKey(a, b));
      keys.add(numberKey(a * b));
    }
  }
  return [...keys];
}

/** Every clip the app can play: bilingual mode plus everything the Arabic screens read out. */
export function allClips(): ClipKey[] {
  const keys = new Set<ClipKey>(bilingualClips());
  for (let n = 0; n <= MAX * MAX; n++) keys.add(numberKey(n));
  const add = (e: Expr | null) => e && keys.add(exprKey(e));
  for (let a = 1; a <= MAX; a++) {
    for (let b = 1; b <= MAX; b++) {
      for (const s of guideFor(a, b).steps) add(s.expr);
      for (const missing of ['a', 'b'] as const) {
        for (const intro of [false, true]) for (const s of missingGuideFor(a, b, missing, intro).steps) add(s.expr);
        keys.add(questionKey({ a, b, form: 'missing', missing }));
      }
    }
  }
  for (const id of LESSONS) for (const s of lessonFor(id).steps) add(s.expr);
  return [...keys].sort();
}
