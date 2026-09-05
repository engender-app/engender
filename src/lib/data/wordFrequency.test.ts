import { describe, expect, it } from 'vitest';
import { analyseNotes, countWords, noteLanguage, wordFrequency, type WordFrequencySource } from './wordFrequency';
import type { EraSpan } from './eras';

const note = (
  note: string,
  presentationId: string | null = null,
  epochDay = 0
): WordFrequencySource => ({ note, presentationId, epochDay });

describe('noteLanguage', () => {
  it('reads a diacritic as decisive', () => {
    expect(noteLanguage('Dziś było ciężko, ale dobrze.')).toBe('pl');
  });

  it('reads plain English text as English', () => {
    expect(noteLanguage('Today was hard, but okay in the end.')).toBe('en');
  });

  it('counts closed-class hits when there is no diacritic to decide it', () => {
    // "w" and "to" are Polish function words with no diacritic of their own.
    expect(noteLanguage('to jest w domu')).toBe('pl');
    expect(noteLanguage('this is in the house')).toBe('en');
  });

  it('defaults to the app base locale on a tie or on no evidence at all', () => {
    expect(noteLanguage('')).toBe('en');
    expect(noteLanguage('Marta 2026')).toBe('en');
  });

  // The diacritic test reads the raw note rather than a lowercased copy of
  // it (phase 8 audit ticket 17), so both cases have to be in the class.
  it('reads a diacritic in either case', () => {
    expect(noteLanguage('DZIŚ BYŁO CIĘŻKO')).toBe('pl');
    expect(noteLanguage('Żal')).toBe('pl');
  });
});

describe('wordFrequency', () => {
  it('counts a word once per occurrence, case-insensitively', () => {
    const result = wordFrequency([note('Happy happy day. A good day.')]);
    expect(result).toContainEqual(['happy', 2]);
    expect(result).toContainEqual(['day', 2]);
  });

  it('drops English stopwords from an English note', () => {
    const result = wordFrequency([note('I am happy and I am proud of it')]);
    const words = result.map(([w]) => w);
    expect(words).not.toContain('i');
    expect(words).not.toContain('am');
    expect(words).not.toContain('and');
    expect(words).not.toContain('of');
    expect(words).not.toContain('it');
    expect(words).toContain('happy');
    expect(words).toContain('proud');
  });

  it('drops Polish stopwords from a Polish note, by the note\'s own language', () => {
    const result = wordFrequency([note('Czuję się dziś szczęśliwa i wolna')]);
    const words = result.map(([w]) => w);
    expect(words).not.toContain('się');
    expect(words).not.toContain('i');
    expect(words).toContain('czuję');
    expect(words).toContain('szczęśliwa');
    expect(words).toContain('wolna');
  });

  it('applies each note\'s own stopword list, not the majority language of the corpus', () => {
    // One Polish note buried among English ones: "się" must still fall out
    // of the Polish note without an English "the" surviving in an English
    // one, which is the whole point of per-note rather than per-corpus
    // detection.
    const result = wordFrequency([
      note('I am tired today'),
      note('I am tired today'),
      note('Czuję się bardzo szczęśliwa')
    ]);
    const words = result.map(([w]) => w);
    expect(words).not.toContain('i');
    expect(words).not.toContain('się');
    expect(result).toContainEqual(['tired', 2]);
    expect(words).toContain('szczęśliwa');
  });

  it('never merges distinct Polish words by stripping diacritics', () => {
    // łza (tear) and Iza (a name) must stay apart - a display fold that
    // strips ł the way foldText does for search would collide the two.
    const result = wordFrequency([note('łza'), note('Iza')]);
    expect(result).toContainEqual(['łza', 1]);
    expect(result).toContainEqual(['iza', 1]);
  });

  it('splits on punctuation and ignores pure numbers', () => {
    const result = wordFrequency([note('Dose 2: 0.5mg, again - day 30.')]);
    const words = result.map(([w]) => w);
    expect(words).not.toContain('2');
    expect(words).not.toContain('30');
    expect(words).toContain('dose');
    expect(words).toContain('again');
    // "0.5mg" splits on the digit/letter boundary the same TOKENS regex
    // searchQuery.ts uses does not draw - \p{L}+ takes the letters whole.
    expect(words).toContain('mg');
  });

  it('sorts by count descending, ties broken alphabetically for a stable read', () => {
    const result = wordFrequency([note('zebra zebra apple apple mango')]);
    expect(result[0]).toEqual(['apple', 2]);
    expect(result[1]).toEqual(['zebra', 2]);
    expect(result[2]).toEqual(['mango', 1]);
  });

  it('is empty over no entries and over notes that are stopwords only', () => {
    expect(wordFrequency([])).toEqual([]);
    expect(wordFrequency([note('and the of it')])).toEqual([]);
  });
});

describe('countWords with an ignore set', () => {
  it('drops an ignored word regardless of which stopword list matched its note', () => {
    // "Marta" is neither an English nor a Polish stopword, and would count
    // normally without an ignore set - the case a third-language or a name
    // has nowhere else to go (ticket 48).
    const analysed = analyseNotes([note('Marta felt happy today'), note('Marta czuła się szczęśliwa')]);
    const result = countWords(analysed, new Set(['marta']));
    const words = result.map(([w]) => w);
    expect(words).not.toContain('marta');
    expect(words).toContain('happy');
    expect(words).toContain('szczęśliwa');
  });

  it('composes with the per-note stopword fold rather than replacing it', () => {
    // "i" already falls out as an English stopword; ignoring "happy" on top
    // of that must not bring "i" back.
    const analysed = analyseNotes([note('I am happy and proud')]);
    const words = countWords(analysed, new Set(['happy'])).map(([w]) => w);
    expect(words).not.toContain('i');
    expect(words).not.toContain('happy');
    expect(words).toContain('proud');
  });

  it('case-folds the ignore set the same way tokenize() folds a note', () => {
    const analysed = analyseNotes([note('Kraków was cold')]);
    const words = countWords(analysed, new Set(['kraków'])).map(([w]) => w);
    expect(words).not.toContain('kraków');
    expect(words).toContain('cold');
  });

  it("a third-language note's content words still count normally, only the ignored one removed", () => {
    // Cyrillic, no Polish diacritic and no hit against either closed-class
    // list: noteLanguage falls back to 'en', so none of these words fall
    // out as a stopword - the ticket's own motivating gap (persona 5,
    // Yuliia). Without an ignore set every content word should count as
    // normal; naming one in the set should remove only that one.
    const analysed = analyseNotes([note('Сьогодні було важко, але вже краще')]);
    const unfiltered = countWords(analysed).map(([w]) => w);
    expect(unfiltered).toEqual(expect.arrayContaining(['сьогодні', 'було', 'важко', 'краще']));

    const withIgnore = countWords(analysed, new Set(['важко'])).map(([w]) => w);
    expect(withIgnore).not.toContain('важко');
    expect(withIgnore).toEqual(expect.arrayContaining(['сьогодні', 'було', 'краще']));
  });

  it('is unaffected by an empty or absent ignore set', () => {
    const analysed = analyseNotes([note('happy day')]);
    expect(countWords(analysed, new Set())).toEqual(countWords(analysed));
  });
});

/* Phase 8 audit ticket 17. Counted rather than timed: what the ticket asks
   for is that a note is read once, and a stopwatch cannot tell one pass
   from three on a note short enough to fit in a test.

   `String#match` is the seam because the tokeniser is the module's only
   caller of it, and the pattern check keeps the count to that one regex. If
   the tokeniser ever stops going through `String#match` this stops counting
   anything and the assertions below fail loudly, which is the right way for
   it to break. */
function tokenisationPasses(run: () => void): number {
  const real = String.prototype.match;
  let passes = 0;
  String.prototype.match = function (this: string, pattern: string | RegExp) {
    if (pattern instanceof RegExp && pattern.source === '\\p{L}+') passes++;
    return real.call(this, pattern as RegExp);
  } as typeof String.prototype.match;
  try {
    run();
  } finally {
    String.prototype.match = real;
  }
  return passes;
}

describe('reading a note once', () => {
  // English on purpose: a note with a Polish diacritic settles its language
  // before it is tokenised at all, so it could not tell one pass from two.
  const notes = [note('I am happy and tired today'), note('the mirror was kinder this morning')];

  it('tokenises each note once, however many answers are taken off it', () => {
    expect(tokenisationPasses(() => analyseNotes(notes))).toBe(notes.length);
    expect(tokenisationPasses(() => wordFrequency(notes))).toBe(notes.length);
  });

  it('reads the language off the same pass the words came from', () => {
    const analysed = analyseNotes([note('Czuję się dziś dobrze'), note('I am happy today')]);
    expect(analysed.map((a) => a.language)).toEqual(['pl', 'en']);
    expect(analysed[0].words).not.toContain('się');
    expect(analysed[1].words).not.toContain('am');
  });

  it('counts a filter change without going back to the notes', async () => {
    const { groupByPresentation } = await import('./wordFrequency');
    const analysed = analyseNotes([
      note('I am happy today', 'p1'),
      note('the mirror was kinder', 'p2'),
      note('happy again this morning', 'p1')
    ]);
    const grouped = groupByPresentation(analysed);
    // The rows still carry their `note`, since analysing keeps the row it
    // read - so the assertion below is that counting declines to look at
    // text it is holding, not that the text is out of reach.
    expect(analysed[0].note).toBe('I am happy today');

    // Every tap the screen's filter can make: one presentation, the other,
    // then back to the unfiltered list.
    const passes = tokenisationPasses(() => {
      countWords(grouped.get('p1') ?? []);
      countWords(grouped.get('p2') ?? []);
      countWords(analysed);
    });
    expect(passes).toBe(0);
    expect(countWords(grouped.get('p1') ?? [])).toContainEqual(['happy', 2]);
  });
});

describe('grouping', () => {
  it('groups by presentation, with null the bucket for entries carrying none', async () => {
    const { groupByPresentation } = await import('./wordFrequency');
    const rows = [note('a', 'p1'), note('b', null), note('c', 'p1'), note('d', 'p2')];
    const grouped = groupByPresentation(rows);
    expect(grouped.get('p1')!.map((r) => r.note)).toEqual(['a', 'c']);
    expect(grouped.get('p2')!.map((r) => r.note)).toEqual(['d']);
    expect(grouped.get(null)!.map((r) => r.note)).toEqual(['b']);
  });

  it('groups by era, with null the bucket for a day in no era (ADR-0049)', async () => {
    const { groupByEra } = await import('./wordFrequency');
    const eras: EraSpan[] = [
      { id: 'before', name: 'before I knew', startEpochDay: null, endEpochDay: 99 },
      { id: 'first-year', name: 'first year', startEpochDay: 100, endEpochDay: 200 }
    ];
    const rows = [
      note('a', null, 50),
      note('b', null, 150),
      note('c', null, 500) // after every era: no era covers it
    ];
    const grouped = groupByEra(rows, eras);
    expect(grouped.get('before')!.map((r) => r.note)).toEqual(['a']);
    expect(grouped.get('first-year')!.map((r) => r.note)).toEqual(['b']);
    expect(grouped.get(null)!.map((r) => r.note)).toEqual(['c']);
  });
});
