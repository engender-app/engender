import { flushSync } from 'svelte';
import { mountScreen, until } from './mount-screen';
import { mountInto } from './mount';
import {
  fixture,
  assertions,
  node,
  style,
  today,
  heldReads,
  type Result
} from './screen-contracts/fixture';
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { m } from '$lib/paraglide/messages';
import QuickAdd from '$lib/components/QuickAdd.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { HOME_AREA_ROLE, tileRoleAt } from '$lib/theme/roles';
import { activeFlag } from '$lib/theme/activeFlag.svelte';

export async function homeContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const f = await fixture('home', 0);
  f.preferences!.pinnedRows = [];
  f.preferences!.lastBackupAt = Date.now() - 60 * 86400000;
  let screen = await mountScreen('/', f);
  const root = () => screen.target;
  await until(() => root().querySelector('[data-getting-started]'), 'day-one Home');
  await until(() => !root().querySelector('[data-read-reserve-hold]') || null, 'Home reads');
  await check(
    'Home uses kit surfaces without old cards or empty placeholders',
    () => !root().querySelector('.card,.list-group,.empty-state,.skeleton,.home-tiles')
  );
  for (const handle of ['home-header', 'home-hero', 'home-hello', 'home-log', 'home-pinned'])
    await check(`Home keeps data-${handle}`, () => root().querySelector(`[data-${handle}]`));
  await check(
    'Home hides the count when no entry exists',
    () => !root().querySelector('[data-home-count]')
  );
  await check('Getting started offers five destinations including More without dismiss', () => {
    const section = node(root(), '[data-getting-started]');
    return (
      section.querySelectorAll('a').length === 5 &&
      section.querySelector('a[href="/more"]') &&
      !section.querySelector('button')
    );
  });
  await check(
    'Home keeps five shared mood handles',
    () => root().querySelectorAll('[data-home-log] [data-mood]').length === 5
  );
  await check(
    'Home keeps writes out of the mood strip',
    () => !root().querySelector('[data-home-log-shape],[data-home-log] [data-choose]')
  );
  await check(
    'Home has no entries, duplicate week, milestones, teasers or streak',
    () =>
      !root().querySelector(
        '[data-entry-card],[data-week-strip],[data-milestone-rail],[data-wrapped-card],[data-on-this-day-card],a[href="/timeline"]'
      ) && !/streak/i.test(root().textContent!)
  );
  await check(
    'Home has no tally, doubt, onset or effects card',
    () =>
      !root().querySelector(
        '[data-live-tile="effects"],[data-live-tile="hrt-onset"],[data-doubt-card]'
      )
  );
  await check('Home puts sun and wordmark in field and greeting and gear on page', () => {
    const field = node(root(), '[data-home-field]');
    const foot = node(root(), '[data-home-foot]');
    return (
      field.querySelector('[data-flag-sun]') &&
      field.querySelector('[data-home-hero]') &&
      !field.querySelector('[data-home-hello]') &&
      foot.querySelector('[data-home-hello]') &&
      foot.querySelector('[data-home-gear]')
    );
  });
  for (const palette of ['trans', 'agender', 'nonbinary']) {
    await check(`Home log and pins use current ${palette} roles`, () => {
      prefs.palette = palette;
      document.documentElement.dataset.palette = palette;
      refreshActiveFlag(document, false);
      flushSync();
      const log = style(root(), '[data-home-log]').getPropertyValue('--role').trim();
      const pins = style(root(), '[data-home-pinned] .kit-list').getPropertyValue('--role').trim();
      return (
        HOME_AREA_ROLE.log === 0 &&
        log === activeFlag.roles[0].stripe &&
        pins === tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.pinned)?.stripe
      );
    });
  }
  await check('Disguise removes flag and roles and changes Home name', () => {
    prefs.disguise = true;
    refreshActiveFlag(document, true);
    flushSync();
    return (
      !root().querySelector('[data-flag-sun]') &&
      activeFlag.roles.length === 0 &&
      node(root(), '[data-home-hero]').textContent === m.disguise_name()
    );
  });
  await screen.remove();
  for (let i = 0; i < 5; i++)
    await f.journal.entries.upsertEntry({ epochDay: today - i, mood: 4, note: `Home entry ${i}` });
  for (let i = 1; i <= 5; i++)
    await f.journal.appointments.upsertAppointment({
      epochDay: today + i,
      procedureId: null,
      kind: 'Contract appointment',
      place: 'Private place',
      note: null
    });
  f.hasEntries = true;
  f.preferences!.pinnedRows = ['milestones', 'letters', 'wear'];
  screen = await mountScreen('/', f);
  await until(() => root().querySelector('[data-home-agenda-fold]'), 'Home agenda');
  await until(() => root().querySelector('[data-pinned-row]'), 'Home pins');
  await check(
    'Five entries remove getting started and report whole journal',
    () =>
      !root().querySelector('[data-getting-started]') &&
      /5/.test(node(root(), '[data-home-count]').textContent!)
  );
  await check('Agenda precedes log; notices and pins follow log', () => {
    const agenda = node(root(), '[data-home-agenda]');
    const log = node(root(), '[data-home-log]');
    const pinned = node(root(), '[data-home-pinned]');
    return (
      !!(agenda.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(log.compareDocumentPosition(pinned) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !agenda.querySelector('[data-backup-notice],[data-stock-notice],[data-debrief-offer]')
    );
  });
  await check(
    'Agenda shows three upcoming items and fold is a named button',
    () =>
      root().querySelectorAll('[data-agenda-item]').length === 3 &&
      node(root(), '[data-home-agenda-fold]').tagName === 'BUTTON' &&
      node(root(), '[data-home-agenda-fold]').getAttribute('aria-expanded') === 'false'
  );
  await check('Agenda fold expands in place and collapses again', async () => {
    node(root(), '[data-home-agenda-fold]').click();
    await until(
      () => root().querySelectorAll('[data-agenda-item]').length === 5,
      'expanded agenda'
    );
    const expanded =
      node(root(), '[data-home-agenda-fold]').getAttribute('aria-expanded') === 'true';
    node(root(), '[data-home-agenda-fold]').click();
    await until(
      () => root().querySelectorAll('[data-agenda-item]').length === 3,
      'collapsed agenda'
    );
    return expanded;
  });
  await check(
    'Pinned rows preserve chosen order and resolve forward lines',
    () =>
      [...root().querySelectorAll('[data-pinned-row]')]
        .map((n) => n.getAttribute('data-pinned-row'))
        .join(',') === 'milestones,letters,wear'
  );
  await check('Empty pin arrangement keeps edit entry point', async () => {
    prefs.pinnedRows = [];
    flushSync();
    await until(
      () => root().querySelector('[data-edit-today]') && !root().querySelector('[data-pinned-row]'),
      'empty pins'
    );
    return node(root(), '[data-edit-today]').textContent?.includes(m.home_pinned_edit_empty());
  });
  await check('Home editor opens in place', async () => {
    node(root(), '[data-edit-today]').click();
    return await until(() => root().querySelector('[data-home-editing]'), 'Home editor');
  });
  await screen.remove();
  const before = (await f.journal.tally.getEventsOnDay(today)).length;
  screen = await mountScreen('/?tally=misgendered', f);
  await check('Widget tally deep link still writes a tally', async () => {
    await until(() => root().querySelector('[data-home-log]'), 'tally Home');
    for (let i = 0; i < 100; i++) {
      if ((await f.journal.tally.getEventsOnDay(today)).length === before + 1) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  });
  await screen.remove();
  screen = await mountScreen('/more', f);
  await check('More keeps Safe Space and milestones destinations', async () => {
    await until(() => root().querySelector('a[href="/doubt"]'), 'More rows');
    return root().querySelector('a[href="/transition/milestones"]');
  });
  await screen.remove();
  const promptEntry = (await f.journal.entries.entriesForDay(today))[0];
  screen = await mountScreen(`/?quickLogDims=${promptEntry.id}`, f);
  await until(() => root().querySelector('[data-home-log] [data-mood="4"]'), 'quick mood');
  await check('Quick mood opens dimension prompt with add and skip handles', async () => {
    await until(() => root().querySelector('[data-quick-log-dims]'), 'dimension prompt');
    return (
      root().querySelector('[data-qld-input]') &&
      root().querySelector('[data-qld-add]') &&
      root().querySelector('[data-qld-skip]')
    );
  });
  await screen.remove();
  const fanTarget = document.createElement('div');
  document.querySelector('#screens')!.replaceChildren(fanTarget);
  const fan = mountInto(QuickAdd, {}, fanTarget);
  flushSync();
  await check('Quick add retains dose, tally and wear write shapes', async () => {
    ui.chooserOpen = true;
    flushSync();
    await until(() => fanTarget.querySelector('[data-choose="dose"]'), 'quick add');
    return ['dose', 'tally-misgendered', 'tally-correctly_gendered', 'wear'].every((key) =>
      fanTarget.querySelector(`[data-choose="${key}"]`)
    );
  });
  ui.chooserOpen = false;
  await fan.remove();
  await f.journal.wearSessions.upsertSession({
    kind: 'binder',
    startTimestamp: Date.now() - 3600000,
    durationMs: null
  });
  await f.journal.procedures.upsertProcedure({
    name: 'Contract surgery',
    surgeryEpochDay: today + 10
  });
  await f.journal.letters.addLetter({
    epochDay: today - 3,
    unlockEpochDay: today - 1,
    text: 'Sealed contract letter'
  });
  const held = heldReads(f, ['procedures']);
  screen = await mountScreen('/', held.fixture);
  await check('Home holds live tile composition until slowest initial read settles', async () => {
    await until(() => root().querySelector('[data-home-log]'), 'held Home');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return (
      !root().querySelector('[data-live-tile],[data-home-tiles-fold],[data-home-agenda]') &&
      root().querySelector('[data-read-reserve-hold]')
    );
  });
  held.release();
  await until(() => root().querySelector('[data-live-tile="wear-timer"]'), 'running wear tile');
  await check('Home live tiles retain registry keys and running versus waiting weights', () => {
    const wear = node(root(), '[data-live-tile="wear-timer"]');
    const surgery = node(root(), '[data-live-tile="surgery-countdown"]');
    return (
      wear.getAttribute('data-weight') === 'row' &&
      surgery.getAttribute('data-weight') === 'card' &&
      root().querySelector('[data-live-tile="ready-letter"]')
    );
  });
  await check('Running tier leads agenda and mood log', () => {
    const wear = node(root(), '[data-live-tile="wear-timer"]');
    return !!(
      wear.compareDocumentPosition(node(root(), '[data-home-agenda]')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  await check('Backup notice stays below mood strip and out of agenda', () => {
    const notice = node(root(), '[data-backup-notice]');
    return (
      !!(
        node(root(), '[data-home-log]').compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ) && !node(root(), '[data-home-agenda]').contains(notice)
    );
  });
  await screen.remove();
  await f.journal.journalingPauses.upsertPause({
    startEpochDay: today - 2,
    endEpochDay: null
  });
  await f.journal.entries.upsertEntry({ epochDay: today, mood: 1, note: 'Difficult contract day' });
  screen = await mountScreen('/', f);
  await until(() => root().querySelector('[data-home-tiles-fold]'), 'live tile overflow');
  await check(
    'Live tile overflow is named button with collapsed state',
    () =>
      node(root(), '[data-home-tiles-fold]').tagName === 'BUTTON' &&
      node(root(), '[data-home-tiles-fold]').getAttribute('aria-expanded') === 'false'
  );
  await check('Live tile overflow expands in place without losing registry keys', async () => {
    const before = root().querySelectorAll('[data-live-tile]').length;
    node(root(), '[data-home-tiles-fold]').click();
    await until(
      () => root().querySelectorAll('[data-live-tile]').length > before,
      'expanded tiles'
    );
    return (
      node(root(), '[data-home-tiles-fold]').getAttribute('aria-expanded') === 'true' &&
      root().querySelector('[data-live-tile="safe-space-nudge"]') &&
      root().querySelector('[data-live-tile="pause-active-banner"]')
    );
  });
  await screen.remove();
  screen = await mountScreen('/?celebrate=1', {
    ...f,
    preferences: { ...f.preferences, a11yMotionReduce: false }
  });
  await check('Milestone celebration plays once and stops under reduced motion', () => {
    const particles = [...root().querySelectorAll('.home-cheer i')];
    const once =
      particles.length > 0 &&
      particles.every((n) => getComputedStyle(n).animationIterationCount === '1');
    document.documentElement.dataset.a11yMotion = 'reduce';
    return once && particles.every((n) => getComputedStyle(n).animationName === 'none');
  });
  await screen.remove();
  return results;
}
