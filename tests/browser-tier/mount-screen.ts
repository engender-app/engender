import { flushSync, tick, type Component } from 'svelte';
import type { Journal } from '$lib/data/journal/journal';
import type { PreferenceValues } from '$lib/data/prefs/catalogue';
import { prefs } from '$lib/data/prefs/store.svelte';
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import { mountInto } from './mount';
import { prepareScreenJournal } from './screen-journal';
import { setScreenRoute } from './screen-router.svelte';
import Home from '../../src/routes/+page.svelte';
import Calendar from '../../src/routes/calendar/+page.svelte';
import Settings from '../../src/routes/settings/+page.svelte';
import Day from '../../src/routes/day/[day]/+page.svelte';
import Search from '../../src/routes/search/+page.svelte';
import Entry from '../../src/routes/entry/[id]/+page.svelte';
import NewEntry from '../../src/routes/entry/new/[day]/+page.svelte';
import More from '../../src/routes/more/+page.svelte';
import Stats from '../../src/routes/stats/+page.svelte';
import Milestones from '../../src/routes/transition/milestones/+page.svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import '$lib/motion/materials.css';

export interface ScreenFixture {
  journal: Journal;
  preferences?: Partial<PreferenceValues>;
  width?: number;
  /** Set by a fixture that already knows whether its journal contains entries. */
  hasEntries?: boolean;
}

function componentFor(route: string): Component {
  const path = new URL(route, location.origin).pathname;
  const routes: Record<string, Component> = {
    '/': Home,
    '/calendar': Calendar,
    '/settings': Settings,
    '/search': Search,
    '/more': More,
    '/stats': Stats,
    '/transition/milestones': Milestones
  };
  if (routes[path]) return routes[path];
  if (path.startsWith('/entry/new/')) return NewEntry;
  if (path.startsWith('/entry/')) return Entry;
  if (path.startsWith('/day/')) return Day;
  throw new Error(`unsupported screen fixture route: ${route}`);
}

/** Renders real route markup over the caller's seeded, already-open journal. */
export async function mountScreen(route: string, fixture: ScreenFixture) {
  await prepareScreenJournal(fixture.journal);
  Object.assign(prefs, fixture.preferences);
  document.documentElement.dataset.palette = prefs.palette;
  document.documentElement.dataset.moodPreset = prefs.moodPreset;
  document.documentElement.dataset.theme = prefs.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.a11yMotion = prefs.a11yMotionReduce ? 'reduce' : 'full';
  refreshActiveFlag(document, prefs.disguise);
  localStorage.setItem('engender-has-entries', fixture.hasEntries === false ? '0' : '1');
  setScreenRoute(route);
  const target = document.createElement('div');
  target.className = 'app-viewport';
  const app = document.createElement('div');
  app.className = 'app';
  const column = document.createElement('div');
  column.className = 'app-column';
  const main = document.createElement('main');
  main.className = 'app-main';
  column.append(main);
  app.append(column);
  target.append(app);
  target.style.cssText = `width:${fixture.width ?? 390}px;container:app / inline-size;`;
  document.querySelector('#screens')!.replaceChildren(target);
  const mounted = mountInto(componentFor(route), {}, main);
  flushSync();
  await tick();
  return { target, remove: mounted.remove };
}

export async function until<T>(
  read: () => T | null | undefined | false,
  label: string
): Promise<T> {
  for (let i = 0; i < 400; i++) {
    flushSync();
    const result = read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}
