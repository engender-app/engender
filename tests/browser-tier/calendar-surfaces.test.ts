import { flushSync } from 'svelte';
import { mountScreen, until } from './mount-screen';
import {
  fixture,
  assertions,
  node,
  style,
  today,
  heldReads,
  type Result
} from './screen-contracts/fixture';
import { setScreenRoute } from './screen-router.svelte';
import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
import { activeFlag, refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import { openEntryContainer, closeEntryContainer } from '$lib/motion/container.svelte';
import { pickRecording } from '$lib/stores/voiceRecording';
import { pickVideo } from '$lib/stores/videoRecording';
import { VIDEO_SIZE_CEILING } from '$lib/data/videoNotes/limits';
import { m } from '$lib/paraglide/messages';
import { MOOD_FACES } from '$lib/components/moodFace';
import overlongVideo from './screen-contracts/overlong.webm?url';
import { fmtDay } from '$lib/data/dates';

async function choose(work: () => Promise<Uint8Array | null>, file: File) {
  const result = work();
  const input = await until(
    () => document.querySelector<HTMLInputElement>('input[type=file]'),
    'file input'
  );
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change'));
  return result;
}

export async function calendarContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const f = await fixture('calendar', 65);
  await f.journal.appointments.upsertAppointment({
    epochDay: today + 1,
    procedureId: null,
    kind: 'Private kind',
    place: 'Private place',
    note: null
  });
  let screen = await mountScreen('/calendar', f);
  const root = () => screen.target;
  await until(() => root().querySelector('[data-entry-card]'), 'calendar entries');
  await check(
    'Calendar keeps named title and shared surfaces',
    () =>
      root().querySelector('[data-screen-title="calendar"]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state')
  );

  for (const handle of ['cal-month', 'cal-step', 'cal-open'])
    await check(`Calendar keeps data-${handle}`, () => root().querySelector(`[data-${handle}]`));
  await check(
    'Calendar uses shared entry handles and no duplicate week',
    () =>
      root().querySelector('[data-entry-note]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state,[data-week-strip]')
  );
  await check('Earlier entries grows five days at a tap', async () => {
    const count = root().querySelectorAll('[data-entry-card]').length;
    const more = node(root(), '[data-recent-days-more]');
    more.click();
    await until(
      () => root().querySelectorAll('[data-entry-card]').length > count,
      'earlier entries'
    );
    return root().querySelectorAll('[data-entry-card]').length === count + 5;
  });
  node(root(), '[data-cal-open]').click();
  await until(() => root().querySelector('[data-cal-month-state="grid"]'), 'expanded calendar');
  await until(() => root().querySelector('[aria-busy="false"]'), 'heatmap reads');
  const splitDay = today - 1;
  const cell = () => node(root(), `[data-cal-cell="${splitDay}"]`);
  await check(
    'Two readings render earlier and later halves, pip and no stack',
    () =>
      cell().querySelector('[data-hm-cell-split]') &&
      cell().querySelectorAll('.cal-half').length === 2 &&
      !cell().querySelector('[data-hm-cell-stack]') &&
      node(root(), `[data-cal-date="${splitDay}"]`).querySelector('.cal-pip')
  );
  await check(
    'Split mood day renders two active half faces',
    () =>
      cell().querySelectorAll('.cal-face.is-on').length === 2 &&
      cell().querySelector('.cal-face.is-earlier.is-on') &&
      cell().querySelector('.cal-face.is-later.is-on')
  );
  await check('Earlier and later halves preserve exact logged mood colors and faces', async () => {
    const sample = document.createElement('span');
    sample.style.transition = 'none';
    root().append(sample);
    const colors = [1, 5].map((step) => {
      sample.style.background = `var(--mood-${step})`;
      return getComputedStyle(sample).backgroundColor;
    });
    sample.remove();
    await until(
      () =>
        ['earlier', 'later'].every(
          (side, i) => style(cell(), `.cal-half.is-${side}`).backgroundColor === colors[i]
        ),
      `logged split colors ${colors.join(', ')}`
    );
    for (const [i, side] of ['earlier', 'later'].entries()) {
      const actual = node(cell(), `.cal-face.is-${side} .mood-face-mouth`).getAttribute('d');
      const expected = MOOD_FACES[i === 0 ? 1 : 5].mouth;
      if (actual !== expected)
        throw new Error(`${side} mood mouth: ${actual}; expected ${expected}`);
    }
    return true;
  });
  await check('Face and fill clip along identical cuts with two-pixel gutter', () => {
    return (
      ['earlier', 'later'].every(
        (side) =>
          style(cell(), `.cal-half.is-${side}`).clipPath ===
          style(cell(), `.cal-face.is-${side}`).clipPath
      ) && style(cell(), '.cal-half.is-earlier').clipPath.includes('1px')
    );
  });
  await check('Mood has no ramp legend', () => !root().querySelector('[data-cal-legend]'));
  await check('Date sits outside fill and uses page ink', () => {
    const date = node(root(), `[data-cal-date="${splitDay}"]`);
    return (
      !cell().contains(date) &&
      style(date, '.cal-num').color === getComputedStyle(node(root(), '.screen')).color
    );
  });
  await check('Filled cells link to their day', () =>
    node(root(), '[data-hm-cell-filled]').getAttribute('href')?.startsWith('/day/')
  );
  await check('Future mark links to day and reveals date only', () => {
    const mark = node(root(), `[data-hm-cell-mark][href="/day/${today + 1}"]`);
    if (
      mark.getAttribute('aria-label') !==
      m.heat_cell_coming_up({ date: fmtDay(today + 1, { day: 'numeric', month: 'long' }) })
    )
      throw new Error(
        JSON.stringify({
          actual: mark.getAttribute('aria-label'),
          expected: m.heat_cell_coming_up({
            date: fmtDay(today + 1, { day: 'numeric', month: 'long' })
          })
        })
      );
    return (
      mark.querySelector('[data-hm-cell-mark-dot]') &&
      !/Private kind|Private place|in 1 day/.test(mark.getAttribute('aria-label')!) &&
      mark.getAttribute('aria-label') ===
        m.heat_cell_coming_up({ date: fmtDay(today + 1, { day: 'numeric', month: 'long' }) })
    );
  });
  await check('Today and past never carry future marks', () =>
    [...root().querySelectorAll('[data-hm-cell-mark]')].every(
      (n) => Number(n.getAttribute('href')!.split('/').pop()) > today
    )
  );
  await check('Empty future day has no link or mark', () => {
    const empty = node(root(), `[data-cal-cell="${today + 2}"]`).parentElement!;
    return empty.tagName === 'SPAN' && !empty.hasAttribute('data-hm-cell-mark');
  });
  await check(
    'Dimension removes faces, uses one chromatic flag ramp and native endpoints',
    async () => {
      selectMetric('euphoria_dysphoria');
      flushSync();
      await until(
        () => root().querySelector('[data-cal-legend]') && !root().querySelector('.cal-face.is-on'),
        'dimension heatmap'
      );
      const legend = node(root(), '[data-cal-legend]').textContent!;
      return (
        !/best|worst|better|worse/i.test(legend) &&
        !!legend.trim() &&
        style(cell(), '.cal-half.is-earlier').backgroundColor !==
          style(cell(), '.cal-half.is-later').backgroundColor
      );
    }
  );
  await check('Calendar responds to shell palette updates without stale roles', async () => {
    prefs.palette = 'agender';
    document.documentElement.dataset.palette = 'agender';
    refreshActiveFlag(document, false);
    flushSync();
    const sample = document.createElement('span');
    sample.style.background = activeFlag.roles[0].heat[4].fill;
    root().append(sample);
    const fill = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return await until(
      () => style(cell(), '.cal-half.is-later').backgroundColor === fill,
      `palette fill ${fill}`
    );
  });
  await screen.remove();
  const entries = await f.journal.entries.entriesForDay(splitDay);
  screen = await mountScreen(`/day/${splitDay}`, f);
  await until(() => root().querySelector('[data-entry-card]'), 'day records');
  await check(
    'Day keeps named title and shared surfaces',
    () =>
      root().querySelector('[data-screen-title="day"]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state')
  );

  await check(
    'Day keeps add and shared entry handles and named title',
    () =>
      root().querySelector('[data-add]') &&
      root().querySelector('[data-entry-note]') &&
      root().querySelector('[data-screen-title="day"]') &&
      !root().querySelector('[data-day-entry-row],.card,.list-group,.list-row')
  );
  await check('Entry card names transform synchronously before click navigation', () => {
    document.documentElement.dataset.a11yMotion = 'full';
    openEntryContainer(String(entries[0].id));
    return [...root().querySelectorAll('[data-entry-card] *')].some(
      (n) => getComputedStyle(n).viewTransitionName === 'entry-open'
    );
  });
  await screen.remove();
  screen = await mountScreen(`/entry/${entries[0].id}`, {
    ...f,
    preferences: { ...f.preferences, a11yMotionReduce: false }
  });
  await check(
    'Editor transform names from route before entry read lands',
    () =>
      root().querySelector('[style*="entry-open"]') ||
      [...root().querySelectorAll('*')].some(
        (n) => getComputedStyle(n).viewTransitionName === 'entry-open'
      )
  );
  await until(
    () => root().querySelector<HTMLTextAreaElement>('#ed-note')?.value === entries[0].note,
    'first entry editor'
  );
  await check(
    'Existing Entry keeps named title and shared surfaces',
    () =>
      root().querySelector('[data-screen-title="entry"]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state')
  );
  await check('Changing existing entry id remounts editor with second entry data', async () => {
    setScreenRoute(`/entry/${entries[1].id}`);
    flushSync();
    return await until(
      () => root().querySelector<HTMLTextAreaElement>('#ed-note')?.value === entries[1].note,
      'second entry editor'
    );
  });
  await check('Clearing transform removes editor name immediately', () => {
    closeEntryContainer();
    flushSync();
    return ![...root().querySelectorAll('*')].some(
      (n) => getComputedStyle(n).viewTransitionName === 'entry-open'
    );
  });
  await check('Reduced motion names no entry transform', () => {
    document.documentElement.dataset.a11yMotion = 'reduce';
    openEntryContainer(String(entries[1].id));
    flushSync();
    return ![...root().querySelectorAll('*')].some(
      (n) => getComputedStyle(n).viewTransitionName === 'entry-open'
    );
  });
  await screen.remove();
  for (const seed of ['1', '5', '0', '6', '2.5', 'broken']) {
    screen = await mountScreen(`/entry/new/${today}?seedMood=${seed}`, f);
    await until(() => root().querySelector('[data-save]'), 'new editor');
    await check(`Launch seedMood ${seed} respects integer 1..5 contract`, () => {
      const picked = root().querySelector('[data-mood][aria-checked="true"]');
      return ['1', '5'].includes(seed) ? picked?.getAttribute('data-mood') === seed : !picked;
    });
    await screen.remove();
  }
  screen = await mountScreen(`/entry/new/${today}`, f);
  await until(() => root().querySelector('[data-save]'), 'editor ready');
  await check(
    'New Entry keeps named title and shared surfaces',
    () =>
      root().querySelector('[data-screen-title="entry"]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state')
  );

  await check(
    'Editor keeps save, template, note and shared mood handles',
    () =>
      root().querySelector('[data-use-template]') &&
      root().querySelector('#ed-note') &&
      root().querySelectorAll('[data-mood]').length === 5 &&
      root().querySelector('[data-screen-title="entry"]')
  );
  for (const section of ['voice', 'video']) {
    node(root(), `[data-section-chip="${section}"]`).click();
    await until(
      () => root().querySelector(`[data-editor-section="${section}"]`),
      `${section} editor section`
    );
    await check(
      `Editor offers both file and record controls for ${section}`,
      () =>
        root().querySelector(
          section === 'voice' ? '[data-add-recording-file]' : '[data-add-video-file]'
        ) &&
        root().querySelector(
          `[aria-label="${section === 'voice' ? m.add_recording() : m.add_video()}"]`
        )
    );
  }
  await check(
    'Recording picker rejects wrong MIME despite dialog hint',
    async () =>
      (await choose(pickRecording, new File(['wrong'], 'wrong.txt', { type: 'text/plain' }))) ===
      null
  );
  await check(
    'Video picker rejects wrong MIME despite dialog hint',
    async () =>
      (await choose(pickVideo, new File(['wrong'], 'wrong.txt', { type: 'text/plain' }))) === null
  );
  await check('Video picker rejects real metadata beyond thirty-second limit', async () => {
    const bytes = await (await fetch(overlongVideo)).arrayBuffer();
    return (
      (await choose(pickVideo, new File([bytes], 'overlong.webm', { type: 'video/webm' }))) === null
    );
  });
  await check(
    'Video picker refuses oversized file when re-encoding cannot decode it',
    async () =>
      (await choose(
        pickVideo,
        new File([new Uint8Array(VIDEO_SIZE_CEILING + 1)], 'invalid.webm', { type: 'video/webm' })
      )) === null
  );
  await check(
    'Recording picker refuses bytes over archive ceiling',
    async () =>
      (await choose(
        pickRecording,
        new File([new Uint8Array(VIDEO_SIZE_CEILING + 1)], 'large.webm', { type: 'audio/webm' })
      )) === null
  );
  await screen.remove();
  await f.journal.letters.addLetter({
    epochDay: today - 2,
    unlockEpochDay: today - 1,
    text: 'Contract elsewhere'
  });
  screen = await mountScreen('/search', f);
  await until(() => root().querySelector('.search-input'), 'search');
  await check(
    'Search keeps named title and shared surfaces',
    () =>
      root().querySelector('[data-screen-title="search"]') &&
      !root().querySelector('.card,.list-group,.list-row,.empty-state')
  );

  const search = node(root(), '.search-input') as HTMLInputElement;
  search.value = 'Contract';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => root().querySelector('[data-search-more]'), 'search results');
  await check(
    'Search renders first thirty results and reports full entries-plus-records match count',
    () =>
      root().querySelectorAll('[data-entry-card]').length === 30 &&
      /66/.test(node(root(), '[data-search-count]').textContent!)
  );
  await check('Scroll does not load next search page', async () => {
    root().dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    return root().querySelectorAll('[data-entry-card]').length === 30;
  });
  await check('Search explicit next page appends thirty results', async () => {
    node(root(), '[data-search-more]').click();
    return await until(
      () => root().querySelectorAll('[data-entry-card]').length === 60,
      'second page'
    );
  });
  await check('Changing search resets page size', async () => {
    search.value = 'entry';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return await until(
      () => root().querySelectorAll('[data-entry-card]').length === 30,
      'new search first page'
    );
  });
  await check(
    'Search day bar does not invent total entries on filtered day',
    () => !root().querySelector('.kit-day-aside,[data-day-entry-row]')
  );
  node(root(), '[data-filter-toggle]').click();
  await until(() => document.querySelector('[data-filter-mood]'), 'filter sheet');
  for (const handle of [
    'filter-mood',
    'filter-has-note',
    'filter-has-photo',
    'filter-start',
    'filter-end'
  ])
    await check(`Search filter sheet keeps data-${handle}`, () =>
      document.querySelector(`[data-${handle}]`)
    );
  await check('Active filters remain visible after sheet closes and can be cleared', async () => {
    node(document, '[data-filter-mood="5"]').click();
    await until(() => root().querySelector('[data-active-filter-chip]'), 'active filter');
    return root().querySelector('[data-filter-clear]');
  });
  await screen.remove();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((value) => resolve(value!), 'image/jpeg')
  );
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const photoId = await f.journal.photos.attach(
    { entryId: entries[0].id },
    { full: jpeg, thumb: jpeg }
  );
  await f.journal.photos.setStarred(photoId, true);
  screen = await mountScreen('/search?q=Contract&starred=1', f);
  await check(
    'Starred search total includes entry, elsewhere record and starred photo',
    async () => {
      await until(() => root().querySelector('[data-starred-photos]'), 'starred photos');
      await until(
        () =>
          node(root(), '[data-search-count]').textContent?.trim() === m.results_count({ count: 3 }),
        'combined starred count'
      );
      return (
        root().querySelectorAll('[data-entry-card]').length === 1 &&
        root().querySelectorAll('.starred-photo-cell').length === 1
      );
    }
  );
  await screen.remove();
  for (const route of [`/day/${splitDay}`, '/search?q=Contract', `/entry/${entries[0].id}`]) {
    const held = heldReads(f, ['entries']);
    screen = await mountScreen(route, held.fixture);
    await check(`Loading ${route.split('?')[0]} waits with skeleton before records`, async () => {
      await until(() => root().querySelector('[data-skeleton]'), 'held entry-data skeleton');
      return !root().querySelector('[data-entry-card],#ed-note');
    });
    held.release();
    await until(
      () => !root().querySelector('[data-skeleton]') || null,
      'entry-data loading settles'
    );
    await screen.remove();
  }
  const held = heldReads(f, ['stats', 'dayAhead']);
  screen = await mountScreen('/calendar', held.fixture);
  node(root(), '[data-cal-open]').click();
  await check('Calendar keeps full grid busy without claims while reads are held', async () => {
    await until(() => root().querySelector('[data-cal-grid][aria-busy="true"]'), 'held heatmap');
    return (
      root().querySelectorAll('[data-cal-cell]').length > 27 &&
      !root().querySelector('[data-hm-cell-filled],[data-hm-cell-mark],[data-hm-cell-split]')
    );
  });
  held.release();
  await check('Calendar publishes claims only after all held reads settle', async () => {
    await until(
      () => root().querySelector('[data-cal-grid][aria-busy="false"]'),
      'settled heatmap'
    );
    return (
      root().querySelector('[data-hm-cell-filled]') && root().querySelector('[data-hm-cell-mark]')
    );
  });
  await screen.remove();
  return results;
}
