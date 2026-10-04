# 14 - ux: First run, toasts and the desktop rail

Status: ready-for-agent
Type: bug
Audit findings: U2, U16, U15
Severity: P2
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the toast, the Welcome and setup
steps, and the desktop rail, then sign-off and the no-yank clause from the
spec.

## Problems

**U2, toasts are half the screen wide.** `src/lib/styles/components.css:2345`
positions `.toast` with `left: 50%; transform: translate(-50%, ...)`, so it
shrink-wraps to half its container (195 of 390 px, 136 px tall, never reaching
its 358.8 px max). The `boot_storage_not_persistent` warning
(`boot.svelte.ts:666`) fires on every cold web load and sits over "Set up the
app" and "I already have a backup" on the Welcome screen for 4 s
(`.claude/audit-2026-10-03/ux1/flow/onb-00-start.png`). `pointer-events: none`
keeps taps working, but the first screen looks broken. Whether it fires on
every Android boot was not checked.

**U16, onboarding.** The name input's focus ring loses its top edge to
`.screen-setup { overflow: clip }` (`onboarding/+page.svelte:1202`). The
Disguise step's copy starts lowercase ("the browser tab shows...", "how the tab
appears"). The web Permissions step lists two rows marked "Android only".

**U15, desktop at 1280.** The rail's Settings link (`AppNav.svelte:362`)
never shows active or sets `aria-current` on `/settings` or its subpages. The
palette grid breaks "Genderqueer" as "Genderquee/r". Voice says "Hold the
phone..." on desktop.

## What to build

- Toast: full available width minus gutters up to a max
  (`left: 0; right: 0; margin-inline: auto; width: max-content;
  max-width: min(92vw, 420px)`), above the nav. Check every toast in the app.
- Storage warning: once, as a Home notice that says what to do (keep an
  encrypted backup), not a toast over the first screen. Confirm with Alicja if
  the notice placement is a design change.
- Onboarding: focus ring visible (clip with margin, or move the clip), sentence
  case, web Permissions shows only what applies on the web.
- Rail: Settings active on all its routes; the palette label wraps whole or
  fits; Voice copy names the device generically on desktop.

Reference (Mobbin, in the report): CVS Health and Toggl Track bars span the
width above the nav.

## Acceptance

- [ ] Toasts span the width as above on every screen that raises one.
- [ ] Welcome has nothing over its buttons on a cold web load.
- [ ] Onboarding focus ring whole; copy sentence case; no Android-only rows on
      web.
- [ ] Rail active state and `aria-current` on Settings routes.
- [ ] `/impeccable` pass done; sign-off crops, trans light and dark.
- [ ] Toast arrival and departure sampled per frame: no yank.
