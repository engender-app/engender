/* The file-level facts behind phase 11 pre-production UI/UX ticket 43.

   Deliberately short. What a person hears and sees - the field's accessible
   name, its description, the chevron standing on the track rather than on a
   label, every kind reachable - is observable behaviour and is proved
   against a real browser by tests/tryout-form-check.mjs. The spec's own
   Testing Decisions rule out asserting markup or CSS "merely because the
   implementation renders it that way", so none of that is repeated here.

   What is left is the two kinds of thing a grep is the right owner of, both
   from tests/accessibility-audit.test.ts's reasoning: a construct whose
   absence is silent at runtime, and the catalogue parity nothing else
   checks. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const datePicker = read('src/lib/components/DatePicker.svelte');
const tryoutForm = read('src/routes/transition/tryouts/[id]/+page.svelte');
const milestones = read('src/routes/transition/milestones/+page.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('a hinted field points the control at its help', () => {
  it('carries the described-by onto the field a date picker actually shows', () => {
    /* flatpickr's alternate input is the element a person reaches and a
       label points at; the original is hidden, so a description left on it
       describes nothing, silently. */
    expect(datePicker).toContain("picker.altInput.setAttribute('aria-describedby', describedBy)");
  });

  it('takes the help id at every field that has one', () => {
    /* Field hands it as the second argument. A snippet that declares only
       the first still compiles and still renders, so dropping it is a
       description that quietly goes nowhere. */
    for (const source of [tryoutForm, milestones]) {
      expect(source).toMatch(/\{#snippet children\(id, describedBy\)\}/);
      expect(source).toMatch(/<DatePicker[^>]*\{describedBy\}/);
    }
  });

  it('labels the felt-sense note instead of leaving it to a placeholder', () => {
    expect(tryoutForm).toContain('m.note_label()');
    expect(tryoutForm).toContain('id="tr-feeling-note"');
  });
});

describe('the tryout catalogue', () => {
  it('supplies the new copy in both languages and retires what it replaced', () => {
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
