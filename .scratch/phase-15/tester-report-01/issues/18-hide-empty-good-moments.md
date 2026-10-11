# 18 - Hide Good moments when the pool is empty

Status: ready-for-agent
Size: M
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Safe space shows a Good moments row even when opening it leads to an empty list. Omit that row until the counterevidence pool has content. Keep the direct Good moments route's empty explanation for links or history entries that still reach it.

## Acceptance

- [ ] Empty journals omit the Good moments row; a journal with a saved good moment shows it. Adding or removing the last qualifying item updates the row without a visual jump.
- [ ] A direct visit to Good moments still explains the empty state and offers its existing ways forward.
- [ ] Safe space keeps its fast cold-start breath. The visibility read does not delay the breath or briefly show a row that then vanishes.

Source: 11 October recording at 18:50.
