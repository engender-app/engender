/* The entry editor's template application, asserted as a value where the
   component actually runs (phase 8 audit ticket 25).

   Three rules meet on one click. Two of them are the pure merge's, node-
   tested in vocabulary/entryTemplates.test.ts: tags union, dims replace by
   key, a note scaffold fills an empty note and never overwrites a written
   one. The third is the screen's own and lives nowhere else - EntryEditor
   .svelte filters the template through what this install currently shows,
   so a hidden tag, dimension or presentation stays out of the draft even
   when the template names it (CONTEXT: "Hidden"). Until this page there was
   no way to run that filter at all: it is a closure inside a 386-line
   component, reachable only by mounting it.

   So each case mounts the real editor over a real encrypted journal, opens
   the real template sheet, clicks a real row, saves, and reads the entry
   back out of SQLite. What is published is what the database holds - not
   what the markup says, and not whether the source text mentions
   `visibleTagGroups`.

   Two things follow from reading it back through the save rather than off
   the draft, and both are deliberate. The draft is component-local `$state`
   with no handle out, so the save is the only way to see it at all. And the
   save is ADR-0044's nine-area transaction, so a break in *that* would
   surface here as a template that applied nothing - a misattribution worth
   knowing about before believing this page's verdict on a red run.

   The first two cases are not the node tests restated. What only this page
   can fail on is the wiring: that clicking the row reaches the merge at all,
   and that what the merge produced survives `toUpsert()` into the tables.
   They are also the positive control the third case needs - without a case
   proving a template's tag, dimension, note and presentation *do* land, "the
   hidden ones did not land" would pass just as well on a screen that applies
   nothing whatsoever.

   The editor's draft mirror uses this fixture's data key through the boot
   stub. The fixture opens below the keystore, so the real boot store has
   no session key to release. Waiting for draft restoration before enabling
   Save needs that same key available to the editor. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal, type Journal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { attachJournal, journalIsOpen } from '../../src/lib/data/live/journal.svelte.ts';
import { hydrateReference } from '../../src/lib/data/live/reference.svelte.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { attachPreferences, setPreferenceDurably } from '../../src/lib/data/prefs/store.svelte.ts';
import { localStorageCache } from '../../src/lib/data/prefs/boot-cache.ts';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte.ts';
import EntryEditor from '../../src/lib/components/EntryEditor.svelte';
import { mountInto, publishFixture } from './mount.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';
import { failNextNavigation } from './app-navigation-stub.ts';
import { toasts } from '../../src/lib/stores/toasts.svelte.ts';
import { m } from '../../src/lib/paraglide/messages.js';

import '../../src/lib/theme/fonts.css';
import '../../src/lib/theme/base.css';
import '../../src/lib/theme/palettes.css';
import '../../src/lib/styles/app.css';
import '../../src/lib/styles/components.css';
import '../../src/lib/styles/screens.css';
import '../../src/lib/styles/kit.css';
import '../../src/lib/motion/press.css';
import '../../src/lib/motion/materials.css';

const NAME = 'entry-editor-probe';

/* Built-ins the reconcile seeds, so the fixture names rows that are really
   there rather than minting its own vocabulary. `masculinity` and `a-work`
   are the two the golden archive fixture already hides for its own reasons -
   nothing about them is special beyond being built in. */
const KEPT_TAG = 'g-euphoria';
const ADDED_TAG = 'g-body-eu';
const HIDDEN_TAG = 'a-work';
const DIM = 'euphoria_dysphoria';
const HIDDEN_DIM = 'masculinity';

/* One day per case, since a case reads its entry back by day. */
const BLANK_DAY = 19_000;
const OVER_A_FILLED_DRAFT_DAY = 19_001;
const HIDDEN_DAY = 19_002;

type Awaitable<T> = T | Promise<T>;

/** Polls `get` until it answers with something, flushing Svelte's queued
    effects first each time - the editor's own reads land in effects, and a
    click's consequence is not in the DOM until they run. */
async function until<T>(get: () => Awaitable<T | null | undefined>, what: string): Promise<T> {
  for (let attempt = 0; attempt < 400; attempt++) {
    flushSync();
    const found = await get();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Walks a new entry from its first step to the rest (tester report 02,
    ticket 03), where the note, the template and the save bar's star are. */
async function toTheRest(root: ParentNode): Promise<void> {
  (await until(() => root.querySelector<HTMLButtonElement>('[data-entry-continue]'), 'the first step\'s continue')).click();
  await until(() => root.querySelector('[data-entry-step="2"]'), 'the second step');
}

/** Applies `templateId` through the sheet the screen offers, which is the
    only way in: the button exists for a new entry alone (a template is a
    creation aid), and the rows are inside a sheet that has to be opened. */
async function applyTemplateThroughTheSheet(root: ParentNode, templateId: string): Promise<void> {
  const row = `[data-list-row="${templateId}"]`;
  (await until(() => root.querySelector<HTMLButtonElement>('[data-use-template]'), 'the use-template button')).click();
  (await until(() => root.querySelector<HTMLElement>(row), `the template row for ${templateId}`)).click();
  // The screen closes the sheet as the last thing it does when a template
  // lands, so the row going away is the click having been taken.
  await until(() => (root.querySelector(row) ? null : true), 'the template sheet to close');
}

type Applied = {
  tags: string[];
  dims: Record<string, number>;
  note: string;
  presentationId: string | null;
};

/** Mounts the editor on a new entry for `epochDay`, applies each template in
    turn through the sheet, saves, and answers with what SQLite then holds
    for that day. `seedMood` because the save refuses a moodless entry, and
    a mood is the one thing no template here sets. */
async function applyAndSave(journal: Journal, epochDay: number, templateIds: string[]): Promise<Applied> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay, seedMood: 4 }, target);
  try {
    await toTheRest(target);
    for (const templateId of templateIds) await applyTemplateThroughTheSheet(target, templateId);

    const save = await until(() => {
      const button = target.querySelector<HTMLButtonElement>('[data-save]');
      return button && !button.disabled ? button : null;
    }, 'the ready save button');
    save.click();
    /* Waited out on the screen's committed state rather than by polling
       the journal for the entry. A read issued while the save's transaction
       is open goes into the same driver's statement queue and runs *inside*
       it, so a poll can land between the entry row and its tag and dimension
       rows and come back with an entry that has neither - which is exactly
       what this check would then report as a template that applied nothing. */
    await until(() => target.querySelector('[data-entry-saved]'), 'the save to finish');
    const entry = await until(async () => (await journal.entries.entriesForDay(epochDay))[0], `the entry saved on day ${epochDay}`);
    return { tags: entry.tags, dims: entry.dims, note: entry.note, presentationId: entry.presentationId };
  } finally {
    await screen.remove();
  }
}

async function saveWithNavigationFailure(journal: Journal) {
  const epochDay = 19_003;
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  /* A real appointment on the entry's own day: the save links a debrief
     only to an appointment the offer could be naming (GD-048). */
  const visit = await journal.appointments.upsertAppointment({ epochDay, procedureId: null, kind: null, place: null, note: null });
  const screen = mountInto(EntryEditor, { epochDay, seedMood: 4, debriefForAppointment: visit }, target);
  try {
    await toTheRest(target);
    (await until(() => target.querySelector<HTMLButtonElement>('[data-save-star]'), 'the star')).click();
    const save = await until(() => {
      const button = target.querySelector<HTMLButtonElement>('[data-save]');
      return button && !button.disabled ? button : null;
    }, 'the ready save button');
    failNextNavigation();
    save.click();
    const notice = await until(() => {
      const notice = target.querySelector('[data-entry-saved]');
      return notice?.textContent?.includes(m.entry_saved_navigation_failed()) ? notice : null;
    }, 'saved entry navigation recovery');
    await until(() => target.querySelector('[data-save]') ? null : true, 'the saved editor to leave');
    const entries = await journal.entries.entriesForDay(epochDay);
    return {
      entryCount: entries.length,
      starred: entries[0].starred,
      debriefLinked: await journal.checklists.getDebriefEntryId(visit) === entries[0].id,
      truthfulNotice: notice.textContent!.includes(m.saved()),
      saveOffered: target.querySelector('[data-save]') !== null,
      saveFailureReported: toasts.some((item) => item.message === m.entry_save_failed()),
      recoveryHref: target.querySelector('[data-entry-saved] a')?.getAttribute('href')
    };
  } catch (error) {
    await screen.remove();
    throw error;
  }
}

type FirstStepSave = { mood: number | null; dims: Record<string, number>; note: string; tags: string[]; shownValue: string | null };

/** A new entry finished on its first step (tester report 02, ticket 03):
    a face, optionally one scale moved by a key, and the finish control,
    which saves and leaves in one touch. Read back out of SQLite, so what is
    published is what was written - including that the scales nobody
    touched wrote nothing. */
async function finishOnTheFirstStep(
  journal: Journal,
  epochDay: number,
  { face, nudgeFirstScale }: { face: number; nudgeFirstScale: boolean }
): Promise<FirstStepSave> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay }, target);
  try {
    await until(() => target.querySelector('[data-entry-step="1"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>(`[data-entry-step="1"] [data-mood="${face}"]`), 'a face on the first step')).click();
    let shownValue: string | null = null;
    if (nudgeFirstScale) {
      const slider = await until(() => target.querySelector<HTMLElement>('[data-entry-step="1"] [role="slider"]'), 'a scale on the first step');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      shownValue = await until(() => {
        flushSync();
        const text = target.querySelector('[data-entry-step="1"] [data-dim-value]')?.textContent?.trim();
        return text && /^\d+$/.test(text) ? text : null;
      }, 'the moved scale to show a value');
    }
    const finish = await until(() => {
      const button = target.querySelector<HTMLButtonElement>('[data-entry-finish]');
      return button && !button.disabled && !button.dataset.saveUnmet ? button : null;
    }, 'the ready finish control');
    finish.click();
    await until(() => target.querySelector('[data-entry-saved]'), 'the save to finish');
    const entry = await until(async () => (await journal.entries.entriesForDay(epochDay))[0], `the entry saved on day ${epochDay}`);
    return { mood: entry.mood, dims: entry.dims, note: entry.note, tags: entry.tags, shownValue };
  } finally {
    await screen.remove();
  }
}

/** Types into a field the way a keyboard does, so bind:value hears it. */
function typeInto(field: HTMLTextAreaElement, text: string) {
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

type StepTwoSave = {
  mood: number | null;
  dims: Record<string, number>;
  note: string;
  tags: string[];
  presentationId: string | null;
  starred: boolean;
};

/** A new entry finished from its second step (tester report 02, ticket 04):
    a face and a scale on the first, then on the second a mode, a tag on the
    page (no chip to open first), the note and the star, and the same finish
    control the first step has. Read back out of SQLite. */
async function finishOnTheSecondStep(journal: Journal, epochDay: number): Promise<StepTwoSave> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay }, target);
  try {
    await until(() => target.querySelector('[data-entry-step="1"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="1"] [data-mood="3"]'), 'a face')).click();
    const slider = await until(() => target.querySelector<HTMLElement>('[data-entry-step="1"] [role="slider"]'), 'a scale');
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await toTheRest(target);
    await until(() => (target.querySelector('[data-entry-step="1"]') ? null : true), 'the first step to leave');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="2"] .presentation-chip'), 'a mode chip')).click();
    (await until(() => target.querySelector<HTMLButtonElement>(`[data-entry-step="2"] [data-editor-section="tags"] [data-tag="${ADDED_TAG}"]`), 'a tag on the page, with no chip opened')).click();
    typeInto(await until(() => target.querySelector<HTMLTextAreaElement>('#ed-note'), 'the note'), 'written on the second step');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-save-star]'), 'the star')).click();
    const finish = await until(() => {
      const button = target.querySelector<HTMLButtonElement>('[data-entry-finish]');
      return button && !button.disabled && !button.dataset.saveUnmet ? button : null;
    }, 'the finish control on the second step');
    finish.click();
    await until(() => target.querySelector('[data-entry-saved]'), 'the save to finish');
    const entry = await until(async () => (await journal.entries.entriesForDay(epochDay))[0], `the entry saved on day ${epochDay}`);
    return {
      mood: entry.mood, dims: entry.dims, note: entry.note, tags: entry.tags,
      presentationId: entry.presentationId ?? null, starred: !!entry.starred
    };
  } finally {
    await screen.remove();
  }
}

type StepTwoShape = { order: string[]; backKeptDraft: boolean; footOnStep2: number; finishSameNode: boolean };

/** The second step's parts in page order, and what going back does to the
    draft: the order is the one Alicja chose on 2026-11-10 (mode, tags, the
    body and the cards, the note, the attachments last); back lands on the
    first step with the face and the note kept. */
async function secondStepShape(): Promise<StepTwoShape> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay: 19_007 }, target);
  try {
    await until(() => target.querySelector('[data-entry-step="1"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="1"] [data-mood="5"]'), 'a face')).click();
    const finishBefore = target.querySelector('[data-entry-finish]');
    await toTheRest(target);
    await until(() => (target.querySelector('[data-entry-step="1"]') ? null : true), 'the first step to leave');
    const step = (await until(() => target.querySelector<HTMLElement>('[data-entry-step="2"]'), 'the second step'));
    const landmarks: [string, string][] = [
      ['mode', '.presentation-chip'],
      ['tags', '[data-editor-section="tags"]'],
      ['body', '[data-section-chip="body"]'],
      ['note', '#ed-note'],
      ['photos', '[data-section-chip="photos"]'],
      ['voice', '[data-section-chip="voice"]'],
      ['video', '[data-section-chip="video"]']
    ];
    const found = landmarks
      .map(([name, selector]) => [name, step.querySelector(selector)] as const)
      .filter((pair): pair is readonly [string, Element] => pair[1] != null);
    found.sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const finishAfter = target.querySelector('[data-entry-finish]');
    typeInto(target.querySelector<HTMLTextAreaElement>('#ed-note')!, 'kept across a step back');
    target.querySelector<HTMLButtonElement>('[data-screen-back]')!.click();
    await until(() => target.querySelector('[data-entry-step="1"]'), 'the first step again');
    await until(() => (target.querySelector('[data-entry-step="2"]') ? null : true), 'the second step to leave');
    const face = target.querySelector<HTMLElement>('[data-entry-step="1"] [data-mood="5"]');
    const faceKept = face?.getAttribute("aria-checked") === "true";
    await toTheRest(target);
    const note = (await until(() => target.querySelector<HTMLTextAreaElement>('#ed-note'), 'the note')).value;
    return {
      order: found.map(([name]) => name),
      backKeptDraft: faceKept && note === 'kept across a step back',
      footOnStep2: target.querySelectorAll('[data-entry-finish]').length,
      finishSameNode: finishBefore != null && finishBefore === finishAfter
    };
  } finally {
    await screen.remove();
  }
}

type FirstStepNoScales = {
  faces: number;
  facesInView: boolean;
  sliders: number;
  dimValues: number;
  hints: number;
  headings: string[];
  stepChildren: string[];
  finish: { inView: boolean; height: number } | null;
  cont: { inView: boolean; height: number } | null;
  viewport: [number, number];
};

/** A new entry's first step for a person who has hidden every scale (tester
    report 02, ticket 03, "with every scale hidden, step 1 shows the faces
    alone"). Reads what the step drew: the five faces, and no scale row, no
    value, no "not ticked" hint, no heading for a block that is not there;
    and that both ways on are on screen in the window the page was given. */
async function firstStepWithEveryScaleHidden(journal: Journal): Promise<FirstStepNoScales> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay: 19_100 }, target);
  try {
    const step = await until(() => target.querySelector<HTMLElement>('[data-entry-step="1"]'), 'the first step');
    await until(() => step.querySelector('[data-mood]'), 'the faces');
    await new Promise((resolve) => setTimeout(resolve, 600));
    flushSync();
    const view = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.height > 0, height: Math.round(r.height * 100) / 100 };
    };
    return {
      faces: step.querySelectorAll('[data-mood]').length,
      facesInView: [...step.querySelectorAll('[data-mood]')].every((f) => view(f)?.inView === true),
      sliders: step.querySelectorAll('[role="slider"]').length,
      dimValues: step.querySelectorAll('[data-dim-value]').length,
      hints: step.querySelectorAll('.first-step-hint').length,
      headings: [...step.querySelectorAll('h1, h2, h3, h4, [role="heading"]')].map((h) => h.textContent?.trim() ?? ''),
      stepChildren: [...step.children].map((c) => c.tagName.toLowerCase() + (c.className ? '.' + String(c.className).split(' ')[0] : '')),
      finish: view(target.querySelector('[data-entry-finish]')),
      cont: view(target.querySelector('[data-entry-continue]')),
      viewport: [innerWidth, innerHeight]
    };
  } finally {
    await screen.remove();
  }
}

async function run() {
  await freshOrigin();
  refreshActiveFlag();

  const { driver, fileOps } = createEncryptedWebSqlite('entry-editor-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();
  await hydrateReference(journal);
  await attachPreferences(await openPreferences(booted.driver, localStorageCache()));
  journalIsOpen();

  /* Two presentations, one of each visibility, and the hidden pair of a tag
     and a dimension - the fixture's own half of the third case, without
     which "the hidden one stayed out" would only be saying that a row this
     journal never had is not in the draft. */
  const shown = await journal.presentations.addPresentation('Shown', 0);
  const concealed = await journal.presentations.addPresentation('Concealed', 1);
  await journal.presentations.setPresentationHidden(concealed.id, true);
  await journal.tags.setTagHidden(HIDDEN_TAG, true);
  await journal.dimensions.setDimensionHidden(HIDDEN_DIM, true);

  /* Applied first in the second case: what the draft is already holding
     when the template under test lands on it. */
  const groundwork = await journal.entryTemplates.addEntryTemplate({
    name: 'Groundwork',
    tags: [KEPT_TAG],
    dims: { [DIM]: 20 },
    noteScaffold: 'already writing',
    presentationId: null
  });
  const template = await journal.entryTemplates.addEntryTemplate({
    name: 'Under test',
    tags: [KEPT_TAG, ADDED_TAG],
    dims: { [DIM]: 85 },
    noteScaffold: 'What felt euphoric today?',
    presentationId: shown.id
  });
  /* Every field naming something this install does not show, beside one
     that does, so the filter has to discriminate rather than drop the lot. */
  const hiddenTemplate = await journal.entryTemplates.addEntryTemplate({
    name: 'Naming what is hidden',
    tags: [HIDDEN_TAG, ADDED_TAG],
    dims: { [HIDDEN_DIM]: 70, [DIM]: 85 },
    noteScaffold: '',
    presentationId: concealed.id
  });
  await hydrateReference(journal);

  /* The scales-hidden case runs on its own page load (?hideScales=1), in a
     360x640 window, so hiding every scale here cannot reach the cases below. */
  if (new URLSearchParams(location.search).has('hideScales')) {
    /* "Hidden" is a scale left unticked: the entry screen offers
       `activeScales` and nothing else. */
    await setPreferenceDurably('activeScales', []);
    return { firstStepEveryScaleHidden: await firstStepWithEveryScaleHidden(journal) };
  }

  return {
    onBlank: await applyAndSave(journal, BLANK_DAY, [template.id]),
    overAFilledDraft: await applyAndSave(journal, OVER_A_FILLED_DRAFT_DAY, [groundwork.id, template.id]),
    namingWhatIsHidden: await applyAndSave(journal, HIDDEN_DAY, [hiddenTemplate.id]),
    navigationFailure: await saveWithNavigationFailure(journal),
    firstStepMoodOnly: await finishOnTheFirstStep(journal, 19_004, { face: 4, nudgeFirstScale: false }),
    firstStepWithAScale: await finishOnTheFirstStep(journal, 19_005, { face: 2, nudgeFirstScale: true }),
    secondStepSave: await finishOnTheSecondStep(journal, 19_006),
    secondStepShape: await secondStepShape(),
    shownPresentationId: shown.id,
    hiddenPresentationId: concealed.id
  };
}

publishFixture(NAME, run);
