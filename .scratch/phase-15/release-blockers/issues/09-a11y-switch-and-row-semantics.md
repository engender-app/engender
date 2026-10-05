# 09 - a11y: One interactive owner per row, and switches with one state

Status: ready-for-agent
Was: phase-14 pre-release 27 (moved 2026-10-05)
Type: bug
Audit findings: A01, A02 (accessibility audit, 30 September 2026)
Severity: P1 in the accessibility audit (WCAG 4.1.2); wanted before release, not in the hard release gate
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A01, nested buttons.** `ListRow` renders a button by default and its trailing `Switch` is another
button. Axe reports nested-interactive on `/wrapped/month/share` (Entries and Palette rows,
`src/routes/wrapped/[cadence]/share/+page.svelte:138,147`) and on two onboarding steps
(`src/routes/onboarding/+page.svelte:975,1022`, lock-on-leave and disguise).

**A02, switch states.** `src/lib/components/Switch.svelte:28` spreads Melt's `Toggle` trigger,
which adds `aria-pressed`, onto a `role="switch"` with `aria-checked`. Axe reports
aria-allowed-attr on every switch (Settings, Accessibility, notifications, security, journal
book, care curve, surgery, onboarding, share). TalkBack still reads names and states in the
sampled settings.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Use ListRow's static option wherever a switch owns the row; check every ListRow with a
  trailing control, not only the four reported.
- Switch exposes `aria-checked` only: drop the Toggle builder or strip `aria-pressed`, keeping
  keyboard (Space) and TalkBack activation.

## Acceptance

- [ ] Tab reaches each named switch once; Space toggles it once.
- [ ] No nested-interactive or aria-allowed-attr violations on share, onboarding and every
      settings screen with a switch.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.

## Audit 2026-10-05

Confirmed unbuilt; the audit calls it release-blocking (B9). Reports:
`.claude/audit-2026-10-05/report-a11y.md`, `report-L05.md`.

- **A11Y-03 (P1).** `Switch.svelte` is unchanged since 8be50a4f. Axe
  `aria-allowed-attr` on /settings (3 switches), /settings/journal-book (7),
  /settings/notifications (7), /care/curve (1), /wrapped/month/share (2), the
  onboarding disguise step (1) and the Accessibility sheet (6).
  `nested-interactive` still fires on `/wrapped/month/share` (`share-counts`,
  `share-palette`) and the onboarding disguise row; the lock-on-leave step no
  longer does.
- **L05-10 (P2).** `Switch.svelte:28` spreads `toggle.trigger`, and
  `node_modules/melt/dist/builders/Toggle.svelte.js:31` adds `aria-pressed`
  onto `role="switch"`.

No new acceptance; the existing boxes cover both.
