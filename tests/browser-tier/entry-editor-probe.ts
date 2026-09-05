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

   The draft mirror is the one thing here that does not run: it awaits
   `journalDataKey()`, which only the boot store resolves, and no fixture
   boots through that store. Nothing in this page's path touches it - the
   editor mirrors a draft, it never reads one back to apply a template. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal, type Journal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { attachJournal, journalIsOpen } from '../../src/lib/data/live/journal.svelte.ts';
import { hydrateReference } from '../../src/lib/data/live/reference.svelte.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { attachPreferences } from '../../src/lib/data/prefs/store.svelte.ts';
import { localStorageCache } from '../../src/lib/data/prefs/boot-cache.ts';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte.ts';
import EntryEditor from '../../src/lib/components/EntryEditor.svelte';
import { mountInto, publishFixture } from './mount.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

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
    for (const templateId of templateIds) await applyTemplateThroughTheSheet(target, templateId);

    const save = await until(() => target.querySelector<HTMLButtonElement>('[data-save]'), 'the save button');
    save.click();
    /* Waited out on the screen's own `saving` flag rather than by polling
       the journal for the entry. A read issued while the save's transaction
       is open goes into the same driver's statement queue and runs *inside*
       it, so a poll can land between the entry row and its tag and dimension
       rows and come back with an entry that has neither - which is exactly
       what this check would then report as a template that applied nothing. */
    await until(() => (save.disabled ? null : true), 'the save to finish');
    const entry = await until(async () => (await journal.entries.entriesForDay(epochDay))[0], `the entry saved on day ${epochDay}`);
    return { tags: entry.tags, dims: entry.dims, note: entry.note, presentationId: entry.presentationId };
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

  return {
    onBlank: await applyAndSave(journal, BLANK_DAY, [template.id]),
    overAFilledDraft: await applyAndSave(journal, OVER_A_FILLED_DRAFT_DAY, [groundwork.id, template.id]),
    namingWhatIsHidden: await applyAndSave(journal, HIDDEN_DAY, [hiddenTemplate.id]),
    shownPresentationId: shown.id,
    hiddenPresentationId: concealed.id
  };
}

publishFixture(NAME, run);
