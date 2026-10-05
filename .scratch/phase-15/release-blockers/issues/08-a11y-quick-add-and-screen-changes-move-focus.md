# 08 - a11y: Quick add is a real modal, and a screen change says where you are

Status: ready-for-agent
Was: phase-14 pre-release 40 (moved 2026-10-05)
Type: bug
Audit findings: A11Y-01 (blocker B8 in the audit's clusters), A11Y-02, A11Y-08, A11Y-12, L04-15
Severity: P1 (A11Y-01), the audit calls it release-blocking; P2-P3 (rest)
Blocked by: none
Blocked by note: after-release 08 fixes the Quick add mood-pick blur yank (UI-02) in the same file; land one, then rebase the other.
Size: M
Size note: one to two days
Model: opus
UI: yes. Mandatory `/impeccable` pass (audit, then polish) on the changed
surfaces, after the build and before `/code-review`, then sign-off and the
no-yank clause from the spec.

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

- **A11Y-01 (P1).** Quick add is a modal for the eye only. After Enter on
  `[data-nav-fab]`, focus stays on the FAB (`aria-expanded=true`), only the demo
  bar is inert, and 15 Tabs walk Look back, Transition, Settings, the
  appointments, the mood radios and the hub rows under the scrim before the
  16th reaches the fan; Escape then drops focus to body (`a11y/quickadd.mjs`,
  `a11y/shots/quickadd-open.png`). `QuickAdd.svelte:644-660`: the fan is
  `role="group"`, the scrim `role="presentation"`, it never calls
  `lockBackground`/`registerOverlay`, and Escape is a window listener with no
  focus restore. The most-used action is close to unusable by keyboard or
  switch access. Report: `report-a11y.md`.
- **A11Y-02 (P2).** Arrow keys on Home's mood radiogroup open the editor:
  `rovingRadio.ts:26` calls `target.click()` on arrow, and Home's `onPick`
  navigates (`a11y/probe-mood.mjs`: focus on "awful", ArrowRight, URL becomes
  `/entry/new/today`). WCAG 3.2.2.
- **A11Y-08 (P2).** Every navigation announces "engender" and leaves focus on
  body; the next Tab goes back to the nav (`a11y/probe-nav.mjs`). The tab title
  stays "engender" on purpose (disguise, ADR-0035), so the fix is focus or an
  in-app announcement, not the title. The skip link is not to come back: Alicja
  had it deleted on 22 September
  (`.scratch/done/phase-12/final-audit/issues/06-delete-the-skip-to-content-link-from-the-whole-app.md`).
- **A11Y-12 (P2).** Onboarding drops focus to body going from Welcome to Name
  and into "You're all set"; other steps keep focus on Continue and announce
  nothing; `#ob-name` (`onboarding/+page.svelte:848`) is named only by its
  placeholder (`a11y/onboarding.json`).
- **L04-15 (P3, PLAUSIBLE).** `AppNav.svelte:96-114` sets `openedByPointer` on
  pointerdown and clears it only on the button's own click; a press-slide-release
  onto a fan target never clicks the button, so the next keyboard Enter on it
  is swallowed. Report: `report-L04.md`.

## What to build

- Give the fan the Sheet contract through `overlayLock.ts`: `lockBackground`,
  `registerOverlay` with `restoreFocus` to the FAB, focus on the first fan item
  on open, `role="dialog"` with `aria-modal` and a label. Keep the slide
  gesture.
- On navigating radiogroups, arrows move focus and Enter or Space commits; or
  model Home's faces as five buttons.
- After each navigation, focus `#app-main` or the screen's h1 with
  `preventScroll`, or speak the h1 through a polite in-app region. No skip link.
- Onboarding moves focus to each step's h1 (`tabindex=-1`); `#ob-name` gets
  `aria-labelledby` pointing at the h1.
- AppNav treats `event.detail === 0` as a keyboard click, or resets the flag on
  a window pointerup.

## Acceptance

- [ ] Enter on the FAB puts focus inside the fan, Tab stays inside, the page
      behind is inert, Escape returns focus to the FAB (the audit's
      `quickadd.mjs` passes).
- [ ] Arrow keys on Home's faces do not navigate.
- [ ] After a keyboard navigation, a screen reader hears the screen's name and
      focus is not on body (the audit's `probe-nav.mjs`), with the tab title
      unchanged.
- [ ] Onboarding never drops focus to body; the name field is named by its
      question.
- [ ] Enter on the FAB after a slide gesture opens the fan.
- [ ] TalkBack pass on the fan and one navigation, noted in Comments.
- [ ] Mandatory `/impeccable` pass (audit, then polish) on the changed surfaces, after the build and before `/code-review`.
- [ ] Every appearance, disappearance and state change on the changed surfaces animates; no yanks (nothing teleports or vanishes in one frame), verified by per-frame sampling of the animated properties, numbers recorded in Comments.
- [ ] Sign-off page shows before/after crops of only what changed, default palette (trans), light and dark; the branch stays unmerged until Alicja says merge.
