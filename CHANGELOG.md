# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## Unreleased

Phase 2 is in progress and nothing has been released yet. Rename this heading
to the version before cutting the tag.

- Schema changes: none
- Archive format changes: none
- Security migrations: none
- Minimum supported version: none, there is no earlier release to update from
