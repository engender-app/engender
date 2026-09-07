import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* One per-screen header, and it stays one (phase 5 ticket 18).

   The state this replaced was 56 hand-written header blocks that had
   drifted from each other in small ways, so the thing worth guarding is
   not how the header looks - that is ScreenHeader.svelte's own business and
   restyling it should not fail a test - but that no screen goes back to
   writing its own.

   That is a negative over every .svelte file in the repo, so it is a grep
   and could not be anything else (ticket 08). */

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const svelteFiles = globSync('src/**/*.svelte', { cwd: root });

/* The screens that deliberately do not take this header, each with a header
   of its own that another ticket owns. Listed rather than inferred, so
   adding a headerless screen is a decision someone writes down.

   /settings/lock left this list with ticket 53: the app-lock gate it framed
   is retired, and its replacement is a chromeless gate the layout renders
   rather than a route. */
const WITHOUT = new Map([
  ['src/routes/+page.svelte', 'Home wears the flag sun as its header (ticket 19)'],
  ['src/routes/entry/[id]/+page.svelte', 'renders EntryEditor, which carries the header'],
  ['src/routes/entry/new/[day]/+page.svelte', 'renders EntryEditor, which carries the header'],
  ['src/routes/onboarding/+page.svelte', 'chromeless, and its own first-run flow'],
  ['src/routes/settings/live-tiles/+page.svelte', 'redirects to /settings/notifications and renders nothing (deepening ticket 09)']
]);

describe('every screen gets its header from one component', () => {
  it('leaves no hand-written header markup outside ScreenHeader.svelte', () => {
    const offenders = svelteFiles.filter(
      (file) =>
        file !== 'src/lib/components/ScreenHeader.svelte' &&
        /class="screen-(header|title)/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it('leaves the back control to the header too', () => {
    /* CARPET-05 put "back goes to the last screen you were actually on"
       inside this one component, where a href becomes the fallback rather
       than the destination. A screen that draws its own arrow gets none of
       that, and the header's grep above would not notice, because it is
       looking at the title and the block around it. */
    const offenders = svelteFiles.filter(
      (file) => file !== 'src/lib/components/ScreenHeader.svelte' && read(file).includes('data-screen-back')
    );
    expect(offenders).toEqual([]);
  });

  it('gives every route screen a header, or names why it has none', () => {
    const routes = svelteFiles.filter((file) => file.endsWith('+page.svelte'));
    const missing = routes.filter(
      (file) => !read(file).includes('<ScreenHeader') && !WITHOUT.has(file)
    );
    expect(missing).toEqual([]);
  });

  it('does not keep an exemption for a screen that has since taken the header', () => {
    /* The other direction: an exemption nobody removed reads as a decision
       when it is really a stale line. */
    const stale = [...WITHOUT.keys()].filter((file) => read(file).includes('<ScreenHeader'));
    expect(stale).toEqual([]);
  });

  it('does not repeat a tab name in the screen that tab opens', () => {
    /* DIRECTION.md 3d. Written as the rule rather than as a list of the
       screens that happen to follow it: a screen whose title is the very
       message its tab is labelled with has to hide it, so adding a fifth
       tab or renaming one cannot quietly leave a screen repeating itself.

       Stats is the exception DIRECTION names outright - "Stats keeps its
       title because the subtitle there carries the active period" - so it
       is listed here rather than derived. It used to satisfy the rule by
       accident, through a stats_title that read "Stats · last 30 days" and
       had no subtitle under it at all; phase 5 UX ticket 23 split that into
       the title the tab is named with and the period beneath it, which is
       the header shape every other screen already has and the one 3d
       describes. A title doing two jobs was the thing to fix, not the
       repetition. */
    const TAB_TITLES = new Map([
      ['src/routes/calendar/+page.svelte', 'm.nav_calendar()'],
      ['src/routes/more/+page.svelte', 'm.nav_more()']
    ]);

    const repeating: string[] = [];
    for (const [file, tabTitle] of TAB_TITLES) {
      const header = read(file).match(/<ScreenHeader[^>]*\/?>/s)?.[0] ?? '';
      if (header.includes(`title={${tabTitle}}`) && !header.includes('titleHidden')) {
        repeating.push(file);
      }
    }
    expect(repeating).toEqual([]);
  });
});
