import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSnooze,
  DEFAULT_SNOOZE_DURATION_MS,
  isTileSnoozed,
  snoozeTile
} from './liveTilesSnooze.ts';
import { NO_ACKNOWLEDGEMENTS, type Acknowledgements, type AcknowledgementStore } from './acknowledgements.ts';

function memoryStore(): AcknowledgementStore {
  let value: Acknowledgements = NO_ACKNOWLEDGEMENTS;
  return { read: () => value, write: (next) => { value = next; } };
}

describe('liveTilesSnooze', () => {
  let storage: AcknowledgementStore;
  const now = 1_700_000_000_000;

  beforeEach(() => {
    storage = memoryStore();
  });

  it('reports unsnoozed when nothing is stored', () => {
    expect(isTileSnoozed('surgery-countdown', storage, now)).toBe(false);
  });

  it('snoozes tile for default 24h interval', () => {
    snoozeTile('surgery-countdown', storage, undefined, now);
    expect(isTileSnoozed('surgery-countdown', storage, now)).toBe(true);
    expect(isTileSnoozed('surgery-countdown', storage, now + DEFAULT_SNOOZE_DURATION_MS - 1)).toBe(true);
    expect(isTileSnoozed('surgery-countdown', storage, now + DEFAULT_SNOOZE_DURATION_MS + 1)).toBe(false);
  });

  it('snoozes tile for custom duration', () => {
    const duration = 1000 * 60 * 60 * 48; // 48 hours
    snoozeTile('safe-space-nudge', storage, duration, now);
    expect(isTileSnoozed('safe-space-nudge', storage, now + 1000 * 60 * 60 * 24)).toBe(true);
    expect(isTileSnoozed('safe-space-nudge', storage, now + duration + 1)).toBe(false);
  });

  it('clears snooze explicitly', () => {
    snoozeTile('surgery-countdown', storage, DEFAULT_SNOOZE_DURATION_MS, now);
    expect(isTileSnoozed('surgery-countdown', storage, now)).toBe(true);

    clearSnooze('surgery-countdown', storage);
    expect(isTileSnoozed('surgery-countdown', storage, now)).toBe(false);
  });

  it('keeps a snooze apart for each tile', () => {
    snoozeTile('surgery-countdown', storage, undefined, now);
    expect(isTileSnoozed('safe-space-nudge', storage, now)).toBe(false);
  });
});
