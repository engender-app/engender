import assert from 'node:assert/strict';
import { test } from 'vitest';
import { HAIR_PHOTO_INTERVAL_DAYS, isHairPhotoDue, nextHairPhotoDueEpochDay } from './hairPhotoSchedule.ts';

test('null with no anchor yet, regardless of any photo taken', () => {
  assert.equal(nextHairPhotoDueEpochDay(null, null), null);
  assert.equal(nextHairPhotoDueEpochDay(null, 500), null);
});

test('the first photo is due on the anchor day itself - a baseline shot', () => {
  assert.equal(nextHairPhotoDueEpochDay(100, null), 100);
});

test('later photos step from the last one actually taken, not from the anchor', () => {
  assert.equal(nextHairPhotoDueEpochDay(100, 150), 150 + HAIR_PHOTO_INTERVAL_DAYS);
});

test('isHairPhotoDue is false with no anchor, and follows the due day once anchored', () => {
  assert.equal(isHairPhotoDue(null, null, 500), false);

  const due = nextHairPhotoDueEpochDay(100, 150)!;
  assert.equal(isHairPhotoDue(100, 150, due - 1), false);
  assert.equal(isHairPhotoDue(100, 150, due), true);
  assert.equal(isHairPhotoDue(100, 150, due + 10), true);
});
