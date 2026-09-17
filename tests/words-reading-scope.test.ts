/* Ticket 17 (pre-production UI/UX audit, UX14): Words that stand out
   states its real scope (era or mode and whole journal baseline) without
   pretending to use the Look back date span. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { eraForDay, type EraSpan } from '../src/lib/data/eras';
import { analyseNotes, distinctiveWords } from '../src/lib/data/wordFrequency';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const wordsReading = read('src/lib/components/WordsReading.svelte');
const statsReadingRoute = read('src/routes/stats/[reading]/+page.svelte');
const statsDoor = read('src/routes/stats/+page.svelte');
const settingsWords = read('src/routes/settings/words/+page.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('ticket 17: words reading scope and honest baseline', () => {
  describe('catalogue contracts for words scope and ignored words', () => {
    it('has words_scope_era and words_scope_mode stating whole journal baseline', () => {
      expect(en.words_scope_era).toContain('{name}');
      expect(en.words_scope_era).toContain('Whole journal baseline');
      expect(pl.words_scope_era).toContain('{name}');
      expect(pl.words_scope_era).toContain('cały dziennik');

      expect(en.words_scope_mode).toContain('{name}');
      expect(en.words_scope_mode).toContain('Whole journal baseline');
      expect(pl.words_scope_mode).toContain('{name}');
      expect(pl.words_scope_mode).toContain('cały dziennik');
    });

    it('names Words that stand out and journal notes preservation in words_ignored_sub', () => {
      expect(en.words_ignored_sub).toContain('Words that stand out');
      expect(en.words_ignored_sub).toContain('journal notes');
      expect(pl.words_ignored_sub).toContain('Słowa, które się wyróżniają');
      expect(pl.words_ignored_sub).toContain('notatkach dziennika');
    });

    it('has words_return_to_reading action in both catalogues', () => {
      expect(en.words_return_to_reading).toBe('Return to Words that stand out');
      expect(pl.words_return_to_reading).toBe('Wróć do: Słowa, które się wyróżniają');
    });
  });

  describe('stats/[reading] subtitle behavior for words', () => {
    it('does not display the Look back date span for words', () => {
      // For reading === 'words', subtitle must bind/read the words scope, not label
      expect(statsReadingRoute).toMatch(/subtitle=\{reading === 'words'\s*\?/);
      expect(statsReadingRoute).toContain('bind:scopeSubtitle');
    });
  });

  describe('Look back tile states the scope exception', () => {
    it('passes span to WordsReading on the Look back door', () => {
      expect(statsDoor).toMatch(/<WordsReading\s+view="tile"\s+span=\{resolvedSpan\}/);
    });

    it('displays the era or mode scope and baseline in the tile note', () => {
      expect(wordsReading).toMatch(/note=\{dimension === 'era'/);
      expect(wordsReading).toContain('words_scope_era');
      expect(wordsReading).toContain('words_scope_mode');
    });

    it('appends dimension and id to the tile href when selected', () => {
      expect(wordsReading).toContain('dimension=${dimension}&id=');
    });
  });

  describe('disjoint Look back spans and data agreement', () => {
    const eras: EraSpan[] = [
      { id: 'era-1', name: 'Questioning', startEpochDay: 100, endEpochDay: 200 },
      { id: 'era-2', name: 'Transition', startEpochDay: 201, endEpochDay: 300 }
    ];

    const entries = [
      { epochDay: 110, note: 'curious doubt explore', presentationId: null },
      { epochDay: 150, note: 'curious wonder seek', presentationId: null },
      { epochDay: 220, note: 'clinic hormone doctor', presentationId: null },
      { epochDay: 280, note: 'clinic changes bloom', presentationId: null }
    ];

    it('resolves different eras for spans in different eras, producing different data', () => {
      const spanA = { start: 105, end: 140 }; // In era-1
      const spanB = { start: 210, end: 250 }; // In era-2

      const eraA = eraForDay(eras, spanA.end) ?? eraForDay(eras, spanA.start);
      const eraB = eraForDay(eras, spanB.end) ?? eraForDay(eras, spanB.start);

      expect(eraA?.id).toBe('era-1');
      expect(eraB?.id).toBe('era-2');
      expect(eraA?.name).not.toBe(eraB?.name);

      const analysed = analyseNotes(entries);
      const entriesA = analysed.filter((e) => e.epochDay >= eraA!.startEpochDay! && e.epochDay <= eraA!.endEpochDay!);
      const entriesB = analysed.filter((e) => e.epochDay >= eraB!.startEpochDay! && e.epochDay <= eraB!.endEpochDay!);

      const wordsA = distinctiveWords(entriesA, analysed);
      const wordsB = distinctiveWords(entriesB, analysed);

      expect(wordsA.map((w) => w.word)).not.toEqual(wordsB.map((w) => w.word));
    });

    it('two disjoint spans show the same Words data only when the displayed whole-era scope is the same', () => {
      const span1 = { start: 105, end: 125 }; // Disjoint within era-1
      const span2 = { start: 160, end: 180 }; // Disjoint within era-1

      const era1 = eraForDay(eras, span1.end) ?? eraForDay(eras, span1.start);
      const era2 = eraForDay(eras, span2.end) ?? eraForDay(eras, span2.start);

      expect(era1?.id).toBe(era2?.id);
      expect(era1?.name).toBe('Questioning');

      const analysed = analyseNotes(entries);
      const entries1 = analysed.filter((e) => e.epochDay >= era1!.startEpochDay! && e.epochDay <= era1!.endEpochDay!);
      const entries2 = analysed.filter((e) => e.epochDay >= era2!.startEpochDay! && e.epochDay <= era2!.endEpochDay!);

      const words1 = distinctiveWords(entries1, analysed);
      const words2 = distinctiveWords(entries2, analysed);

      expect(words1).toEqual(words2);
    });
  });

  describe('settings/words explanatory copy and return navigation', () => {
    it('offers return to the reading with return query parameter', () => {
      expect(settingsWords).toContain('data-words-return-reading');
      expect(settingsWords).toContain('words_return_to_reading');
    });

    it('returns to the reading via back when arriving from reading', () => {
      expect(settingsWords).toMatch(/back=\{.*returnParam/);
    });

    it('words-manage-link and words-sheet-link preserve return context', () => {
      expect(wordsReading).toMatch(/manageHref\s*=\s*\$derived\.by\([\s\S]*\/settings\/words\?return=/);
      expect(wordsReading).toContain('href={manageHref}');
    });
  });
});
