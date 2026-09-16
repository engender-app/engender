/* The rules Settings keeps after the rebuild (phase 5 ticket 24), at the
   level a screen's source can be held to - mirrors home-surfaces.test.ts and
   more-surfaces.test.ts.

   Sheets are not a surface (home-surfaces.test.ts's own note): the metric,
   disguise and about sheets keep the old `.list-group`/`.list-row`/`.card`
   vocabulary inside <Sheet>, so this file's "no card of its own" check
   strips every <Sheet>...</Sheet> block first, the same way the script
   block is stripped. The scales sheet is the exception and is on the kit
   already - phase 5 ticket 35 put the checklist there, and it is the same
   component the first run draws.

   Greps by design (ticket 08): every assertion here is a class that may
   not appear or a component that has to, which is a negative or a wiring
   over a file rather than a rule with a return value. Anything on this
   screen that decides something lives in a module with a test that calls
   it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTES } from './palettes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const settings = read('src/routes/settings/+page.svelte');
const withoutScript = settings.replace(/<script[\s\S]*?<\/script>/g, '');
const outsideSheets = withoutScript.replace(/<Sheet\b[\s\S]*?<\/Sheet>/g, '');

describe('what Settings is built from', () => {
  it('takes its screen-level containers from the kit outside of sheets', () => {
    expect(outsideSheets).not.toMatch(/class="[^"]*\bcard\b/);
    expect(outsideSheets).not.toMatch(/class="[^"]*\blist-group\b/);
    expect(settings).not.toContain('SectionTitle');
    expect(settings).toContain("from '$lib/components/kit/ListCard.svelte'");
    expect(settings).toContain("from '$lib/components/kit/ListRow.svelte'");
    expect(settings).toContain("from '$lib/components/kit/SectionHeading.svelte'");
    /* The wrapped/on-this-day permission notice left with its toggles for
       the live-tiles screen (ticket 51); the sheets that remain carry no
       Notice. */
    expect(settings).not.toContain("from '$lib/components/kit/Notice.svelte'");
  });

  it("draws rule 7's chrome case: the field with its own title, and back to Today", () => {
    /* Carpet 25. This screen hid its title from ticket 24 until now, for a
       reason that stopped being true when the field arrived: a visible
       "Settings" sitting on the page directly above "Appearance" was two
       headers stacked (Alicja, 2026-08-25), and a title on the field is not
       on the page at all - it is on a block of the flag's colour, which is
       where every deep screen in the app puts its own. Rule 7's third case
       decides both answers for chrome; `chrome` is how a screen asks for
       them, and the back control it brings is hidden on the desktop by
       components.css rather than by a second call here. */
    const header = /<ScreenHeader[^>]*\/?>/s.exec(withoutScript)?.[0] ?? '';
    expect(header).toContain('title={m.nav_settings()}');
    expect(header).not.toContain('titleHidden');
    expect(header).toContain('chrome');
    /* Today, because the phone's gear is in Today's foot (ADR-0076). A
       string, so ScreenHeader's smartBack answers the rail and every deep
       link into the screen and keeps this as the fallback. */
    expect(header).toContain('back="/"');
  });

  it('keeps all three hand-written sections', () => {
    for (const key of ['settings_appearance', 'settings_tracking', 'settings_privacy']) {
      expect(withoutScript).toContain(`m.${key}()`);
    }
  });

  it('previews all 8 gender palettes and all 4 mood presets', () => {
    const paletteKeys = [...settings.matchAll(/\['(\w+)', m\.palette_\w+\]/g)].map((mm) => mm[1]);
    expect(paletteKeys).toEqual(PALETTES);
    const moodKeys = [...settings.matchAll(/\['(\w+)', m\.mood_preset_\w+\]/g)].map((mm) => mm[1]);
    expect(moodKeys).toEqual(['amber', 'teal', 'plum', 'moss']);
  });

  it('gives rows that carry a switch instead of a chevron no interactive wrapper of their own', () => {
    /* A ListRow always renders as an <a> or a <button>; a row whose only
       job is to hold a Switch would make that switch's own button a nested
       control. Those stay plain .kit-row divs. The wrapped and on-this-day
       rows moved to the unprompted registry's own screen (ticket 51, merged
       to one screen by deepening ticket 09), and the four prompt toggles
       followed them there in phase 11 ticket 04 - unprompted-view.test.ts
       holds all of them to the same rule. Cycle tracking is the switch row
       this screen has left. */
    expect(withoutScript).toMatch(/<div class="kit-row" data-cycle-tracking-toggle>/);
  });

  it('keeps no switch for a prompt the notifications screen now carries', () => {
    /* Phase 11 ticket 04. Entry nudges, guided prompts, the binder duration
       cue and roadmap milestone prompts floated here under no heading of
       their own; all four are the app speaking up unasked, which is what
       /settings/notifications is about. Left behind, each would be a second
       switch writing the same preference. */
    for (const gone of ['data-entry-nudges', 'data-guided-prompts', 'data-wear-duration-cue-toggle', 'data-roadmap-milestone-sync']) {
      expect(settings).not.toContain(gone);
    }
    for (const pref of ['entryNudges', 'guidedPromptsEnabled', 'wearDurationCueEnabled', 'roadmapMilestoneSyncEnabled']) {
      expect(settings).not.toContain(`prefs.${pref}`);
    }
  });

  it('sends the live tiles and their toggles to one consolidated screen (deepening ticket 09)', () => {
    expect(withoutScript).toContain('href="/settings/notifications"');
    expect(withoutScript).not.toContain('href="/settings/live-tiles"');
    for (const gone of ['data-wrapped-toggle', 'data-wrapped-notify-toggle', 'data-on-this-day-toggle', 'data-on-this-day-notify-toggle']) {
      expect(settings).not.toContain(gone);
    }
  });

  it('carries every data-* handle the walkthrough relies on', () => {
    for (const handle of [
      'data-settings-list',
      'data-palette-pick',
      'data-mood-preset-pick',
      'data-swatch',
      'data-mood-swatch',
    ]) {
      expect(withoutScript).toContain(handle);
    }
  });
});
