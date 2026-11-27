/* The entry editor, mounted over a real encrypted journal and read back out
   of SQLite (phase 8 audit ticket 25, tester report 02).

   Each case mounts the real editor, drives the real controls, saves, and
   reads the entry back from SQLite. What is published is what the database
   holds - not what the markup says. The draft is component-local `$state`
   with no handle out, so the save is the only way to see it at all, and the
   save is ADR-0044's nine-area transaction, so a break in *that* would
   surface here as a case that saved nothing.

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
const ADDED_TAG = 'g-body-eu';
const HIDDEN_TAG = 'a-work';
const HIDDEN_DIM = 'masculinity';


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

/** The one step on screen once a change between steps has finished: both
    are in the page for the length of it. */
function settledStep(root: ParentNode): string | null {
  const steps = root.querySelectorAll('[data-entry-step]');
  return steps.length === 1 ? steps[0].getAttribute('data-entry-step') : null;
}

/** Walks a new entry's steps forward
    until `selector` is on the step shown. */
async function toStepWith(root: ParentNode, selector: string): Promise<void> {
  for (let hop = 0; hop < 6; hop++) {
    const at = await until(() => settledStep(root), 'a settled step');
    if (root.querySelector(`[data-entry-step] ${selector}`)) return;
    if (at === 'writing') break;
    // The way on from the first step waits for a face (ticket 09's sign-off).
    if (at === 'today' && !root.querySelector('[data-entry-step="today"] [data-mood][aria-checked="true"]')) {
      root.querySelector<HTMLButtonElement>('[data-entry-step="today"] [data-mood="3"]')?.click();
    }
    (await until(() => root.querySelector<HTMLButtonElement>('[data-entry-continue]'), `the way on from the ${at} step`)).click();
    await until(() => (settledStep(root) && settledStep(root) !== at ? true : null), `the step after ${at}`);
  }
  throw new Error(`no step shows ${selector}`);
}

/** To the last step, where the note and the attachments are. */
async function toTheRest(root: ParentNode): Promise<void> {
  await toStepWith(root, '#ed-note');
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

/** A new entry finished on its first step:
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
    await until(() => target.querySelector('[data-entry-step="today"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>(`[data-entry-step="today"] [data-mood="${face}"]`), 'a face on the first step')).click();
    let shownValue: string | null = null;
    if (nudgeFirstScale) {
      const slider = await until(() => target.querySelector<HTMLElement>('[data-entry-step="today"] [role="slider"]'), 'a scale on the first step');
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      shownValue = await until(() => {
        flushSync();
        const text = target.querySelector('[data-entry-step="today"] [data-dim-value]')?.textContent?.trim();
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

/** A new entry finished from its second step:
    a face and a scale on the first, then on the second a mode, a tag on the
    page (no chip to open first), the note and the star, and the same finish
    control the first step has. Read back out of SQLite. */
async function finishOnTheSecondStep(journal: Journal, epochDay: number): Promise<StepTwoSave> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay }, target);
  try {
    await until(() => target.querySelector('[data-entry-step="today"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="today"] [data-mood="3"]'), 'a face')).click();
    const slider = await until(() => target.querySelector<HTMLElement>('[data-entry-step="today"] [role="slider"]'), 'a scale');
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await toStepWith(target, '.presentation-chip');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="marks"] .presentation-chip'), 'a mode chip')).click();
    (await until(() => target.querySelector<HTMLButtonElement>(`[data-entry-step="marks"] [data-editor-section="tags"] [data-tag="${ADDED_TAG}"]`), 'a tag on the page, with no chip opened')).click();
    await toTheRest(target);
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

/** A save from a middle step: a face on the first step, a tag on
    the marks step, and the finish control pressed there. Writes those two
    and nothing the later steps hold. */
async function finishOnTheMarksStep(journal: Journal, epochDay: number): Promise<StepTwoSave> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay }, target);
  try {
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="today"] [data-mood="3"]'), 'a face')).click();
    await toStepWith(target, '[data-editor-section="tags"]');
    (await until(() => target.querySelector<HTMLButtonElement>(`[data-entry-step="marks"] [data-tag="${ADDED_TAG}"]`), 'a tag')).click();
    const finish = await until(() => {
      const button = target.querySelector<HTMLButtonElement>('[data-entry-finish]');
      return button && !button.disabled && !button.dataset.saveUnmet ? button : null;
    }, 'the finish control on the marks step');
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

/** Every body region hidden and no card offered: the body step
    is not drawn, and the progress counts the steps that are. */
async function walkWithTheBodyStepEmpty(journal: Journal): Promise<{ steps: string[]; segments: string[] }> {
  for (const region of await journal.bodyRegions.getBodyRegions()) {
    if (!region.hidden) await journal.bodyRegions.setRegionHidden(region.id, true);
  }
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay: 19_009 }, target);
  try {
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="today"] [data-mood="3"]'), 'a face')).click();
    const steps: string[] = [];
    let segments: string[] = [];
    for (let hop = 0; hop < 6; hop++) {
      const at = await until(() => settledStep(target), 'a settled step');
      steps.push(at);
      segments = [...document.querySelectorAll<HTMLElement>('[data-step-segment]')].map((s) => s.dataset.stepSegment ?? '');
      const ahead = at === 'writing' ? null : target.querySelector<HTMLButtonElement>('[data-entry-continue]');
      if (!ahead) break;
      ahead.click();
      await until(() => (settledStep(target) && settledStep(target) !== at ? true : null), `the step after ${at}`);
    }
    return { steps, segments };
  } finally {
    await screen.remove();
  }
}

/** The mood comes first (Alicja, ticket 09's sign-off): the way on from the
    first step, pressed with no face picked, stays on the step, takes the
    focus to the faces and says why. */
async function wayOnWithoutAMood(): Promise<{ step: string | null; focusOnAFace: boolean; said: string }> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay: 19_010 }, target);
  try {
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-continue]'), 'the way on')).click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      step: settledStep(target),
      focusOnAFace: !!document.activeElement?.closest('[data-first-step-moods]'),
      said: target.querySelector('[data-save-status]')?.textContent?.trim() ?? ''
    };
  } finally {
    await screen.remove();
  }
}

type StepTwoShape = { steps: string[]; order: string[]; backKeptDraft: boolean; footOnStep2: number; finishSameNode: boolean };

/** The later steps' parts in page order, step by step, and what going back
    does to the draft: the order is the one Alicja chose on 2026-11-10 (mode,
    tags, the body and the cards, the note, the attachments last), on steps of
    one purpose each since ticket 09; back walks every step to the first with
    the face and the note kept. */
async function secondStepShape(): Promise<StepTwoShape> {
  const target = document.createElement('div');
  document.querySelector('#editor')!.replaceChildren(target);
  const screen = mountInto(EntryEditor, { epochDay: 19_007 }, target);
  try {
    await until(() => target.querySelector('[data-entry-step="today"]'), 'the first step');
    (await until(() => target.querySelector<HTMLButtonElement>('[data-entry-step="today"] [data-mood="5"]'), 'a face')).click();
    const finishBefore = target.querySelector('[data-entry-finish]');
    const landmarks: [string, string][] = [
      ['mode', '.presentation-chip'],
      ['tags', '[data-editor-section="tags"]'],
      ['body', '[data-editor-section="body"]'],
      ['note', '#ed-note'],
      ['photos', '[data-section-chip="photos"]'],
      ['voice', '[data-section-chip="voice"]'],
      ['video', '[data-section-chip="video"]']
    ];
    const steps: string[] = [];
    const order: string[] = [];
    for (let hop = 0; hop < 6; hop++) {
      const at = await until(() => settledStep(target), 'a settled step');
      steps.push(at);
      const step = target.querySelector<HTMLElement>(`[data-entry-step="${at}"]`)!;
      const found = landmarks
        .map(([name, selector]) => [name, step.querySelector(selector)] as const)
        .filter((pair): pair is readonly [string, Element] => pair[1] != null);
      found.sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      order.push(...found.map(([name]) => name));
      // The last step's way on is still fading out as it arrives.
      const ahead = at === 'writing' ? null : target.querySelector<HTMLButtonElement>('[data-entry-continue]');
      if (!ahead) break;
      ahead.click();
      await until(() => (settledStep(target) && settledStep(target) !== at ? true : null), `the step after ${at}`);
    }
    const finishAfter = target.querySelector('[data-entry-finish]');
    const footOnLast = target.querySelectorAll('[data-entry-finish]').length;
    typeInto(target.querySelector<HTMLTextAreaElement>('#ed-note')!, 'kept across a step back');
    for (let hop = 0; hop < 6 && settledStep(target) !== 'today'; hop++) {
      const at = settledStep(target);
      target.querySelector<HTMLButtonElement>('[data-screen-back]')!.click();
      await until(() => (settledStep(target) && settledStep(target) !== at ? true : null), `the step before ${at}`);
    }
    const face = target.querySelector<HTMLElement>('[data-entry-step="today"] [data-mood="5"]');
    const faceKept = face?.getAttribute("aria-checked") === "true";
    await toTheRest(target);
    const note = (await until(() => target.querySelector<HTMLTextAreaElement>('#ed-note'), 'the note')).value;
    return {
      steps,
      order,
      backKeptDraft: faceKept && note === 'kept across a step back',
      footOnStep2: footOnLast,
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
    const step = await until(() => target.querySelector<HTMLElement>('[data-entry-step="today"]'), 'the first step');
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

  /* Two presentations, one of each visibility, and a hidden tag and scale,
     so the cases run against a journal that holds hidden vocabulary. */
  const shown = await journal.presentations.addPresentation('Shown', 0);
  const concealed = await journal.presentations.addPresentation('Concealed', 1);
  await journal.presentations.setPresentationHidden(concealed.id, true);
  await journal.tags.setTagHidden(HIDDEN_TAG, true);
  await journal.dimensions.setDimensionHidden(HIDDEN_DIM, true);

  await hydrateReference(journal);

  /* The scales-hidden case runs on its own page load (?hideScales=1), in a
     360x640 window, so hiding every scale here cannot reach the cases below. */
  if (new URLSearchParams(location.search).has('skipBody')) {
    return { bodyStepEmpty: await walkWithTheBodyStepEmpty(journal) };
  }
  if (new URLSearchParams(location.search).has('hideScales')) {
    /* "Hidden" is a scale left unticked: the entry screen offers
       `activeScales` and nothing else. */
    await setPreferenceDurably('activeScales', []);
    return { firstStepEveryScaleHidden: await firstStepWithEveryScaleHidden(journal) };
  }

  return {
    navigationFailure: await saveWithNavigationFailure(journal),
    firstStepMoodOnly: await finishOnTheFirstStep(journal, 19_004, { face: 4, nudgeFirstScale: false }),
    firstStepWithAScale: await finishOnTheFirstStep(journal, 19_005, { face: 2, nudgeFirstScale: true }),
    secondStepSave: await finishOnTheSecondStep(journal, 19_006),
    marksStepSave: await finishOnTheMarksStep(journal, 19_008),
    wayOnWithoutAMood: await wayOnWithoutAMood(),
    secondStepShape: await secondStepShape(),
    shownPresentationId: shown.id
  };
}

publishFixture(NAME, run);
