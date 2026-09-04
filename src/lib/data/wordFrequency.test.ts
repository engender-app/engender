import { describe, expect, it } from 'vitest';
import { noteLanguage, wordFrequency, type WordFrequencySource } from './wordFrequency';
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
