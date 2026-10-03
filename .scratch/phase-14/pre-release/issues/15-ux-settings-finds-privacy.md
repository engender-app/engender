# 15 - ux: Settings puts privacy where people look for it, and can erase the journal

Status: ready-for-agent
Type: design
Audit findings: V04, V05, V14
Severity: P2
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (an information-architecture call judged on render, plus a destructive action)
UI: yes. Mandatory `/impeccable` pass on Settings, then sign-off and the
no-yank clause from the spec. Render two or three orderings over the real app
and let Alicja pick before building the rest.

## Problems

**V04, Settings IA.** Measured section tops at 390 px: Appearance 189,
Tracking 911, Reminders 1582, Your lists 1892, Privacy and data 2251. Security,
Disguise, Export and Trash come after 16 flag swatches and every tracking
option. The word "lock" appears nowhere; the lock setting lives at Security,
"How your journal opens". Disguise reuses Security's shield icon.

"Delete everything and start over" (`reset_confirm`) renders only on unlock
gates (`JournalGate`, `SessionUnlock`, `AndroidKeyGate`,
`DeviceBoundRecovery`, `UnreadableJournalWayOut`). There is no Settings entry,
and a journal in Unlocked mode has no gate, so it cannot be erased in the app.

**V05.** "Support on Ko-fi · Coming soon" is drawn as a navigable row with a
heart but is not a link or button. It reads unfinished to a store reviewer.

**V14, bottom-nav active tab.** Settings subpages disagree: Ignored words
lights Look back, Eras lights Transition, Tags and Affirmations light nothing.
Body map lights Look back while every other body screen lights Transition.

Evidence: `.claude/audit-2026-10-03/ux2/` (`flow8.mjs`, `shots/seg/`).

## What to build

- Privacy and data near the top: lock (say "Lock" in the row title), disguise
  with its own icon, backup and export, trash, and "Delete everything" using
  the existing `reset.ts`, with the same deliberate confirmation the gates use
  and a result that cannot be undone stated plainly.
- Hide the Ko-fi row until it is live.
- One rule for which tab a route lights, applied to Settings subpages and Body
  map (the route-policy modules from phase 12 ticket 32 are the place).

Reference patterns (Mobbin, in the report under V04): How We Feel puts
Face ID, export and "Delete all my data" on one screen with delete last;
Quicken says "Automatically lock" with the timings under it.

## Acceptance

- [ ] Alicja picked an ordering from rendered options.
- [ ] Lock, disguise, backup, trash and delete everything are reachable within
      the first screen or one tap of it at 390 px.
- [ ] Delete everything works in every access mode, including Unlocked, and
      leaves the app at first run; covered by a browser guard.
- [ ] No Ko-fi row in a release build.
- [ ] Each route lights one consistent tab.
- [ ] `/impeccable` pass done; sign-off crops of the changed sections, trans
      light and dark.
- [ ] Section and confirmation transitions sampled per frame: no yank.
