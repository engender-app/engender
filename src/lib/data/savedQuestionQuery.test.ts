import { describe, expect, it } from 'vitest';

import { entrySearchFiltersOf, savedQuestionInputOf } from './savedQuestionQuery';
import type { SavedQuestion } from './types';

const SAVED: SavedQuestion = {
  id: 'q1',
  name: 'Therapy check-ins',
  queryText: 'therapy',
  tagIds: ['t1', 't2'],
  moods: [4, 5],
  startEpochDay: 100,
  endEpochDay: 200,
  hasNote: true,
  hasPhoto: false
};

describe('turning a saved question into the same filters the screen builds', () => {
  it('carries every filter field straight through', () => {
    expect(entrySearchFiltersOf(SAVED)).toEqual({
      tagIds: ['t1', 't2'],
      moods: [4, 5],
      startEpochDay: 100,
      endEpochDay: 200,
      hasNote: true,
      hasPhoto: false
    });
  });

  it('keeps an unset range and unset toggles as the screen would have left them', () => {
    const bare: SavedQuestion = { ...SAVED, startEpochDay: null, endEpochDay: null, hasNote: false, hasPhoto: false };
    expect(entrySearchFiltersOf(bare)).toEqual({
      tagIds: ['t1', 't2'],
      moods: [4, 5],
      startEpochDay: null,
      endEpochDay: null,
      hasNote: false,
      hasPhoto: false
    });
  });
});

describe('turning the screen state into what a saved question stores', () => {
  it('takes the typed name and query, and every filter the screen had on', () => {
    const input = savedQuestionInputOf('Therapy check-ins', 'therapy', {
      tagIds: ['t1', 't2'],
      moods: [4, 5],
      startEpochDay: 100,
      endEpochDay: 200,
      hasNote: true,
      hasPhoto: false
    });
    expect(input).toEqual({
      name: 'Therapy check-ins',
      queryText: 'therapy',
      tagIds: ['t1', 't2'],
      moods: [4, 5],
      startEpochDay: 100,
      endEpochDay: 200,
      hasNote: true,
      hasPhoto: false
    });
  });

  it('defaults every filter a bare query never set, rather than storing undefined', () => {
    const input = savedQuestionInputOf('Everything', 'euphoria', {});
    expect(input).toEqual({
      name: 'Everything',
      queryText: 'euphoria',
      tagIds: [],
      moods: [],
      startEpochDay: null,
      endEpochDay: null,
      hasNote: false,
      hasPhoto: false
    });
  });

  it('round-trips through entrySearchFiltersOf back to the filters that made it', () => {
    const filters = {
      tagIds: ['t3'],
      moods: [1],
      startEpochDay: 50,
      endEpochDay: null,
      hasNote: false,
      hasPhoto: true
    };
    const input = savedQuestionInputOf('Bad days', 'bad', filters);
    expect(entrySearchFiltersOf(input)).toEqual(filters);
  });
});
