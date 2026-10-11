# 12 - Restore the support link above About

Status: resolved
Size: S
Model: gpt-6.1-sol
Type: bug
Blocked by: None
UI: yes

## What to build

Settings currently omits its support row because its old Ko-fi destination is empty. Show a row immediately above About that opens `https://buymeacoffee.com/engender`. The visible label and accessible name must describe Buy Me a Coffee, not Ko-fi.

## Acceptance

- [ ] Support row appears above About in English and Polish and opens the supplied URL through an external link.
- [ ] No Ko-fi label, empty destination or misleading coming-soon state remains. The row works at 390px and with keyboard and screen reader navigation.
- [ ] Update existing assertions that intentionally expected the absent Ko-fi row.

Source: 11 October recording at 18:30; destination supplied during intake.

## Integration result, 12 October 2026

Restored Buy Me a Coffee support link immediately above About with English and Polish labels. Updated the erase guard to scroll to Privacy before measuring its row. Independent Standards and Spec reviews found no issues.

Merged-tree build, typecheck, 7,538 Node tests, copy and screen-class checks passed. First-load payload measured 251,286 bytes against a 251,272-byte limit, then 251,254 bytes on one unchanged rebuild. Generated dependency ordering and symbol names varied; both measurements are retained in the delivery evidence. The passing build has 18 bytes of headroom.

Implementation tip: f5ca20b1bc87a81d135857ce71d1fb76b54ae31b.
