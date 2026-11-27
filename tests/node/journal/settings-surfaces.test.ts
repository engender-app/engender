/* Check Settings' component and class contracts in source. Strip Sheet bodies
   before checking the screen's surfaces because the About sheet still uses
   legacy classes. The scales sheet shares the setup checklist. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../palettes.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const settings = read('src/routes/settings/+page.svelte');
const disguiseSetting = read('src/lib/components/DisguiseSetting.svelte');
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
       the live-tiles screen; the sheets that remain carry no
       Notice. */
    expect(settings).not.toContain("from '$lib/components/kit/Notice.svelte'");
  });

  it("draws rule 7's chrome case: the field with its own title, and back to Today", () => {
    /* Carpet 25. This screen hid its title until now, for a reason that stopped being true
       when the field arrived: a visible "Settings" sitting on the page directly above
       "Appearance" was two headers stacked, and a title on the field is not on the page at
       all - it is on a block of the flag's colour, which is where every deep screen in the
       app puts its own. Rule 7's third case decides both answers for chrome; `chrome` is
       how a screen asks for them, and the back control it brings is hidden on the desktop
       by components.css rather than by a second call here. */
    const header = /<ScreenHeader[^>]*\/?>/s.exec(withoutScript)?.[0] ?? '';
    expect(header).toContain('title={m.nav_settings()}');
    expect(header).not.toContain('titleHidden');
    expect(header).toContain('chrome');
    /* Today, because the phone's gear is in Today's foot (ADR-0076). A
       string, so ScreenHeader's smartBack answers the rail and every deep
       link into the screen and keeps this as the fallback. */
    expect(header).toContain('back="/"');
  });

  it('names five areas and keeps every one of them open', () => {
    for (const key of ['settings_appearance', 'settings_tracking', 'settings_reminders', 'settings_lists', 'settings_privacy']) {
      expect(withoutScript).toContain(`<SectionHeading text={m.${key}()} />`);
    }
    /* Folded the areas and the pickers into <details>; this one asked for nothing on the
       hub to need expanding. Detail controls open as sheets from a row of their own
       instead. */
    expect(outsideSheets).not.toContain('<details');
    for (const row of ['mood-colours', 'language', 'accessibility', 'tag-groups']) {
      expect(outsideSheets).toContain(`key="${row}"`);
    }
  });

  it('places Privacy & data after Your lists and before About', () => {
    const headings = [...outsideSheets.matchAll(/<SectionHeading text=\{m\.(\w+)\(\)\} \/>/g)].map((mm) => mm[1]);
    expect(headings).toEqual([
      'settings_appearance',
      'settings_tracking',
      'settings_reminders',
      'settings_lists',
      'settings_privacy',
    ]);
    expect(outsideSheets.indexOf('key="about"')).toBeGreaterThan(
      outsideSheets.indexOf('<SectionHeading text={m.settings_privacy()} />')
    );
  });

  it('names the lock in its row and gives disguise an icon of its own', () => {
    const lockRow = /<ListRow\s+key="security"[^>]*>/s.exec(outsideSheets)?.[0] ?? '';
    expect(lockRow).toContain('icon="lock"');
    expect(lockRow).toContain('title={m.settings_lock_row()}');
    expect(outsideSheets).toContain('<DisguiseSetting />');
    const disguiseRow = /<ListRow\s+key="disguise"[\s\S]*?>/.exec(disguiseSetting)?.[0] ?? '';
    expect(disguiseRow).toContain('icon="eyeOff"');
    expect(read('messages/en.json')).toMatch(/"settings_lock_row": "Lock\b/);
  });

  it('ends the privacy rows with erasing everything, behind a confirmation', () => {
    const privacy = outsideSheets.slice(
      outsideSheets.indexOf('<SectionHeading text={m.settings_privacy()} />')
    ).match(/<ListCard>[\s\S]*?<\/ListCard>/)?.[0] ?? '';
    // The PDF export sits low, just above erasing.
    const order = ['key="security"', '<DisguiseSetting />', 'key="export"', 'key="permissions"', 'key="trash"', 'key="journal-book"', 'key="erase"'].map((k) => privacy.indexOf(k));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(privacy.lastIndexOf('<ListRow')).toBeLessThan(order[6]);
    /* The same deliberate step the unlock gates take before resetApp: a
       sheet stating the loss, then one danger button with the gates' own
       words on it. */
    const sheet = /<Sheet bind:open=\{eraseSheet\}[\s\S]*?<\/Sheet>/.exec(withoutScript)?.[0] ?? '';
    expect(sheet).toContain('data-confirm-reset');
    expect(sheet).toContain('m.reset_confirm()');
    expect(sheet).toContain('m.reset_offer_archive_password()');
    expect(settings).toContain("resetApp('erased')");
  });

  it('links to Buy Me a Coffee immediately above About', () => {
    const support = /<ListRow\s+key="support"[\s\S]*?<\/ListRow>/.exec(outsideSheets)?.[0] ?? '';
    expect(support).toContain('href="https://buymeacoffee.com/engender"');
    expect(support).toContain('title={m.support_row()}');
    expect(support).toContain('target="_blank"');
    expect(support).toContain('rel="noreferrer"');
    expect(support).toContain('chevron={false}');
    expect(support).toContain('name="external"');
    expect(outsideSheets).toMatch(/<\/ListRow>\s*<ListRow key="about"/);
    expect(outsideSheets.indexOf('key="support"')).toBeLessThan(outsideSheets.indexOf('key="about"'));
    expect(settings).not.toMatch(/kofi|coming_soon/i);
    for (const locale of ['en', 'pl']) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      expect(messages.support_row).toContain('Buy Me a Coffee');
      expect(messages).not.toHaveProperty('kofi_row');
      expect(messages).not.toHaveProperty('kofi_row_sub');
    }
  });

  it('draws the flag picker inline, not behind a dropdown or a sheet', () => {
    const grid = outsideSheets.indexOf('class="palette-grid"');
    expect(grid).toBeGreaterThan(-1);
    expect(outsideSheets.indexOf('data-palette-pick')).toBeGreaterThan(grid);
    expect(settings.replace(/<script[\s\S]*?<\/script>/g, '').match(/<Sheet\b[\s\S]*?<\/Sheet>/g)?.join('')).not.toContain('data-palette-pick');
  });

  it('previews all 16 gender palettes and all 4 mood presets', () => {
    const choices = read('src/lib/theme/paletteChoices.ts');
    const paletteKeys = [...choices.matchAll(/\['(\w+)', m\.palette_\w+\]/g)].map((mm) => mm[1]);
    expect(paletteKeys).toEqual(PALETTES);
    const onboarding = read('src/routes/onboarding/+page.svelte');
    for (const screen of [settings, onboarding]) {
      expect(screen).toContain("import { PALETTES } from '$lib/theme/paletteChoices'");
      expect(screen).toContain('{#each PALETTES as [key, label] (key)}');
    }
    const moodKeys = [...settings.matchAll(/\['(\w+)', m\.mood_preset_\w+\]/g)].map((mm) => mm[1]);
    expect(moodKeys).toEqual(['amber', 'teal', 'plum', 'moss']);
  });

  it('gives rows that carry a switch instead of a chevron no interactive wrapper of their own', () => {
    /* A ListRow always renders as an <a> or a <button>; a row whose only job is to hold a
       Switch would make that switch's own button a nested control. Those stay plain.kit-row
       divs. The wrapped and on-this-day rows moved to the unprompted registry's own screen,
       and the four prompt toggles followed them there - unprompted-view.test.ts holds all
       of them to the same rule. Cycle tracking is the switch row this screen has left.

       The Features rows are a <label> round their switch rather than a div: a label is no
       control of its own, so the switch stays the one thing announced, and a tap anywhere
       on the row reaches it, the way a ListRow checkbox row takes one. */
    expect(withoutScript).toMatch(/<label class="kit-row" data-cycle-tracking-toggle>/);
  });

  it('opens feature visibility in one named manager without duplicating switches', () => {
    expect(outsideSheets.match(/key="features"/g)).toHaveLength(1);
    const manager = /<Sheet bind:open=\{featuresSheet\}[\s\S]*?<\/Sheet>/.exec(withoutScript)?.[0] ?? '';
    expect(manager).toContain('title={m.features_to_show()}');
    expect(manager).toContain('m.features_to_show_sub()');
    expect(manager).toContain('data-features-close');
    for (const handle of ['data-genital-effects-toggle', 'data-sexual-effects-toggle', 'data-cycle-tracking-toggle']) {
      expect(outsideSheets).not.toContain(handle);
      expect(manager.match(new RegExp(handle, 'g'))).toHaveLength(1);
    }
  });

  it('gives genital and sexual changes a switch each, writing only its own category', () => {
    // One 'genital_sexual' switch became two.
    const manager = /<Sheet bind:open=\{featuresSheet\}[\s\S]*?<\/Sheet>/.exec(withoutScript)?.[0] ?? '';
    const row = (handle: string) => new RegExp(`<label class="kit-row" ${handle}>[\\s\\S]*?</label>`).exec(manager)?.[0] ?? '';
    expect(row('data-genital-effects-toggle')).toContain("setCategoryEnabled('genital', on)");
    expect(row('data-genital-effects-toggle')).not.toContain("'sexual'");
    expect(row('data-sexual-effects-toggle')).toContain("setCategoryEnabled('sexual', on)");
    expect(row('data-sexual-effects-toggle')).not.toContain("'genital'");
    expect(settings).not.toContain('genital_sexual');
  });

  it('says under each Features filter row what it covers, as the first run does', () => {
    const manager = /<Sheet bind:open=\{featuresSheet\}[\s\S]*?<\/Sheet>/.exec(withoutScript)?.[0] ?? '';
    const row = (handle: string) => new RegExp(`<label class="kit-row" ${handle}>[\\s\\S]*?</label>`).exec(manager)?.[0] ?? '';
    expect(row('data-genital-effects-toggle')).toContain('m.feature_genital_effects_sub()');
    expect(row('data-sexual-effects-toggle')).toContain('m.feature_sexual_effects_sub()');
    expect(row('data-cycle-tracking-toggle')).toContain('m.feature_cycle_tracking_sub()');
  });

  it('keeps no switch for a prompt the notifications screen now carries', () => {
    /* Moved these prompts to notifications settings. Entry nudges have since been removed. */
    for (const gone of ['data-entry-nudges', 'data-guided-prompts', 'data-wear-duration-cue-toggle', 'data-roadmap-milestone-sync']) {
      expect(settings).not.toContain(gone);
    }
    for (const pref of ['guidedPromptsEnabled', 'wearDurationCueEnabled', 'roadmapMilestoneSyncEnabled']) {
      expect(settings).not.toContain(`prefs.${pref}`);
    }
  });

  it('sends the live tiles and their toggles to one consolidated screen', () => {
    expect(withoutScript).toContain('href="/settings/notifications"');
    expect(withoutScript).not.toContain('href="/settings/live-tiles"');
    for (const gone of ['data-wrapped-toggle', 'data-wrapped-notify-toggle', 'data-on-this-day-toggle', 'data-on-this-day-notify-toggle']) {
      expect(settings).not.toContain(gone);
    }
  });

  it('draws every flag swatch in its own stripes', () => {
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
      // A colour inside an inline SVG is URL-encoded, # as %23 (intersex's ring).
      const drawn = dedupe([...rule!.matchAll(/(?:#|%23)([0-9a-fA-F]{3,6})\b/g)].map((mm) => hex('#' + mm[1])));
      if (palette === 'intersex') expect(new Set(drawn)).toEqual(new Set(stripes));
      else expect(drawn, palette).toEqual(stripes);
    }
  });

  it('sizes the flag bands to the border box so no edge row shows the far end (prh12)', () => {
    /* The swatch's 1px edge is translucent and a gradient defaults to the
       padding box and tiles, so the border row drew the opposite end of the
       flag: the last band along the top, the first along the bottom. */
    const screens = read('src/lib/styles/screens.css');
    const rule = /\.palette-grid \.swatch-preview\s*\{([^}]+)\}/.exec(screens)?.[1] ?? '';
    expect(rule).toContain('border: 1px solid var(--outline)');
    expect(rule).toContain('background-origin: border-box');
  });

  it('has no Home & calendar colour row', () => {
    /* The metric preference stays: Calendar and Look back's day-by-day
       reading set it from their own pickers. Only the Settings row and its
       sheet went. */
    expect(settings).not.toContain('key="metric"');
    expect(settings).not.toContain('metricSheet');
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

describe('the permissions list', () => {
  it('re-reads through the same watcher as Reminders and Notifications', () => {
    /* The list was the one surface that re-read on the way back from Android's settings,
       with its own listener. The two screens that did not now share one owner with it, so
       the listener, its teardown and the newest-read-wins rule cannot drift apart. */
    const list = read('src/lib/components/PermissionList.svelte');
    expect(list).toContain("from '$lib/permissions/watchStatus'");
    expect(list).toMatch(/watchStatus<GrantStates>\(\{[\s\S]*?read: readGrantStates/);
    expect(list).not.toContain("addEventListener('visibilitychange'");
  });
});
