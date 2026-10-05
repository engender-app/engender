import { flushSync } from 'svelte';
import WearScreen from '../../src/routes/body/wear/+page.svelte';
import MoreScreen from '../../src/routes/more/+page.svelte';
import * as labels from '../../src/lib/data/vocabulary/wearLabels.ts';
import type { WearKind } from '../../src/lib/data/types.ts';
import { todayEpochDay, startOfDayTimestamp } from '../../src/lib/data/epochDay.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { attachJournal, journalIsOpen } from '../../src/lib/data/live/journal.svelte.ts';
import { hydrateReference } from '../../src/lib/data/live/reference.svelte.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { attachPreferences } from '../../src/lib/data/prefs/store.svelte.ts';
import { localStorageCache } from '../../src/lib/data/prefs/boot-cache.ts';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte.ts';
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

const NAME = 'wear-labels-probe';
const unknownKinds = ['future-wear', 'constructor', '__proto__', 'toString'];
const accessors = [
  labels.wearKindLabel, labels.wearAddAria, labels.wearNewSheetTitle,
  labels.wearEditSheetTitle, labels.wearRunningSheetTitle, labels.wearRunningCardTitle,
  labels.wearDeleteSheetTitle, labels.wearReminderTitle, labels.wearTileTitle,
  labels.wearReturningRowTitle
];

async function waitFor(read: () => boolean): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!read()) {
    if (performance.now() > deadline) throw new Error('archived wear kind did not render');
    await new Promise((resolve) => setTimeout(resolve, 20));
    flushSync();
  }
}

async function run() {
  const accessorResults = unknownKinds.map((kind) => {
    try {
      const safety = labels.wearSafetyFacts(kind as WearKind);
      return {
        kind,
        labels: accessors.map((label) => label(kind as WearKind)),
        safety
      };
    } catch (error) {
      return { kind, error: String(error) };
    }
  });
  const known = (['binder', 'tucking', 'compression'] as const).map((kind) => ({
    kind, label: labels.wearKindLabel(kind),
    labels: accessors.map((label) => label(kind)),
    safety: labels.wearSafetyFacts(kind)
  }));

  await freshOrigin();
  refreshActiveFlag();
  const { driver, fileOps } = createEncryptedWebSqlite('wear-labels-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;
  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();
  await hydrateReference(journal);
  await attachPreferences(await openPreferences(booted.driver, localStorageCache()));
  journalIsOpen();

  const target = document.querySelector('#screen')!;
  const rendered = [];
  for (const kind of unknownKinds) {
    const id = await journal.wearSessions.upsertSession({
      kind: kind as WearKind, startTimestamp: startOfDayTimestamp(todayEpochDay()), durationMs: null
    });
    const wear = mountInto(WearScreen, {}, target);
    await waitFor(() => Boolean(target.querySelector('[data-wear-running]')) && target.textContent!.includes(kind));
    const running = target.querySelector('[data-wear-running]')!.textContent!.includes(kind);
    const add = target.querySelector('[data-add]')?.getAttribute('aria-label') === kind;
    await wear.remove();
    const more = mountInto(MoreScreen, {}, target);
    await waitFor(() => Boolean(target.querySelector('a[href="/body/wear"]')?.textContent?.includes(kind)));
    const hub = target.querySelector('a[href="/body/wear"]')!.textContent!.includes(kind);
    await more.remove();

    await journal.wearSessions.upsertSession({
      id, kind: kind as WearKind, startTimestamp: startOfDayTimestamp(todayEpochDay()), durationMs: 3600000
    });
    const completed = mountInto(WearScreen, {}, target);
    await waitFor(() => Boolean(target.querySelector(`[data-wear-session="${id}"]`)?.textContent?.includes(kind)));
    const row = target.querySelector(`[data-wear-session="${id}"]`)!.textContent!.includes(kind);
    await completed.remove();
    await journal.wearSessions.deleteSession(id);
    rendered.push({ kind, running, add, hub, row });
  }
  await driver.close();
  return { accessorResults, known, rendered };
}

publishFixture(NAME, run);
