/* Entry templates fold two overlapping concepts into one (phase 6 ticket
   07): the reconcile-by-key rule and the pure apply-to-draft merge. Prior
   art for the reconcile shape is `withBuiltInDimensions` in
   builtins.test.ts. A registry test must be able to fail: these run the
   real rule over a shortened built-in list rather than filtering an entry
   out and asserting it absent, which would only restate `filter`. */

import { test, expect } from 'vitest';
import {
  withBuiltInEntryTemplates,
  applyEntryTemplateToDraft,
  debriefOfferVisible,
  resolveBuiltInWording
} from './entryTemplates.ts';
import type { DebriefOfferState } from './entryTemplates.ts';
import type { EntryTemplate } from '../types.ts';

const builtIn = (id: string, overrides: Partial<EntryTemplate> = {}): EntryTemplate => ({
  id,
  name: '',
  tags: [],
  dims: {},
  noteScaffold: '',
  presentationId: null,
  builtIn: true,
  hidden: false,
  ...overrides
});

const custom = (id: string, overrides: Partial<EntryTemplate> = {}): EntryTemplate => ({
  ...builtIn(id, overrides),
  builtIn: false
});

test('seeding from empty adds every built-in, with no display text - names are resolved by key', () => {
  const seeded = withBuiltInEntryTemplates([]);

  expect(seeded.length).toBeGreaterThan(0);
  expect(
    seeded.every((t) => t.builtIn && t.name === '' && t.noteScaffold === '' && t.presentationId === null)
  ).toBe(true);
});

test('the appointment debrief is the one built-in that seeds hidden (phase 6 ticket 08)', () => {
  const seeded = withBuiltInEntryTemplates([]);

  const hidden = seeded.filter((t) => t.hidden);
  expect(hidden.map((t) => t.id)).toEqual(['appointment_debrief']);
});

test('seeding twice changes nothing', () => {
  const once = withBuiltInEntryTemplates([]);

  expect(withBuiltInEntryTemplates(once)).toEqual(once);
});

test('a built-in missing from the store is restored without touching an edited one', () => {
  const seeded = withBuiltInEntryTemplates([]);
  const edited = { ...seeded[0], name: 'My own name', hidden: true };
  const missingOne = seeded.slice(1);

  const reconciled = withBuiltInEntryTemplates([edited, ...missingOne]);

  expect(reconciled.find((t) => t.id === edited.id)).toEqual(edited);
  expect(reconciled.find((t) => t.id === seeded[0].id)!.name).toBe('My own name');
  // The rule can fail: dropping the edited row from the fixture set and
  // reconciling an empty store must produce the built-in, unedited.
  expect(withBuiltInEntryTemplates([])[0]).not.toEqual(edited);
});

test('a built-in still seeded blank shows the resolved label (ticket 25)', () => {
  const resolved = resolveBuiltInWording(
    { name: '', noteScaffold: '' },
    { name: 'Euphoria day', noteScaffold: 'How did it feel?' }
  );

  expect(resolved).toEqual({ name: 'Euphoria day', noteScaffold: 'How did it feel?' });
});

test('a built-in the person renamed keeps their words, not the label (ticket 25)', () => {
  const resolved = resolveBuiltInWording(
    { name: 'My own name', noteScaffold: 'My own scaffold' },
    { name: 'Euphoria day', noteScaffold: 'How did it feel?' }
  );

  expect(resolved).toEqual({ name: 'My own name', noteScaffold: 'My own scaffold' });
});

test('name and note scaffold fall back independently (ticket 25)', () => {
  const resolved = resolveBuiltInWording(
    { name: 'My own name', noteScaffold: '' },
    { name: 'Euphoria day', noteScaffold: 'How did it feel?' }
  );

  expect(resolved).toEqual({ name: 'My own name', noteScaffold: 'How did it feel?' });
});

test('a custom template survives seeding and is never duplicated', () => {
  const mine = custom('my-uuid-1', { name: 'After a hard call' });

  const seeded = withBuiltInEntryTemplates([mine]);

  expect(seeded.filter((t) => t.id === 'my-uuid-1')).toEqual([mine]);
});

test('applying a template merges tags into the draft rather than replacing it', () => {
  const draft = { tags: ['existing'], dims: {}, note: '', presentationId: null as string | null };
  const template = builtIn('t1', { tags: ['g-euphoria', 'existing'], dims: { euphoria_dysphoria: 85 } });

  const merged = applyEntryTemplateToDraft(draft, template);

  expect(merged.tags).toEqual(['existing', 'g-euphoria']);
  expect(merged.dims).toEqual({ euphoria_dysphoria: 85 });
});

test('applying a template twice cannot flip a tag back off', () => {
  const draft = { tags: [] as string[], dims: {}, note: '', presentationId: null as string | null };
  const template = builtIn('t1', { tags: ['g-euphoria'] });

  const once = applyEntryTemplateToDraft(draft, template);
  const twice = applyEntryTemplateToDraft(once, template);

  expect(twice.tags).toEqual(['g-euphoria']);
});

test('a note scaffold seeds an empty note but never overwrites what is already written', () => {
  const template = builtIn('t1', { noteScaffold: 'What felt euphoric today?' });

  const blank = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: null }, template);
  const written = applyEntryTemplateToDraft(
    { tags: [], dims: {}, note: 'already writing', presentationId: null },
    template
  );

  expect(blank.note).toBe('What felt euphoric today?');
  expect(written.note).toBe('already writing');
});

test('a template with no presentation applies without one, and that is not an error', () => {
  const template = builtIn('t1');

  const merged = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: null }, template);

  expect(merged.presentationId).toBeNull();
});

test('a template with no presentation leaves whatever the draft already had, rather than clearing it', () => {
  const template = builtIn('t1');

  const merged = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: 'p1' }, template);

  expect(merged.presentationId).toBe('p1');
});

test('a template carrying a presentation replaces the draft\'s', () => {
  const template = custom('mine', { presentationId: 'p2' });

  const merged = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: null }, template);

  expect(merged.presentationId).toBe('p2');
});

/* The debrief offer predicate (phase 6 ticket 08). A ready-to-offer state,
   mutated one field at a time per test, is the shape a registry test needs
   to actually be able to fail - the same discipline the reconcile tests
   above follow. */
const ready = (overrides: Partial<DebriefOfferState> = {}): DebriefOfferState => ({
  appointmentEpochDay: 100,
  itemCount: 1,
  todayEpochDay: 105,
  dismissedEpochDay: null,
  debriefEntryId: null,
  ...overrides
});

test('offers the debrief once a date is on record, has passed, and there was something to prepare for', () => {
  expect(debriefOfferVisible(ready())).toBe(true);
});

test('no appointment date on record makes no offer', () => {
  expect(debriefOfferVisible(ready({ appointmentEpochDay: null }))).toBe(false);
});

test('an appointment with no prep item produces no offer', () => {
  expect(debriefOfferVisible(ready({ itemCount: 0 }))).toBe(false);
});

test('an appointment later today, or still ahead, produces no offer', () => {
  expect(debriefOfferVisible(ready({ appointmentEpochDay: 105, todayEpochDay: 105 }))).toBe(false);
  expect(debriefOfferVisible(ready({ appointmentEpochDay: 110, todayEpochDay: 105 }))).toBe(false);
});

test('dismissing this appointment stops the offer for good', () => {
  expect(debriefOfferVisible(ready({ dismissedEpochDay: 100 }))).toBe(false);
});

test('a dismissal recorded for a since-superseded appointment does not suppress the current one', () => {
  expect(debriefOfferVisible(ready({ dismissedEpochDay: 40 }))).toBe(true);
});

test('an entry already recorded as the debrief stops the offer for good', () => {
  expect(debriefOfferVisible(ready({ debriefEntryId: 7 }))).toBe(false);
});
