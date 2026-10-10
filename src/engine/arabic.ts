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

/** "سبعة ضرب ثمانية": how a times-table question is read aloud. */
export function arabicQuestion(a: number, b: number): string {
  return `${arabicWords(a)} ضرب ${arabicWords(b)}`;
}
