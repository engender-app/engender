/* Word frequency over note text, grouped by presentation and by era (phase
   8 features ticket 14, ADR-0048, ADR-0049). Pure over already-fetched
   rows, the same shape statsCharts.ts and eras.ts hold to: nothing here
   reads the driver, nothing scores or ranks a word by anything but its own
   count, and nothing says what a word means.

   Two folds, not one function: `wordFrequency` counts, `groupByPresentation`
   and `groupByEra` partition. Grouping reuses each area's own existing
   shape - an entry already carries `presentationId`, and `groupByEra` is
   `eraForDay` (eras.ts) run over every row - rather than restating either
   rule here.

   Language is read off each note, not off the app's current locale or the
   corpus as a whole: someone who writes in two languages has notes in
   both, and applying the wrong stopword list to one of them either leaves
   its function words inflating the count or strips content words that
   happen to collide with the other language's closed class. There is no
   stored language on an entry to read instead (unlike Affirmation's, which
   the person chose), so `noteLanguage` is a heuristic: a Polish-only
   diacritic anywhere in the note is decisive, and short of that, whichever
   language's closed-class list the note's own words hit more often wins,
   defaulting to 'en' - the project's base locale (project.inlang) - on a
   tie or on a note with no evidence either way.

   Raw counting under-counts Polish content words on purpose. A Polish noun
   takes seven cases, so "terapia", "terapii" and "terapię" count as three
   separate words rather than one said three times. Folding endings off was
   considered and rejected: the ticket's own out-of-scope line rules out
   stemming beyond what stopword handling needs, and a rule general enough
   to merge arbitrary content-word inflections is exactly the morphological
   analyser the ticket says not to add. The stopword lists below absorb the
   same inflection by enumeration instead - Polish pronouns and
   prepositions take a small, closed set of surface forms, so every common
   one is listed rather than derived - which is the "stopword handling"
   the exemption is for. Content words keep their raw under-count, and the
   screen says so (words_pl_caveat, messages/*.json). */

import type { EraSpan } from './eras';
import { eraCoversDay } from './eras';

export interface WordFrequencySource {
  epochDay: number;
  note: string;
  presentationId: string | null;
}

/** A word and how many times it occurred, most-frequent first. Ties break
    alphabetically so the order is stable across two runs over the same
    notes rather than depending on iteration order. */
export type WordCount = readonly [word: string, count: number];

export type NoteLanguage = 'en' | 'pl';

/* Runs of letters, deliberately not letters-and-digits the way
   searchQuery.ts's TOKENS is: a search index wants "2026" and "mg"
   findable as typed, but a word-frequency list is asking what words a
   person used, and a bare number is not one. Left as its own constant
   rather than imported, the same reasoning fold.ts gives for keeping the
   text fold free of other modules - this is the tokenisation searchQuery.ts
   already draws for FTS5 compatibility, mirrored rather than shared because
   the two now split on different character classes for different reasons. */
const WORDS = /\p{L}+/gu;

const tokenize = (text: string): string[] => (text.match(WORDS) ?? []).map((w) => w.toLowerCase());

/* Diacritics with no letter in common with the Latin alphabet English uses -
   seeing any of these in a note settles the question outright. ł is
   included even though it is also a folded English "l" in isolation,
   because it never appears in English running text. */
const POLISH_DIACRITICS = /[ąćęłńóśźż]/;

/* Closed classes only: pronouns, articles, conjunctions, prepositions,
   auxiliary verb forms - the words that carry no content of their own and
   whose whole set is small enough to write out by hand. Every common
   inflected form is listed directly (the ticket's "stopword handling"
   exemption; see the header comment) rather than derived by a rule. */
const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'not', 'no', 'nor',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from', 'about',
  'into', 'over', 'under', 'up', 'down', 'out',
  'that', 'this', 'these', 'those',
  'i', 'me', 'my', 'mine', 'myself', 'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'there', 'here', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'some', 'such',
  's', 't', 'don'
]);

const STOPWORDS_PL = new Set([
  'i', 'w', 'we', 'z', 'ze', 'do', 'nie', 'się', 'to', 'że', 'żeby', 'aby',
  'a', 'ale', 'czy', 'lub', 'albo', 'ani', 'o', 'od', 'dla', 'przez', 'po',
  'przed', 'za', 'bez', 'pod', 'nad', 'między', 'przy', 'na', 'jak', 'gdy',
  'gdyby', 'więc', 'oraz', 'tylko', 'już', 'jeszcze', 'bardzo', 'może',
  'co', 'kto', 'kogo', 'komu', 'kim', 'gdzie', 'kiedy', 'dlaczego', 'ile',
  'jaki', 'jaka', 'jakie', 'jakich', 'tak',
  'ja', 'ty', 'on', 'ona', 'ono', 'my', 'wy', 'oni', 'one',
  'mnie', 'mi', 'mną', 'cię', 'cie', 'ci', 'tobą', 'go', 'jego', 'jej', 'ją',
  'nim', 'nią', 'nas', 'nam', 'nami', 'was', 'wam', 'wami', 'im', 'nich', 'nimi',
  'mój', 'moja', 'moje', 'moim', 'moją', 'moich', 'moimi',
  'twój', 'twoja', 'twoje', 'twoim', 'twoją', 'twoich', 'twoimi',
  'swój', 'swoja', 'swoje', 'swoim', 'swoją', 'swoich', 'swoimi',
  'nasz', 'nasza', 'nasze', 'naszym', 'naszą', 'naszych', 'naszymi',
  'wasz', 'wasza', 'wasze', 'waszym', 'waszą', 'waszych', 'waszymi',
  'ich',
  'ten', 'ta', 'te', 'tego', 'tej', 'tych', 'tym', 'tą', 'ta',
  'jestem', 'jesteś', 'jest', 'jesteśmy', 'jesteście', 'są',
  'był', 'była', 'było', 'byli', 'były', 'byłem', 'byłam', 'będę', 'będzie', 'będą'
]);

/** The stopword-hit count is decisive over a tie; a Polish-only diacritic
    anywhere is decisive outright. On a note with neither - too short, or
    made only of content words neither list happens to carry - the app's
    base locale (project.inlang) is the honest default rather than an
    invented third answer. */
export function noteLanguage(note: string): NoteLanguage {
  if (POLISH_DIACRITICS.test(note.toLowerCase())) return 'pl';
  const words = tokenize(note);
  let plHits = 0;
  let enHits = 0;
  for (const word of words) {
    if (STOPWORDS_PL.has(word)) plHits++;
    if (STOPWORDS_EN.has(word)) enHits++;
  }
  return plHits > enHits ? 'pl' : 'en';
}

/** Every word across `entries`, counted after each note's own stopwords are
    dropped, most-frequent first. Diacritics are kept - the count key is a
    lowercased word, never a folded one (fold.ts's fold is for search
    matching, where merging "łza" and "lza" is the point; here it would
    silently combine two different words). */
export function wordFrequency(entries: readonly { note: string }[]): WordCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const language = noteLanguage(entry.note);
    const stopwords = language === 'pl' ? STOPWORDS_PL : STOPWORDS_EN;
    for (const word of tokenize(entry.note)) {
      if (stopwords.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([wordA, countA], [wordB, countB]) => {
    if (countA !== countB) return countB - countA;
    return wordA < wordB ? -1 : wordA > wordB ? 1 : 0;
  });
}

/** Every entry's own `presentationId`, `null` the bucket for one carrying
    none - a resting state (ADR-0048), not a category to invent a label
    for. */
export function groupByPresentation<T extends { presentationId: string | null }>(
  entries: readonly T[]
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const entry of entries) {
    const key = entry.presentationId;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/** Every entry's own era by `eraForDay`'s rule, `null` the bucket for a day
    in no era (ADR-0049) - the same resting state, never "Uncategorized". */
export function groupByEra<T extends { epochDay: number }>(
  entries: readonly T[],
  eras: readonly EraSpan[]
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const entry of entries) {
    const era = eras.find((e) => eraCoversDay(e, entry.epochDay));
    const key = era?.id ?? null;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}
