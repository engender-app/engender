import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));
vi.mock('./vocabulary/vocabulary', () => ({ vocabulary: { activeDimensions: [], activeMetric: 'mood' } }));

const { nameInSentence } = await import('./metricChoices');
const { lookback_facts_average } = await import('../paraglide/messages.js');

describe('nameInSentence', () => {
  it('lowers the first letter of a scale name set inside a sentence', () => {
    expect(nameInSentence('Mood')).toBe('mood');
    expect(nameInSentence('Dysphoria ↔ euphoria')).toBe('dysphoria ↔ euphoria');
    expect(nameInSentence('Łaknienie')).toBe('łaknienie');
  });

  it('keeps a name that opens with an abbreviation, and leaves lower-case and empty names alone', () => {
    expect(nameInSentence('HRT energy')).toBe('HRT energy');
    expect(nameInSentence('energy')).toBe('energy');
    expect(nameInSentence('')).toBe('');
  });
});

describe('the Look back average label', () => {
  it('reads "Average mood" in English and still leads with the name in Polish', () => {
    expect(lookback_facts_average({ name: 'Mood', nameInSentence: nameInSentence('Mood') }, { locale: 'en' })).toBe('Average mood');
    expect(lookback_facts_average({ name: 'Nastrój', nameInSentence: nameInSentence('Nastrój') }, { locale: 'pl' })).toBe('Nastrój: średnia');
  });
});
