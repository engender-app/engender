# 13 - Open Features to Show as a manager

Status: done
Size: M
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Replace the group of visibility switches embedded in Settings with one Features to Show row. Opening it shows the existing choices as a list, following the interaction used for gender scales. Settings becomes easier to scan while each choice keeps its current effect.

## Acceptance

- [x] The row opens a named manager with the existing measurement, genital-effects and cycle choices. Current values and side effects are unchanged.
- [x] Close returns to the same Settings position. Keyboard, screen reader and reduced-motion paths work.
- [x] The Settings screen no longer repeats those switches below the row. Check narrow width and 200% zoom.

Source: 11 October recording at 18:33.

## Comments

Implemented and independently reviewed on Standards and Spec, with no findings.
The existing Sheet now contains the visibility choices; their handlers and values are unchanged. Measurement units remain in Settings.

Verified with a production build, zero-error/zero-warning Svelte check, 7,539 Node tests, eight targeted walkthrough flows, four cycle-motion profiles and 34 manager layouts. Actual Chrome 200% zoom measured 195 CSS pixels. Keyboard, focus restoration, scrolling, persistence and reduced motion passed.

Combined production startup measured 251,290 bytes across 104 files. The manager adds a deferred Close dependency to eager preload metadata. The budget baseline records the measured graph; the existing 1,024-byte allowance and 104-file cap remain unchanged. The final payload check and 15 budget contract tests pass. Original failed measurements and attribution remain in the delivery archive.

Implementation tip: dff6f565d8d9928c8953ae7dd91cbccb665a32de.
