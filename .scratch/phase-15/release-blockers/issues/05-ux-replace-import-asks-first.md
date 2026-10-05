# 05 - ux: Replace import asks first, and no option label is cut off

Status: ready-for-agent
Was: phase-14 pre-release 38 (moved 2026-10-05)
Type: bug
Audit findings: UX-02, L07-02, UX-12, UI-04, UI-18 (blocker B5 in the audit's clusters)
Severity: P1 (UX-02), the audit calls it release-blocking; P2-P3 (rest)
Blocked by: none
Blocked by note: reuse the erase sheet from done/phase-14 pre-release 15 for the confirm.
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

- **UX-02 / L07-02.** Choosing Replace and tapping Import runs the destructive
  restore with no confirmation: `settings/export/+page.svelte:442-464,454-457`
  calls `runRestore(..., 'replace')` straight from the button (`:889`). Live run
  `ux/imp1.mjs`: right file, right password, Replace selected, one tap,
  "Journal replaced with the archive.", and the dialog probe found none
  (`ux/shots/imp-05-confirm.png`). The only warning is the muted
  `imp_replace_note`. Both exports have warning sheets (`:927-960`) and Delete
  everything got one in done/phase-14 pre-release 15. Phase-1 ticket 14 flagged this as worth
  raising and it was never decided. Reports: `report-ux.md`, `report-L07.md`.
- **UX-12 / UI-04.** Segmented controls clip labels mid-word at 390: Export
  reads "Merge into current / Replace this journa›" (the group is 340px wide
  with scrollWidth 358), New tryout reads "Name Pronouns Style Gar›",
  Measurements reads "Waist Hips Chest / bust U›" (shots-v2,
  `ux/shots/imp-04-verified.png`). The destructive choice is the one cut off.
  Report: `report-ui.md`.
- **UI-18.** On Export, "Verify backup" and "Import backup" both wrap to two
  lines side by side (`settings-export-390-light-full`).

## What to build

- A confirm sheet before Replace, with a danger button, the consequence in one
  sentence, the last-backup age row, and "Back up first" as the secondary
  action (Mobbin reference in `report-ux.md`: Finch, Load Backup File). Merge
  needs no confirm.
- Merge and Replace as two option cards with one consequence line each
  instead of a segmented control (reference: Public, "Order defaults").
- New tryout kinds and measurement types: wrap into a chip row (the Photos
  filter chips already do) or shorten the labels; keep the scrolling segmented
  control only where every option fits. Coordinate with after-release 28's decision
  on segmented controls.
- Stack the Export buttons full width, Import as the block.

## Acceptance

- [ ] Replace cannot run without the confirm sheet; cancelling leaves the
      journal untouched; Merge runs as before. A walkthrough check covers both.
- [ ] No option label on Export, New tryout or Measurements is clipped at 320
      or 390.
- [ ] Export's buttons each sit on one line.
- [ ] Mandatory `/impeccable` pass (audit, then polish) on the changed surfaces, after the build and before `/code-review`.
- [ ] Every appearance, disappearance and state change on the changed surfaces animates; no yanks (nothing teleports or vanishes in one frame), verified by per-frame sampling of the animated properties, numbers recorded in Comments.
- [ ] Sign-off page shows before/after crops of only what changed, default palette (trans), light and dark; the branch stays unmerged until Alicja says merge.
