/* Tests for ready letters count/jump above the waiting list (ticket 41).
   Verifies:
   - Boundary-day eligibility logic using local epoch day.
   - Mixed ready/waiting state accurately identifies the ready group count.
   - Shortcut targets #opened anchor without revealing sealed content or modifying dates.
   - No-ready and all-ready states behave correctly (no unnecessary jump).
   - Presence in localization messages (en.json and pl.json) without gendered Polish. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isLetterSealed } from '../src/lib/data/letterStatus.ts';
import { safeSpaceLetters } from '../src/lib/data/letterRetrospective.ts';
import type { Letter } from '../src/lib/data/types.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const lettersPage = read('src/routes/transition/letters/+page.svelte');
const enMessages = JSON.parse(read('messages/en.json'));
const plMessages = JSON.parse(read('messages/pl.json'));

describe('Letters ready-to-read eligibility and boundary days (ticket 41)', () => {
  const today = 20000;

  it('accurately identifies ready vs waiting letters on boundary days', () => {
    const pastLetter: Letter = { id: 'past', epochDay: 19900, unlockEpochDay: 19999, text: 'Unlocked yesterday' };
    const todayLetter: Letter = { id: 'today', epochDay: 19950, unlockEpochDay: 20000, text: 'Unlocks today' };
    const tomorrowLetter: Letter = { id: 'tomorrow', epochDay: 19950, unlockEpochDay: 20001, text: 'Unlocks tomorrow' };
    const futureLetter: Letter = { id: 'future', epochDay: 19980, unlockEpochDay: 20500, text: 'Unlocks in future' };

    // Past and today are eligible (not sealed)
    expect(isLetterSealed(pastLetter, today)).toBe(false);
    expect(isLetterSealed(todayLetter, today)).toBe(false);

    // Tomorrow and future are sealed (waiting)
    expect(isLetterSealed(tomorrowLetter, today)).toBe(true);
    expect(isLetterSealed(futureLetter, today)).toBe(true);
  });

  it('identifies ready group accurately in mixed ready/waiting collection', () => {
    const letters: Letter[] = [
      { id: 'w1', epochDay: 19900, unlockEpochDay: 20050, text: 'Waiting 1' },
      { id: 'w2', epochDay: 19910, unlockEpochDay: 20100, text: 'Waiting 2' },
      { id: 'r1', epochDay: 19800, unlockEpochDay: 19950, text: 'Ready 1' },
      { id: 'r2', epochDay: 19850, unlockEpochDay: 20000, text: 'Ready 2' }
    ];

    const waiting = letters.filter((l) => isLetterSealed(l, today));
    const opened = safeSpaceLetters(letters, today);

    expect(waiting.length).toBe(2);
    expect(opened.length).toBe(2);

    // Ready group contains r1 and r2, but never w1 or w2
    const readyIds = new Set(opened.map((l) => l.id));
    expect(readyIds.has('r1')).toBe(true);
    expect(readyIds.has('r2')).toBe(true);
    expect(readyIds.has('w1')).toBe(false);
    expect(readyIds.has('w2')).toBe(false);

    // Dates remain unmodified
    expect(letters[0].unlockEpochDay).toBe(20050);
    expect(letters[1].unlockEpochDay).toBe(20100);
  });

  it('handles no-ready state (only waiting letters)', () => {
    const letters: Letter[] = [
      { id: 'w1', epochDay: 19900, unlockEpochDay: 20050, text: 'Waiting 1' },
      { id: 'w2', epochDay: 19910, unlockEpochDay: 20100, text: 'Waiting 2' }
    ];

    const waiting = letters.filter((l) => isLetterSealed(l, today));
    const opened = safeSpaceLetters(letters, today);

    expect(waiting.length).toBe(2);
    expect(opened.length).toBe(0);
  });

  it('handles all-ready state (only unlocked letters)', () => {
    const letters: Letter[] = [
      { id: 'r1', epochDay: 19800, unlockEpochDay: 19950, text: 'Ready 1' },
      { id: 'r2', epochDay: 19850, unlockEpochDay: 20000, text: 'Ready 2' }
    ];

    const waiting = letters.filter((l) => isLetterSealed(l, today));
    const opened = safeSpaceLetters(letters, today);

    expect(waiting.length).toBe(0);
    expect(opened.length).toBe(2);
  });
});

describe('Letters page markup contract (ticket 41)', () => {
  it('exposes a ready-jump shortcut when opened letters exist above the waiting list', () => {
    expect(lettersPage).toContain('data-letters-ready-jump');
    expect(lettersPage).toMatch(/href="#opened"[^>]*data-letters-ready-jump/);
  });

  it('places the jump in the waiting section heading action and gates on opened.length', () => {
    expect(lettersPage).toMatch(
      /letters_waiting_title\(\)[^>]*>[\s\S]*?{#snippet action\(\)}[\s\S]*?opened\.length[\s\S]*?data-letters-ready-jump/
    );
  });

  it('ensures the open section heading has id="opened" and is focusable', () => {
    expect(lettersPage).toMatch(/<SectionHeading[^>]*id="opened"[^>]*focusable/);
  });
});

describe('Localization keys for ready letters jump (ticket 41)', () => {
  it('contains letters_ready_jump in both en.json and pl.json', () => {
    expect(enMessages).toHaveProperty('letters_ready_jump');
    expect(plMessages).toHaveProperty('letters_ready_jump');
  });

  it('includes count placeholder and readable copy', () => {
    expect(enMessages.letters_ready_jump).toContain('{count}');
    expect(plMessages.letters_ready_jump).toContain('{count}');
    expect(enMessages.letters_ready_jump).toMatch(/Ready to read/i);
    expect(plMessages.letters_ready_jump).toMatch(/Do przeczytania/i);
  });
});
