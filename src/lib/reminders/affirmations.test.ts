import { describe, expect, test, vi } from 'vitest';
import en from '../../../messages/en.json';
import pl from '../../../messages/pl.json';
import { affirmationLines } from './affirmations';

/* The node tier has no $lib alias for paraglide's generated output, so the
   messages module is mocked (the convention across this tier). Each message
   function returns its own key, which lets the pool test below prove the
   pool lists every catalogue line exactly once - a real translation would
   hide a doubled entry only until two lines happened to differ. */
vi.mock('$lib/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) })
}));

function affirmationEntries(catalogue: Record<string, unknown>): [string, string][] {
  return Object.entries(catalogue).filter(
    (entry): entry is [string, string] => /^affirmation_\d+$/.test(entry[0]) && typeof entry[1] === 'string'
  );
}

describe('affirmation catalogues', () => {
  test.each([
    ['en', en],
    ['pl', pl]
  ])('%s has no blank and no repeated lines', (_language, catalogue) => {
    const entries = affirmationEntries(catalogue);
    const lines = entries.map(([, line]) => line);

    expect(entries.length).toBeGreaterThan(0);
    expect(lines.filter((line) => line.trim() === '')).toEqual([]);
    expect(new Set(lines).size).toBe(lines.length);
  });

  test('both languages hold sets of the same size', () => {
    expect(affirmationEntries(pl).length).toBe(affirmationEntries(en).length);
  });

  /* The sets are authored independently per language (phase 4 features
     ticket 22) - identical strings would mean one language never got its
     own text. */
  test('the Polish set shares no line with the English set', () => {
    const english = new Set(affirmationEntries(en).map(([, line]) => line));
    const shared = affirmationEntries(pl).filter(([, line]) => english.has(line));

    expect(shared).toEqual([]);
  });
});

describe('affirmationLines', () => {
  test('the pool lists every catalogue line exactly once', () => {
    expect(affirmationLines().sort()).toEqual(
      affirmationEntries(en)
        .map(([key]) => key)
        .sort()
    );
  });
});
