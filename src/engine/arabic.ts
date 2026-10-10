/**
 * Arabic numbers: Eastern Arabic digits (٠١٢٣) and number words.
 *
 * Arabic reads two-digit numbers units first: 56 is "ستة وخمسون", six and fifty.
 * `arabicParts` keeps each word linked to the digit(s) it names, so the reading can be animated
 * digit by digit. Hundreds come first, then units, then tens: 144 = مئة وأربعة وأربعون.
 */

const EASTERN = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** "56" → "٥٦". Leaves everything that isn't an ASCII digit alone. */
export function toEasternDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => EASTERN[Number(d)]);
}

/** "٥٦" → "56". */
export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)));
}

const UNITS = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
/** The unit word inside 11–19 (أحد عشر, اثنا عشر, ثلاثة عشر…). */
const TEEN_UNITS = ['', 'أحد', 'اثنا', ...UNITS.slice(3)];
const TEEN_TEN = 'عشر';
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
const AND = 'و';

export interface WordPart {
  /** The word as written, including a leading و ("and") when it has one. */
  text: string;
  /** Which digits of the number (indexes into its Western-digit string) this word names. */
  digits: number[];
}

/** The number's words in reading order (0–999). */
export function arabicParts(n: number): WordPart[] {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new Error(`unsupported number ${n}`);
  const s = String(n);
  const len = s.length;
  if (n < 10) return [{ text: UNITS[n], digits: [0] }];

  const h = Math.floor(n / 100);
  const rest = n % 100;
  const t = Math.floor(rest / 10);
  const u = rest % 10;
  // Digit indexes of the tens and units within the string.
  const ti = len - 2;
  const ui = len - 1;
  const parts: WordPart[] = [];

  if (h) parts.push({ text: HUNDREDS[h], digits: rest ? [0] : [0, 1, 2] });
  const and = (w: string) => (parts.length ? AND + w : w);

  if (rest === 0) return parts;
  if (rest < 10) {
    parts.push({ text: and(UNITS[u]), digits: [ui] });
  } else if (rest === 10 || (u === 0 && t > 1)) {
    parts.push({ text: and(TENS[t]), digits: [ti, ui] });
  } else if (rest < 20) {
    // 11–19: units first too, and the "ten" has no و: خمسة عشر.
    parts.push({ text: and(TEEN_UNITS[u]), digits: [ui] });
    parts.push({ text: TEEN_TEN, digits: [ti] });
  } else {
    parts.push({ text: and(UNITS[u]), digits: [ui] });
    parts.push({ text: AND + TENS[t], digits: [ti] });
  }
  return parts;
}

/** 56 → "ستة وخمسون". */
export function arabicWords(n: number): string {
  return arabicParts(n)
    .map((p) => p.text)
    .join(' ');
}

/* ------------------------------------------------------------------ recorded clips */

/**
 * The words a parent records so the app can say any answer up to 144 in their voice:
 * 1–19 (teens are whole words), the tens 20–90, مئة, و ("and") and ضرب ("times"). 30 short clips.
 */
export const ARABIC_CLIPS: string[] = [
  ...Array.from({ length: 19 }, (_, i) => String(i + 1)),
  ...[20, 30, 40, 50, 60, 70, 80, 90].map(String),
  '100',
  'and',
  'times',
];

/** What each clip says, for the recording screen. */
export function clipWord(clip: string): string {
  if (clip === 'and') return AND;
  if (clip === 'times') return 'ضرب';
  return arabicWords(Number(clip));
}

/** The clips that say `n`, in order: 56 → 6, و, 50 (ستة وخمسون). */
export function arabicClips(n: number): string[] {
  if (!Number.isInteger(n) || n < 1 || n > 199) throw new Error(`unsupported number ${n}`);
  if (n >= 100) return n === 100 ? ['100'] : ['100', 'and', ...arabicClips(n - 100)];
  if (n < 20) return [String(n)];
  const u = n % 10;
  const tens = String(n - u);
  return u ? [String(u), 'and', tens] : [tens];
}

/** "سبعة ضرب ثمانية": how a times-table question is read aloud. */
export function arabicQuestion(a: number, b: number): string {
  return `${arabicWords(a)} ضرب ${arabicWords(b)}`;
}
