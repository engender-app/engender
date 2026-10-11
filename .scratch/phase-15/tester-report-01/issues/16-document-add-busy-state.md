# 16 - Show progress while adding a document

Status: ready-for-agent
Size: M
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Adding a document takes about a second with no visible response. Show a busy state from the first tap until the document is ready or the operation fails, so someone knows the tap worked.

## Acceptance

- [ ] The add control gives immediate feedback during a slow document save and prevents duplicate submissions.
- [ ] Success clears the busy state and shows the new document. Failure clears it and leaves a usable retry path without a partial duplicate.
- [ ] Check screen reader announcement, cancel or back behavior and a fast save that must not flash an obsolete indicator.

Source: 11 October recording at 18:46.
