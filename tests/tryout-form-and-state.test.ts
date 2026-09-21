/* The contracts phase 11 pre-production UI/UX ticket 43 put in place, in
   the tier that runs on every change. What a person actually hears and
   sees is proved in a browser by tests/tryout-form-check.mjs; these are
   the constructs that check cannot be run without, and each one is
   something that fails silently when it goes.

   Greps, for tests/accessibility-audit.ts's reason: a label association
   and a described-by are either written in a file or not, and a screen
   reader says nothing where one is missing. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const field = read('src/lib/components/kit/Field.svelte');
const datePicker = read('src/lib/components/DatePicker.svelte');
const tryoutForm = read('src/routes/transition/tryouts/[id]/+page.svelte');
const card = read('src/lib/components/TryoutCard.svelte');
const components = read('src/lib/styles/components.css');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('a field names one thing and explains it separately', () => {
  it('renders the help outside the label and hands its id to the control', () => {
    /* The defect: `{label}{#if hint} <span>{hint}</span>{/if}` inside the
       <label>, which made the sentence part of the field's accessible
       name. */
    expect(field).not.toMatch(/<label[^>]*>\{label\}\{#if hint\}/);
    expect(field).toMatch(/<p class="field-hint"[^>]*id=\{hintId\}>\{hint\}<\/p>/);
    expect(field).toContain('{@render children(fieldId, hint ? hintId : undefined)}');
  });

  it('carries a described-by onto the field a date picker actually shows', () => {
    /* flatpickr's alternate input is the element a person reaches and a
       label points at; the original is hidden, so an aria-describedby left
       on it describes nothing. */
    expect(datePicker).toContain("picker.altInput.setAttribute('aria-describedby', describedBy)");
  });

  it('points every hinted field at its own help', () => {
    for (const source of [tryoutForm, read('src/routes/transition/milestones/+page.svelte')]) {
      expect(source).toMatch(/\{#snippet children\(id, describedBy\)\}/);
      expect(source).toMatch(/<DatePicker[^>]*\{describedBy\}/);
    }
  });

  it('labels the felt-sense note instead of leaving it to a placeholder', () => {
    expect(tryoutForm).toMatch(/<Field label=\{m\.note_label\(\)\} id="tr-feeling-note">/);
  });
});

describe('the overflow chevron stands on the track rather than on a label', () => {
  it('gives the hint its own ground in the track colour', () => {
    expect(components).toMatch(/\.segmented-hint-end \{[^}]*background: linear-gradient\(to left, var\(--surface-2\)/);
    expect(components).toMatch(/\.segmented-hint-start \{[^}]*background: linear-gradient\(to right, var\(--surface-2\)/);
  });

  it('stops masking the track, which only ever faded one edge at a time', () => {
    expect(components).not.toContain('.segmented.can-scroll-end:not(.can-scroll-start)');
    expect(components).not.toContain('.segmented.can-scroll-start:not(.can-scroll-end)');
  });
});

describe('a running tryout says which experiment it is first', () => {
  it('puts the name on the block and the length in a line under it', () => {
    expect(card).toMatch(/<span class="tc-block"[^>]*>\s*<span class="tc-name">\{tryout\.label\}<\/span>/);
    expect(card).toContain('m.tryout_day_since(');
    /* The day count was the 40px number on the stripe, which is the shape
       of a streak counter. Nothing on this card is at that size now. */
    expect(card).not.toContain('var(--text-3xl)');
  });

  it('names the latest reading in the person\'s own word for it', () => {
    expect(card).toContain('moodName(reading.latest.mood)');
    expect(card).toContain('m.tryout_felt_none()');
  });

  it('supplies the new copy in both catalogues and retires what it replaced', () => {
    for (const key of ['tryout_day_since', 'tryout_felt_last']) {
      expect(en[key], `en missing ${key}`).toBeDefined();
      expect(pl[key], `pl missing ${key}`).toBeDefined();
    }
    for (const key of ['tryout_since', 'tryout_unit_days_trying', 'tryout_felt_latest']) {
      expect(en[key], `en still carries ${key}`).toBeUndefined();
      expect(pl[key], `pl still carries ${key}`).toBeUndefined();
    }
  });
});
