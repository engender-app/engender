# A roadmap goal is a step, not a record

Status: Accepted
Decided: 2026-09-06
Last reviewed: 2026-11-02
Supersedes: none

A built-in goal is a step in a list, not a record. How much of a record a
goal becomes is settled here.

**A built-in goal has no row and never gains a note.** It is a key in
`src/lib/data/roadmap.ts`. Its only journal traces are a `roadmap_check`
row while it holds a status and a hidden flag, deleted when neither
remains.

**Built-in goals are the Polish legal track alone**, behind a "Polish legal
steps" switch that follows the app's language (on for Polish) until the
person answers it (`roadmapPolishStepsChoice`).

**The person makes their own.** Custom goals can be edited and deleted,
and live in roadmap categories the person creates, renames and deletes.
Deleting a goal or category unfiles any document filed against it and
leaves a milestone it minted whole.

**Either kind gets a sheet, not a route.** It holds the tick, the filed
documents and a link to the milestone it minted.

**Words about a goal go on the milestone it mints.** Ticking a goal keeps
offering to mint one.

**Institutions are a second kind of item with a record.** Post-ruling
steps that each name an office are institutions, with dated changes
(submitted, waiting, done, optional note). A step is still a tick.

## Why

**A built-in goal stays rowless.** `setGoalStatus` deletes rather than
stores when a goal goes back to unchecked, so "no row means unchecked" is
the whole storage model. A note on a built-in goal means a row per goal
anybody opened, a migration and an archive section for a sentence about
bundled text. What somebody wants to write about a step is the record of
taking it, which is a milestone.

**Not the milestone alone.** A goal not yet reached has no milestone, and
that is when paper arrives. The Polish pack has a step about keeping
opinions, and documents are filed against it long before it is ticked.

**A sheet.** A built-in goal is named by a pack key and goal key, a custom
one by a uuid, so no path shape fits both, and a goal is one line of a
list whose address is the list.

**Custom edit and delete.** A typo in your own goal was permanent. The two
dangling cases differ: a document link is nulled, as `deleteMilestone` does,
while a milestone needs nothing because `provenance.ts` already renders a
fallback for an unresolvable goal key.

**The row splits in two.** The row's tap cycles unchecked, checked and
not part of my path, so the sheet needs a second target, a trailing icon
button, since a button nested in a link does not resolve for browsers or
screen readers.

**Hiding is not a status.** A person can hide one built-in goal and restore
it. Hiding is a choice about which steps to see, separate from "not part of
my path", which stays a visible statement. A hidden goal keeps its status,
milestone and documents through archive export.

**Institutions are not steps.** After a ruling the useful record is when
each office was asked and when it answered, and a milestone is the wrong
home for a request that bounces. They file documents through the goal link
kind, not a fifth kind (ADR-0065), so the paper of steps that became
institutions did not move.

## Consequences

A document filed against a custom goal, category or institution can dangle
and is unfiled on delete. One filed against a built-in step cannot, since
nothing can delete it.

Dismissing a track hides its goals and leaves statuses alone. A sheet
reached from a document's link opens one goal and is not a way around that.

The pack carries a reviewed-on date shown on screen, since Polish
procedure changes with legislation.

## Considered and rejected

- **A per-goal route.** It needs a path shape a composite key and a uuid
  share, and promises a page for one line of a list.
- **A note field or a fourth status on a built-in goal.** It costs the
  storage invariant, a migration and an archive section.
- **Refusing to delete a custom goal that something points at.** It makes a
  typo permanent.
- **Long-press to open the sheet.** Undiscoverable, no keyboard path.
- **The trailing control only on goals with something attached.** The first
  thing could never be attached.
- **Keeping the social, presentational and medical tracks.** They repeated
  milestones, voice, hair removal and tryouts, and the medical track was
  the most clinical text outside Care. Ticks and filed documents against
  them were dropped in October 2026.

History: decided 2026-09-06; amended 2026-10-11 (hide a built-in goal), 2026-10-21 (legal track only, categories) and 2026-10-30 (institutions); folded into the body 2026-11-02.