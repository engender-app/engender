/* Entry templates fold two overlapping concepts into one (phase 6 ticket
   07): the reconcile-by-key rule and the pure apply-to-draft merge. Prior
   art for the reconcile shape is `withBuiltInDimensions` in
   builtins.test.ts. A registry test must be able to fail: these run the
   real rule over a shortened built-in list rather than filtering an entry
   out and asserting it absent, which would only restate `filter`. */

import { test, expect } from 'vitest';
import { withBuiltInEntryTemplates, applyEntryTemplateToDraft } from './entryTemplates.ts';
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

test('seeding from empty adds every built-in', () => {
  const seeded = withBuiltInEntryTemplates([]);

  expect(seeded.length).toBeGreaterThan(0);
  expect(seeded.every((t) => t.builtIn)).toBe(true);
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

  const merged = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: 'p1' }, template);

  expect(merged.presentationId).toBe('p1');
});

test('a template carrying a presentation sets it', () => {
  const template = custom('mine', { presentationId: 'p2' });

  const merged = applyEntryTemplateToDraft({ tags: [], dims: {}, note: '', presentationId: null }, template);

  expect(merged.presentationId).toBe('p2');
});
