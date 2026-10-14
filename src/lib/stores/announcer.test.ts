import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCE_GAP_MS, createAnnouncer } from './announcer';

describe('the one place the app speaks from', () => {
  let regions: { polite: string; assertive: string };
  let say: ReturnType<typeof createAnnouncer>;

  beforeEach(() => {
    vi.useFakeTimers();
    regions = { polite: '', assertive: '' };
    say = createAnnouncer((region, text) => (regions[region] = text));
  });
  afterEach(() => vi.useRealTimers());

  it('empties the region first and writes the words a moment later', () => {
    say('Saved.');
    expect(regions.polite).toBe('');
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(regions.polite).toBe('Saved.');
  });

  it('says the same sentence twice when it happens twice', () => {
    const written: string[] = [];
    say = createAnnouncer((_region, text) => written.push(text));
    say('Saved.');
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    say('Saved.');
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(written).toEqual(['', 'Saved.', '', 'Saved.']);
  });

  it('puts a failure in the urgent region and leaves the polite one alone', () => {
    say('Could not save.', true);
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(regions).toEqual({ polite: '', assertive: 'Could not save.' });
  });

  it('says only the latest of two sentences that arrive together', () => {
    say('Copying photos');
    say('Writing your journal');
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(regions.polite).toBe('Writing your journal');
  });
});

it('clears both regions and cancels their delayed writes before later feedback', () => {
  vi.useFakeTimers();
  try {
    const written: { region: string; text: string }[] = [];
    const regions = { polite: '', assertive: '' };
    const say = createAnnouncer((region, text) => {
      regions[region] = text;
      written.push({ region, text });
    });
    say('Estrofem');
    say('Milestone name', true);
    say.clear();
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS * 2);
    expect(regions).toEqual({ polite: '', assertive: '' });
    expect(written.some(({ text }) => text === 'Estrofem' || text === 'Milestone name')).toBe(false);
    say('Could not unlock.', true);
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    say('Saved.');
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(regions).toEqual({ polite: 'Saved.', assertive: 'Could not unlock.' });
    expect(written.filter(({ text }) => text === 'Saved.')).toHaveLength(1);
    expect(written.filter(({ text }) => text === 'Could not unlock.')).toHaveLength(1);
    say.clear();
    expect(regions).toEqual({ polite: '', assertive: '' });
  } finally {
    vi.useRealTimers();
  }
});
