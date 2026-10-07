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
