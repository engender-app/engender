/* The rules Settings keeps after the rebuild (phase 5 ticket 24), at the
   level a screen's source can be held to - mirrors home-surfaces.test.ts and
   more-surfaces.test.ts.

   Sheets are not a surface (home-surfaces.test.ts's own note): the metric,
   disguise and about sheets keep the old `.list-group`/`.list-row`/`.card`
   vocabulary inside <Sheet>, so this file's "no card of its own" check
   strips every <Sheet>...</Sheet> block first, the same way the script
   block is stripped. The scales sheet is the exception and is on the kit
   already - phase 5 ticket 35 put the checklist there, and it is the same
   component the first run draws. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
    expect(settings).toContain("from '$lib/components/kit/Notice.svelte'");
  });

  it('hides its own title, the same call the More hub makes', () => {
    /* Alicja, on the live build: a visible "Settings" sitting directly
       above "Appearance" is the same two-headers-stacked problem
       DIRECTION.md 3d names for the hub, even though this screen isn't
       itself a tab. The title stays in the document for a screen reader. */
    expect(withoutScript).toMatch(/<ScreenHeader\s[^>]*title=\{m\.nav_settings\(\)\}[^>]*titleHidden/);
  });

  it('keeps all three hand-written sections', () => {
    for (const key of ['settings_appearance', 'settings_tracking', 'settings_privacy']) {
      expect(withoutScript).toContain(`m.${key}()`);
    }
  });

  it('previews all 8 gender palettes and all 4 mood presets', () => {
    const paletteKeys = [...settings.matchAll(/\['(\w+)', m\.palette_\w+\]/g)].map((mm) => mm[1]);
    expect(paletteKeys).toEqual(['trans', 'nonbinary', 'genderfluid', 'bisexual', 'lesbian', 'pansexual', 'rainbow', 'agender']);
    const moodKeys = [...settings.matchAll(/\['(\w+)', m\.mood_preset_\w+\]/g)].map((mm) => mm[1]);
    expect(moodKeys).toEqual(['amber', 'teal', 'plum', 'moss']);
  });

  it('gives rows that carry a switch instead of a chevron no interactive wrapper of their own', () => {
    /* A ListRow always renders as an <a> or a <button>; a row whose only
       job is to hold a Switch would make that switch's own button a nested
       control. Those stay plain .kit-row divs. */
    for (const handle of ['data-entry-nudges', 'data-guided-prompts', 'data-wrapped-toggle', 'data-on-this-day-toggle']) {
      const re = new RegExp(`<div class="kit-row" ${handle}>`);
      expect(withoutScript).toMatch(re);
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
