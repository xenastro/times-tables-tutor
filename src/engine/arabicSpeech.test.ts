import { describe, expect, it } from 'vitest';
import { arabicWords } from './arabic';
import { allClips, bilingualClips, clipSsml, clipText, exprKey, hasTens, questionKey } from './arabicSpeech';

describe('Arabic clips', () => {
  it('says a number on its own in the nominative', () => {
    expect(clipText('n56')).toBe('ستة وخمسون');
    expect(clipText('n144')).toBe('مئة وأربعة وأربعون');
    expect(clipText('n12')).toBe('اثنا عشر');
    expect(clipText('n0')).toBe('صفر');
  });

  it('matches the words shown on screen for every answer', () => {
    for (let n = 1; n <= 144; n++) expect(clipText(`n${n}`)).toBe(arabicWords(n));
  });

  it('reads sums with both numbers in the nominative', () => {
    expect(clipText('t7x8')).toBe('سبعة ضرب ثمانية');
    expect(clipText('t12x12')).toBe('اثنا عشر ضرب اثنا عشر');
    expect(clipText(exprKey({ op: 'plus', x: 70, y: 7 }))).toBe('سبعون زائد سبعة');
    expect(clipText(exprKey({ op: 'minus', x: 100, y: 10 }))).toBe('مئة ناقص عشرة');
  });

  it('uses the genitive after نصف, with the article', () => {
    expect(clipText(exprKey({ op: 'half', x: 60 }))).toBe('نصف الستين');
    expect(clipText(exprKey({ op: 'half', x: 12 }))).toBe('نصف الاثني عشر');
    expect(clipText(exprKey({ op: 'half', x: 120 }))).toBe('نصف المئة والعشرين');
  });

  it('asks a missing number with the result in the nominative', () => {
    expect(clipText(questionKey({ a: 7, b: 8, form: 'missing', missing: 'a' }))).toBe('كم ضرب ثمانية، والناتج ستة وخمسون؟');
    expect(clipText(questionKey({ a: 7, b: 8, form: 'missing', missing: 'b' }))).toBe('سبعة ضرب كم، والناتج ستة وخمسون؟');
  });

  it('pins each tens ending with a sukun for the voice', () => {
    expect(clipSsml('n144')).toBe('مِئَة وَأَرْبَعَة وَأَرْبَعُونْ');
    expect(clipSsml('gy9_45')).toBe('تِسْعَة ضَرْب كَمْ، وَالنَّاتِج خَمْسَة وَأَرْبَعُونْ؟');
    expect(clipSsml('t7x8')).toBe('سَبْعَة ضَرْب ثَمَانِيَة');
    expect(hasTens('n56')).toBe(true);
    expect(hasTens('n13')).toBe(false);
  });

  it('covers every question and answer, and every sum in the guides and lessons', () => {
    const all = new Set(allClips());
    for (const k of bilingualClips()) expect(all.has(k)).toBe(true);
    expect(all.has('t12x12')).toBe(true);
    expect(all.has('n144')).toBe(true);
    expect(all.has('p0_10')).toBe(true); // counting in 10s starts at 0
    for (const k of all) expect(() => clipSsml(k)).not.toThrow();
  });
});
