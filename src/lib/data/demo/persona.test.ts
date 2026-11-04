/* The demo persona writes in the app's language (pre-publish ticket 03).
   The pl-PL store screenshots and the Polish landing guide are taken from
   this journal, so English entries there read as an untranslated app. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { persona } from './persona';

const TODAY = 20_730;

/** Every free-text field the persona writes, in a fixed walk order. */
function texts(source: ReturnType<typeof persona>): string[] {
  const fields: (string | null | undefined)[] = [
    source.customTag.label,
    ...source.presentations.map((p) => p.name),
    ...source.entries.flatMap((e) => [e.note, e.presentationName ?? '']),
    ...source.milestones.flatMap((m) => [m.name, m.description ?? '']),
    ...source.eras.map((e) => e.name),
    ...source.reminders.map((r) => r.title),
    ...source.providers.flatMap((p) => [p.name, p.impressions ?? '']),
    ...source.appointments.flatMap((a) => [a.kind ?? '', a.note ?? '', a.debrief?.note ?? '']),
    ...source.waiting.flatMap((w) => [w.appointment.kind ?? '', w.appointment.note ?? '', ...w.updates.map((u) => u.status)]),
    ...source.labResults.map((l) => l.note)
  ];
  return fields.map((text) => text ?? '');
}

/** The persona with its free text blanked, so two languages compare on
    everything else: days, moods, tags, counts, the seeded draws. */
function shape(source: ReturnType<typeof persona>): unknown {
  const blank = JSON.parse(JSON.stringify(source));
  blank.customTag.label = '';
  for (const p of blank.presentations) p.name = '';
  for (const e of blank.entries) { e.note = ''; if (e.presentationName) e.presentationName = ''; }
  for (const m of blank.milestones) { m.name = ''; if (m.description) m.description = ''; }
  for (const e of blank.eras) e.name = '';
  for (const r of blank.reminders) r.title = '';
  for (const p of blank.providers) { p.name = ''; p.impressions = ''; }
  for (const a of blank.appointments) { a.kind = ''; a.note = ''; a.providerName = ''; if (a.debrief) a.debrief.note = ''; }
  for (const w of blank.waiting) { w.appointment.kind = ''; w.appointment.note = ''; for (const u of w.updates) u.status = ''; }
  for (const l of blank.labResults) l.note = '';
  return blank;
}

test('the Polish persona writes no English sentence', () => {
  const en = new Set(texts(persona(TODAY, 'en')).filter((text) => /[a-z]{4}/i.test(text)));
  const leaked = texts(persona(TODAY, 'pl')).filter((text) => en.has(text));
  assert.deepEqual(leaked, []);
});

test('the Polish persona is the same journal in other words', () => {
  assert.deepEqual(shape(persona(TODAY, 'pl')), shape(persona(TODAY, 'en')));
});

test('English stays the default', () => {
  assert.deepEqual(persona(TODAY), persona(TODAY, 'en'));
});
