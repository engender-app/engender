import { describe, expect, it } from 'vitest';

import { FEATURE_MODULE_ROWS, featureAreas, rowHidden } from '../data/hubRows';
import { DEFAULT_MODULES, firstRunModuleWrites } from './features';

const hidden = { hidden: true, finishedEpochDay: null, suspendedEpochDay: null };

describe('feature modules', () => {
  it('uses hub rows with real hideable areas and includes Care', () => {
    expect(FEATURE_MODULE_ROWS).toHaveLength(15);
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).toContain('care');
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).toContain('surgery');
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).not.toContain('dilation');
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).not.toContain('cycle-events');
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).not.toContain('resources');
    expect(FEATURE_MODULE_ROWS.map((row) => row.key)).not.toContain('photos');
    expect(featureAreas(FEATURE_MODULE_ROWS.find((row) => row.key === 'care')!)).toContain('regimenEpisodes');
    expect(new Set(FEATURE_MODULE_ROWS.flatMap(featureAreas)).size).toBe(FEATURE_MODULE_ROWS.flatMap(featureAreas).length);
  });

  it('hides Care when its owned areas are hidden', () => {
    const care = FEATURE_MODULE_ROWS.find((row) => row.key === 'care')!;
    const states = Object.fromEntries(featureAreas(care).map((area) => [area, hidden]));
    expect(rowHidden(care, states)).toBe(true);
  });

  it('starts a new journal with the core modules on and specialist ones off, and keeps explicit opt-ins', () => {
    const defaults = firstRunModuleWrites(false, false, null);
    expect(defaults).toHaveLength(FEATURE_MODULE_ROWS.length);
    expect(defaults.filter(({ hidden }) => !hidden).map(({ row }) => row.key).sort())
      .toEqual(['appointments', 'care', 'effects', 'milestones', 'voice-benchmark']);
    expect([...DEFAULT_MODULES].sort()).toEqual(['appointments', 'care', 'effects', 'milestones', 'voice-benchmark']);
    const selected = firstRunModuleWrites(false, false, ['care', 'voice-benchmark']);
    expect(selected.find(({ row }) => row.key === 'care')?.hidden).toBe(false);
    expect(selected.find(({ row }) => row.key === 'voice-benchmark')?.hidden).toBe(false);
    expect(selected.find(({ row }) => row.key === 'milestones')?.hidden).toBe(true);

    const surgery = firstRunModuleWrites(false, false, ['surgery']);
    expect(surgery.find(({ row }) => row.key === 'surgery')?.hidden).toBe(false);
    expect(surgery.flatMap(({ row }) => featureAreas(row))).not.toContain('taperSessions');
  });

  it('leaves restored and existing journals untouched', () => {
    expect(firstRunModuleWrites(true, false, null)).toEqual([]);
    expect(firstRunModuleWrites(false, true, null)).toEqual([]);
  });
});
