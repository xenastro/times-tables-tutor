import { describe, expect, it } from 'vitest';
import { arabicParts, arabicQuestion, arabicWords, toEasternDigits, toWesternDigits } from './arabic';

describe('Arabic numbers', () => {
  it('converts digits both ways', () => {
    expect(toEasternDigits('7 × 8 = 56')).toBe('٧ × ٨ = ٥٦');
    expect(toWesternDigits('١٤٤')).toBe('144');
    expect(toWesternDigits(toEasternDigits('0123456789'))).toBe('0123456789');
  });

  it('reads two-digit numbers units first', () => {
    expect(arabicWords(56)).toBe('ستة وخمسون');
    expect(arabicWords(21)).toBe('واحد وعشرون');
    expect(arabicWords(99)).toBe('تسعة وتسعون');
    expect(arabicWords(40)).toBe('أربعون');
    expect(arabicWords(10)).toBe('عشرة');
    expect(arabicWords(7)).toBe('سبعة');
    expect(arabicWords(0)).toBe('صفر');
  });

  it('handles 11–19 and the hundreds', () => {
    expect(arabicWords(11)).toBe('أحد عشر');
    expect(arabicWords(12)).toBe('اثنا عشر');
    expect(arabicWords(15)).toBe('خمسة عشر');
    expect(arabicWords(100)).toBe('مئة');
    expect(arabicWords(108)).toBe('مئة وثمانية');
    expect(arabicWords(110)).toBe('مئة وعشرة');
    expect(arabicWords(120)).toBe('مئة وعشرون');
    expect(arabicWords(132)).toBe('مئة واثنان وثلاثون');
    expect(arabicWords(144)).toBe('مئة وأربعة وأربعون');
  });

  it('links each word to the digit it names', () => {
    // 56: "ستة" names the 6 (index 1), "وخمسون" names the 5 (index 0).
    expect(arabicParts(56)).toEqual([
      { text: 'ستة', digits: [1] },
      { text: 'وخمسون', digits: [0] },
    ]);
    expect(arabicParts(144).map((p) => p.digits)).toEqual([[0], [2], [1]]);
    // Every digit of every product up to 12 × 12 is named by some word.
    for (let n = 1; n <= 144; n++) {
      const named = new Set(arabicParts(n).flatMap((p) => p.digits));
      const nonZero = String(n)
        .split('')
        .map((d, i) => (d === '0' ? -1 : i))
        .filter((i) => i >= 0);
      for (const i of nonZero) expect(named.has(i), `${n} digit ${i}`).toBe(true);
    }
  });

  it('reads a question', () => {
    expect(arabicQuestion(7, 8)).toBe('سبعة ضرب ثمانية');
  });
});
