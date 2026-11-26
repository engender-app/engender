/* The debrief offer predicate (phase 6 ticket 08, rekeyed to an appointment
   id by ticket 58). */

import { test, expect } from 'vitest';
import { debriefOfferVisible } from './debriefOffer.ts';
import type { DebriefOfferState } from './debriefOffer.ts';

/* A ready-to-offer state, mutated one field at a time per test, is the
   shape a registry test needs to actually be able to fail. `dismissed` and
   `debriefEntryId` arrive here already resolved against `appointmentId`
   (checklists.ts's `getDebriefState` does the id comparison), so this
   predicate has nothing left to compare - which is itself the case ticket
   58 wanted: a dismissal or entry belonging to a since-superseded
   appointment never reaches here as anything but "not dismissed"/"no
   entry", so there is no separate test for it at this level. */
const ready = (overrides: Partial<DebriefOfferState> = {}): DebriefOfferState => ({
  appointmentId: 'appt-1',
  itemCount: 1,
  dismissed: false,
  debriefEntryId: null,
  ...overrides
});

test('offers the debrief once there is a most recent past appointment and something to prepare for', () => {
  expect(debriefOfferVisible(ready())).toBe(true);
});

test('no most recent past appointment makes no offer', () => {
  expect(debriefOfferVisible(ready({ appointmentId: null }))).toBe(false);
});

test('an appointment with no prep item produces no offer', () => {
  expect(debriefOfferVisible(ready({ itemCount: 0 }))).toBe(false);
});

test('dismissing this appointment stops the offer for good', () => {
  expect(debriefOfferVisible(ready({ dismissed: true }))).toBe(false);
});

test('an entry already recorded as the debrief stops the offer for good', () => {
  expect(debriefOfferVisible(ready({ debriefEntryId: 7 }))).toBe(false);
});
