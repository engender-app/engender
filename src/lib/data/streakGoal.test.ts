import { test } from 'vitest';
import assert from 'node:assert/strict';
import { goalProgress, reachedAchievements, GOAL_ACHIEVEMENT_DAYS, GOAL_TARGET_PRESETS } from './streakGoal';

test('progress is the live streak against the target, capped at met', () => {
  assert.deepEqual(goalProgress(4, 7), { targetDays: 7, currentStreak: 4, fraction: 4 / 7, met: false });
  assert.deepEqual(goalProgress(7, 7), { targetDays: 7, currentStreak: 7, fraction: 1, met: true });
  // A streak longer than the target is still "met", not "over 100%".
  assert.deepEqual(goalProgress(12, 7), { targetDays: 7, currentStreak: 12, fraction: 1, met: true });
});

test('a streak of zero is zero progress towards any target, not an error', () => {
  assert.deepEqual(goalProgress(0, 7), { targetDays: 7, currentStreak: 0, fraction: 0, met: false });
});

test('reached achievements are every ladder rung the best streak ever clears', () => {
  assert.deepEqual(reachedAchievements(0), []);
  assert.deepEqual(reachedAchievements(10), [3, 7]);
  assert.deepEqual(reachedAchievements(GOAL_ACHIEVEMENT_DAYS[GOAL_ACHIEVEMENT_DAYS.length - 1]), [...GOAL_ACHIEVEMENT_DAYS]);
});

test('every target on offer is also a rung on the achievement ladder', () => {
  for (const days of GOAL_TARGET_PRESETS) assert.ok(GOAL_ACHIEVEMENT_DAYS.includes(days), `${days} is an achievement rung too`);
});
