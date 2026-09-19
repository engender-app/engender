/* The foot belongs to the frame (carpet 26).

   What this holds is the mechanism, because the mechanism is the fix. A
   sticky footer at the end of the content column covers whatever the column
   happens to have at its height and no arithmetic inside the column can
   move it: padding pushes the sticky box down with it, a margin buys scroll
   travel and changes nothing at rest. The answer is that the foot is not in
   the scroll region at all - it is the region's flex sibling, so the region
   is a foot shorter and nothing is ever under it. The measurement lives in
   `tests/savebar-clearance-gallery.mjs` and in carpet 28's occlusion pass;
   what a source scan can hold is that the parts are still wired that way,
   which is what would rot first.

   These are `.svelte` files and the node tier cannot mount one (ADR-0016),
   so this reads them, as the other shape contracts in this directory do. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Every `.svelte`, `.css` and `.ts` file under src, with its text. */
function sources(dir = join(root, 'src'), found: { path: string; text: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'paraglide') continue;
      sources(path, found);
    } else if (/\.(svelte|css|ts)$/.test(entry.name)) {
      found.push({ path: path.slice(root.length), text: readFileSync(path, 'utf8') });
    }
  }
  return found;
}

const layout = read('src/routes/+layout.svelte');
const appCss = read('src/lib/styles/app.css');
const store = read('src/lib/stores/saveBar.svelte.ts');
const component = read('src/lib/components/SaveBar.svelte');

describe('the foot is the frame\'s, not the screen\'s', () => {
  it('is written as <SaveBar> on every screen that has one, and nowhere as a block in the column', () => {
    const offenders = sources()
      .filter(({ text }) => /class=("|')[^"']*\beditor-savebar\b/.test(text) || /\.editor-savebar\b/.test(text))
      .map(({ path }) => path);
    expect(offenders, 'the sticky footer retired with carpet 26').toEqual([]);

    /* Twelve feet over ten files: the entry editor, two settings screens,
       wrapped's share screen, the photo export, the compare tab, the two
       print surfaces' scoped print actions (ticket 34), and two each in
       the two voice components, whose branches are exclusive. A thirteenth
       is a screen that has to be measured, which is why the number
       is written down rather than counted at read time. */
    const feet = sources().filter(({ path, text }) => path.endsWith('.svelte') && text.includes('<SaveBar'));
    const count = feet.reduce((n, { text }) => n + (text.match(/<SaveBar/g)?.length ?? 0), 0);
    expect(feet.map(({ path }) => path).sort()).toEqual([
      'src/lib/components/EntryEditor.svelte',
      'src/lib/components/VoiceBenchmarkFlow.svelte',
      'src/lib/components/VoicePractice.svelte',
      'src/routes/health/clinician-summary/+page.svelte',
      'src/routes/media/photos/export/+page.svelte',
      'src/routes/settings/dimension/+page.svelte',
      'src/routes/settings/journal-book/+page.svelte',
      'src/routes/settings/reminders/[id]/+page.svelte',
      'src/routes/voice/+page.svelte',
      'src/routes/wrapped/[cadence]/share/+page.svelte'
    ]);
    expect(count).toBe(12);
    for (const { path, text } of feet) {
      expect(text, `${path} draws a foot without importing one`).toContain(
        "import SaveBar from '$lib/components/SaveBar.svelte';"
      );
    }
  });

  it('hosts the foot in the app column, outside the scroll region', () => {
    /* The move, and the box it moves into. A foot left where it is written
       is a foot inside `[data-app-scroll-region]`, which is the defect. */
    expect(component).toContain('use:hostSaveBar');
    expect(store).toContain("export const COLUMN = '[data-app-column]'");
    expect(store).toMatch(/querySelector\(COLUMN\)/);
    expect(store).toMatch(/column\.append\(node\)/);

    const column = layout.slice(layout.indexOf('<main class="app-column"'), layout.indexOf('</main>'));
    expect(column, 'the column wraps the scroll region').toContain('data-app-column');
    expect(column).toContain('<div class="app-main" data-app-scroll-region');
    /* The landmark is the column's, so the foot - which is outside the
       scroll region by design - is still inside <main> rather than being a
       group of controls in no landmark at all. */
    expect(layout).toMatch(/<main class="app-column"/);
    expect(layout).not.toMatch(/<main class="app-main"/);
    expect(layout, "the column knows when it is holding a foot").toContain(
      'class:has-savebar={saveBar.count > 0}'
    );
  });

  it('reserves the foot by layout and the floating bar by clearance, never both at once', () => {
    /* The scroll region reserves --nav-clearance for the bar that floats
       over it. The foot does not float over anything: it holds the bar's
       room in its own padding, so a region that also reserved the
       clearance would count the bar twice - which is the trade the sticky
       version's negative offset was undoing. */
    expect(appCss).toMatch(/\.app-column\s*\{[^}]*flex:\s*1/);
    expect(appCss).toMatch(/\.app-column\s*\{[^}]*flex-direction:\s*column/);
    expect(appCss).toMatch(/\.app-column\.has-savebar\s*>\s*\.app-main\s*\{\s*padding-bottom:\s*0;\s*\}/);
    expect(appCss).toMatch(
      /\.app-savebar\s*\{[^}]*padding:\s*var\(--space-3\) var\(--space-5\) calc\(var\(--nav-clearance\) - var\(--space-5\) \+ var\(--space-2\)\)/
    );
    /* Opaque, because the room is taken and given back under it: a
       see-through foot makes both swaps a band of content vanishing in one
       frame ($lib/motion/foot). */
    const foot = appCss.slice(appCss.indexOf('.app-savebar {'));
    expect(foot.slice(0, foot.indexOf('}'))).toMatch(/background:\s*var\(--bg\)/);
    /* Nothing pins it. A `position` on the foot would put it back over the
       column at whichever end of the frame it stuck to. */
    const rule = appCss.slice(appCss.indexOf('.app-savebar {'));
    expect(rule.slice(0, rule.indexOf('}'))).not.toMatch(/position:\s*(sticky|fixed|absolute)/);
  });

  it('names the screen group on the column, so a foot cannot resize the snapshot', () => {
    /* A view transition group holds one box for both sides, so a name on
       the scroll region would hand the browser a box a foot shorter on one
       side of a navigation than on the other, and a tween of the box is a
       scale of the picture in it. */
    expect(appCss).toContain('.app-column { view-transition-name: screen; }');
    expect(appCss).not.toMatch(/\.app-main\s*\{\s*view-transition-name/);
  });

  it('keeps the foot inside the instrument that measures it', () => {
    /* Carpet 28's census counts the audited variants in `src/` as well as
       in the walk, so a renamed surface silently drops out of the sweep
       rather than failing it. */
    const sweep = read('tests/cohesion-sweep-gallery.mjs');
    expect(sweep).toContain("const AUDITED = ['.card', '.app-savebar']");
  });

  it('never prints an empty SaveBar frame', () => {
    const print = appCss.slice(appCss.indexOf('@media print'));
    expect(print).toMatch(/\.app-savebar\s*\{\s*display:\s*none\s*!important;/);
  });
});
