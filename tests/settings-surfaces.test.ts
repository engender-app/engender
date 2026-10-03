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

  it('names five areas and keeps every one of them open (ticket 277)', () => {
    for (const key of ['settings_appearance', 'settings_tracking', 'settings_reminders', 'settings_lists', 'settings_privacy']) {
      expect(withoutScript).toContain(`<SectionHeading text={m.${key}()} />`);
    }
    /* Ticket 268 folded the areas and the pickers into <details>; this one
       asked for nothing on the hub to need expanding. Detail controls open
       as sheets from a row of their own instead. */
    expect(outsideSheets).not.toContain('<details');
    for (const row of ['mood-colours', 'language', 'accessibility', 'tag-groups']) {
      expect(outsideSheets).toContain(`key="${row}"`);
    }
  });

  /* Phase 14 ticket 15 (V04). Privacy and data sat fifth, at 2251px on a
     390px phone, behind sixteen flags and every tracking option. It leads
     now, so the lock, disguise, backup, trash and the way to erase the
     journal are on the first screen. */
  it('opens on Privacy & data, ahead of Appearance', () => {
    const headings = [...withoutScript.matchAll(/<SectionHeading text=\{m\.(\w+)\(\)\} \/>/g)].map((mm) => mm[1]);
    expect(headings[0]).toBe('settings_privacy');
    expect(headings).toContain('settings_appearance');
  });

  it('names the lock in its row and gives disguise an icon of its own', () => {
    const lockRow = /<ListRow\s+key="security"[^>]*>/s.exec(outsideSheets)?.[0] ?? '';
    expect(lockRow).toContain('icon="lock"');
    expect(lockRow).toContain('title={m.settings_lock_row()}');
    const disguiseRow = /<ListRow\s+key="disguise"[\s\S]*?>/.exec(outsideSheets)?.[0] ?? '';
    expect(disguiseRow).toContain('icon="eyeOff"');
    expect(read('messages/en.json')).toMatch(/"settings_lock_row": "Lock\b/);
  });

  it('ends the privacy rows with erasing everything, behind a confirmation', () => {
    const privacy = outsideSheets.slice(
      outsideSheets.indexOf('<SectionHeading text={m.settings_privacy()} />'),
      outsideSheets.indexOf('<SectionHeading text={m.settings_appearance()} />')
    );
    const order = ['key="security"', 'key="disguise"', 'key="export"', 'key="trash"', 'key="erase"'].map((k) => privacy.indexOf(k));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(privacy.lastIndexOf('<ListRow')).toBeLessThan(order[4]);
    /* The same deliberate step the unlock gates take before resetApp: a
       sheet stating the loss, then one danger button with the gates' own
       words on it. */
    const sheet = /<Sheet bind:open=\{eraseSheet\}[\s\S]*?<\/Sheet>/.exec(withoutScript)?.[0] ?? '';
    expect(sheet).toContain('data-confirm-reset');
    expect(sheet).toContain('m.reset_confirm()');
    expect(sheet).toContain('m.reset_offer_archive_password()');
    expect(settings).toContain("resetApp('erased')");
  });

  it('draws no Ko-fi row until the link is live (V05)', () => {
    expect(settings).not.toContain('kofi_coming_soon');
    expect(withoutScript).toMatch(/\{#if KOFI_URL\}\s*<ListRow[\s\S]*?key="kofi"/);
  });

  it('draws the flag picker inline, not behind a dropdown or a sheet', () => {
    const grid = outsideSheets.indexOf('class="palette-grid"');
    expect(grid).toBeGreaterThan(-1);
    expect(outsideSheets.indexOf('data-palette-pick')).toBeGreaterThan(grid);
    expect(settings.replace(/<script[\s\S]*?<\/script>/g, '').match(/<Sheet\b[\s\S]*?<\/Sheet>/g)?.join('')).not.toContain('data-palette-pick');
  });

  it('previews all 16 gender palettes and all 4 mood presets', () => {
    const paletteKeys = [...settings.matchAll(/\['(\w+)', m\.palette_\w+\]/g)].map((mm) => mm[1]);
    expect(paletteKeys).toEqual(PALETTES);
    const onboarding = read('src/routes/onboarding/+page.svelte');
    const onboardingKeys = [...onboarding.matchAll(/\['(\w+)', m\.palette_\w+\]/g)].map((mm) => mm[1]);
    expect(onboardingKeys).toEqual(PALETTES);
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

  it('draws every flag swatch in its own stripes (ticket 277)', () => {
    /* Eight palettes arrived with only their theme blocks, so setup and
       Settings drew them as empty outlines. The stripes are already
       palettes.css's --motif-stripes; the swatch has to repeat them in
       order, a doubled stop (bisexual's 2:1:2) counting once. Intersex is
       a ring on a field rather than bands, so it only has to carry both
       colours. */
    const themes = read('src/lib/theme/palettes.css');
    const screens = read('src/lib/styles/screens.css');
    const hex = (h: string) => {
      const v = h.toUpperCase();
      return v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v;
    };
    const dedupe = (list: string[]) => list.filter((c, i) => c !== list[i - 1]);
    for (const palette of PALETTES) {
      const motif = new RegExp(String.raw`\[data-palette="${palette}"\]\s*\{\s*--motif-stripes:([^;]+);`).exec(themes)?.[1];
      expect(motif, palette).toBeTruthy();
      const stripes = dedupe(motif!.split(',').map((c) => hex(c.trim())));
      const rule = new RegExp(String.raw`\[data-swatch="${palette}"\]\s*\{([^}]+)\}`).exec(screens)?.[1];
      expect(rule, `no swatch for ${palette}`).toBeTruthy();
      const drawn = dedupe([...rule!.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((mm) => hex(mm[0])));
      if (palette === 'intersex') expect(new Set(drawn)).toEqual(new Set(stripes));
      else expect(drawn, palette).toEqual(stripes);
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
