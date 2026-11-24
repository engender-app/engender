// Shared by the strings server and the lexicon page (served as a module), so
// the page and the tests match words the same way.

export const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'loc', 'voc'];
export const NOUN_SLOTS = {
  en: ['sg', 'pl'],
  pl: ['sg', 'pl'].flatMap((number) => CASES.map((grammaticalCase) => `${grammaticalCase}.${number}`))
};
export const PHRASE_SLOTS = { en: ['base'], pl: ['base'] };

/** @param {{ kind: string }} term @param {'en' | 'pl'} locale */
export const slotsOf = (term, locale) => (term.kind === 'noun' ? NOUN_SLOTS : PHRASE_SLOTS)[locale];

/** Every editable text of a catalogue value: a plain string or match forms.
 * @param {unknown} value @returns {{ variant: number | null, form: string | null, text: string }[]} */
export function fields(value) {
  if (typeof value === 'string') return [{ variant: null, form: null, text: value }];
  if (Array.isArray(value)) return value.flatMap((entry, variant) =>
    Object.entries(/** @type {Record<string, string>} */ (entry.match)).map(([form, text]) => ({ variant, form, text })));
  return [];
}

const escape = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = '[\\p{L}\\p{N}_]';

/** Whole-word occurrences of `forms` in `text`, skipping `{placeholder}`
 * spans. Longer forms win where two overlap. Case-insensitive unless `exact`.
 * @param {string} text @param {string[]} forms @param {boolean} [exact] */
export function findForms(text, forms, exact = false) {
  const unique = [...new Set(forms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!unique.length) return [];
  const pattern = new RegExp(`\\{[^}]*\\}|(?<!${LETTER})(?:${unique.map(escape).join('|')})(?!${LETTER})`, exact ? 'gu' : 'giu');
  /** @type {{ index: number, text: string }[]} */
  const found = [];
  for (const match of text.matchAll(pattern)) {
    if (!match[0].startsWith('{')) found.push({ index: match.index, text: match[0] });
  }
  return found;
}

/** Words starting with `stem`, case-insensitively, skipping placeholders.
 * Used for avoided variants, which are given as stems ("kurac" for kuracja).
 * @param {string} text @param {string[]} stems */
export function findStems(text, stems) {
  const unique = [...new Set(stems.filter(Boolean))];
  if (!unique.length) return [];
  const pattern = new RegExp(`\\{[^}]*\\}|(?<!${LETTER})(?:${unique.map(escape).join('|')})${LETTER}*`, 'giu');
  return [...text.matchAll(pattern)].filter((match) => !match[0].startsWith('{')).map((match) => match[0]);
}

/** Give `replacement` the capitalisation of `original`.
 * @param {string} original @param {string} replacement */
export function matchCase(original, replacement) {
  if (original.length > 1 && original === original.toLocaleUpperCase() && original !== original.toLocaleLowerCase()) {
    return replacement.toLocaleUpperCase();
  }
  const first = original[0];
  if (first && first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase()) {
    return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Nouns match any capitalisation and keep it; fixed phrases (labels, module
 * names) match only as written, so "Back" never catches "back up". */
const formKey = (/** @type {string} */ form, /** @type {boolean} */ exact) => exact ? `=${form}` : form.toLocaleLowerCase();

/** Old surface form -> the new forms of every slot it filled. A form shared by
 * slots whose new forms differ (Polish syncretism) maps to several choices.
 * @param {Record<string, string>} before @param {Record<string, string>} after
 * @param {Set<string>} [exact] slots of fixed phrases */
export function renameMap(before, after, exact = new Set()) {
  /** @type {Map<string, Map<string, string[]>>} */
  const map = new Map();
  for (const [slot, old] of Object.entries(before)) {
    const next = after[slot];
    if (!old || !next || old === next) continue;
    const key = formKey(old, exact.has(slot));
    const choices = map.get(key) ?? new Map();
    map.set(key, choices);
    choices.set(next, [...(choices.get(next) ?? []), slot]);
  }
  // A form also filling a slot that keeps it unchanged is ambiguous too.
  for (const [slot, old] of Object.entries(before)) {
    const choices = old && after[slot] === old ? map.get(formKey(old, exact.has(slot))) : undefined;
    if (choices) {
      choices.set(old, [...(choices.get(old) ?? []), slot]);
    }
  }
  return new Map([...map].map(([old, choices]) =>
    [old, [...choices].map(([text, slots]) => ({ text, slots }))]));
}

/** Every occurrence a rename touches in one text, with its choices.
 * @param {string} text @param {ReturnType<typeof renameMap>} map */
export function renameOccurrences(text, map) {
  return findForms(text, [...map.keys()].map((key) => key.replace(/^=/, ''))).flatMap(({ index, text: found }) => {
    const phrase = map.get(`=${found}`);
    const choices = phrase ?? map.get(found.toLocaleLowerCase());
    return choices ? [{ index, text: found,
      choices: choices.map(({ text: next, slots }) => ({ text: phrase ? next : matchCase(found, next), slots })) }] : [];
  });
}

/** Apply chosen replacements (one text per occurrence, in order).
 * @param {string} text @param {{ index: number, text: string }[]} occurrences @param {string[]} chosen */
export function applyRename(text, occurrences, chosen) {
  let result = '';
  let at = 0;
  occurrences.forEach((occurrence, position) => {
    result += text.slice(at, occurrence.index) + chosen[position];
    at = occurrence.index + occurrence.text.length;
  });
  return result + text.slice(at);
}

/** Where a term appears and what looks inconsistent.
 * @param {any} term @param {{ key: string, en: unknown, pl: unknown, change?: string | null }[]} records */
export function termUsage(term, records) {
  const enForms = Object.values(term.en.forms);
  const plForms = Object.values(term.pl.forms);
  /** @type {{ keys: string[], untranslated: string[], avoided: { key: string, words: string[] }[] }} */
  const usage = { keys: [], untranslated: [], avoided: [] };
  for (const record of records) {
    if (record.change === 'removed') continue;
    const en = fields(record.en).map((field) => field.text).join('\n');
    const pl = fields(record.pl).map((field) => field.text).join('\n');
    const inEn = findForms(en, enForms, term.kind === 'phrase').length > 0;
    const inPl = findForms(pl, plForms, term.kind === 'phrase').length > 0;
    if (inEn || inPl) usage.keys.push(record.key);
    if (inEn && !inPl && pl) usage.untranslated.push(record.key);
    const avoided = [...findStems(en, term.en.avoid), ...findStems(pl, term.pl.avoid)];
    if (avoided.length) usage.avoided.push({ key: record.key, words: [...new Set(avoided)] });
  }
  return usage;
}

/** Keys a save marks reviewed on the strings page: every key using a term
 * that is confirmed now and was just confirmed or edited, since a rename
 * changes those strings and so clears their earlier review.
 * @param {{ terms: any[] }} saved @param {{ terms: any[] }} draft
 * @param {{ key: string, en: unknown, pl: unknown, change?: string | null }[]} records */
export function keysToReview(saved, draft, records) {
  const keys = new Set();
  for (const term of draft.terms) {
    const before = saved.terms.find((old) => old.id === term.id);
    if (!term.confirmed || (before?.confirmed && JSON.stringify(before) === JSON.stringify(term))) continue;
    for (const key of termUsage(term, records).keys) keys.add(key);
  }
  return records.filter((record) => keys.has(record.key) && record.change !== 'removed')
    .map(({ key, en, pl }) => ({ key, en, pl }));
}

/** Catalogue words sharing a stem with any filled form, for filling the grid.
 * @param {string[]} forms @param {string[]} texts */
export function suggestForms(forms, texts) {
  const stems = [...new Set(forms.filter(Boolean).map((form) => {
    const word = form.toLocaleLowerCase().split(/\s+/)[0];
    return word.slice(0, Math.max(3, word.length - 2));
  }))];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const text of texts) {
    for (const word of findStems(text, stems)) {
      const lower = word.toLocaleLowerCase();
      counts.set(lower, (counts.get(lower) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word, count]) => ({ word, count }));
}

/** Shape check for one lexicon file; returns the first problem or null.
 * @param {any} lexicon */
export function lexiconProblem(lexicon) {
  if (!lexicon || typeof lexicon !== 'object' || !Array.isArray(lexicon.terms)) return 'Lexicon needs a terms list.';
  const ids = new Set();
  for (const term of lexicon.terms) {
    if (!term || typeof term.id !== 'string' || !/^[a-z0-9-]+$/.test(term.id)) return 'Each term needs a kebab-case id.';
    if (ids.has(term.id)) return `Duplicate term ${term.id}.`;
    ids.add(term.id);
    if (term.kind !== 'noun' && term.kind !== 'phrase') return `${term.id}: kind is noun or phrase.`;
    if (typeof term.confirmed !== 'boolean' || typeof term.note !== 'string') return `${term.id}: needs confirmed and note.`;
    for (const locale of /** @type {const} */ (['en', 'pl'])) {
      const side = term[locale];
      if (!side || typeof side.forms !== 'object' || !Array.isArray(side.avoid) ||
          side.avoid.some((/** @type {unknown} */ stem) => typeof stem !== 'string')) return `${term.id}: ${locale} needs forms and avoid.`;
      const slots = slotsOf(term, locale);
      if (Object.keys(side.forms).some((slot) => !slots.includes(slot)) ||
          slots.some((slot) => typeof side.forms[slot] !== 'string')) return `${term.id}: ${locale} forms must be ${slots.join(', ')}.`;
    }
  }
  return null;
}
