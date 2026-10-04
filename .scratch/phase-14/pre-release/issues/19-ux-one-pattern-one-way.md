# 19 - ux: One pattern, one way

Status: ready-for-agent
Type: design
Audit findings: V12, V08 (V13 moved to 34)
Severity: P3
Blocked by: 17, 18
Blocked by note: (they touch the same screens; this pass goes last)
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass across the screens it touches, then
sign-off and the no-yank clause from the spec. Fix each pattern on the kit
component that owns it, not per screen.

Evidence: `.claude/audit-2026-10-03/report-ux2.md` V08, V12, V13;
`ux2/shots/sg/zoom-roadmap.png`.

## Problems

**V12, the same pattern done two ways.**

- A segmented control swaps content on Dose log ("Logged / Against the
  schedule") but jumps to a section on Hair progress ("Staging / Photos") and
  Measurements ("Measurements / Sizes & fit"). Same look, two behaviours.
- Window labels: "30 days / 90 days" on Hormone curve, "7d ... 365d" on Wear.
- Dates in inputs show ISO `2026-10-03` (cycle history From/To, journal book,
  new tryout, measurement date); everywhere else "3 Oct 2026".
- Disclosure markers: native triangles (Manage tags, Affirmations, Body
  regions) vs chevrons in Settings.
- Headings: uppercase eyebrows ("HIGHLIGHT MODE", "SEALED") and a dash-marker
  style ("What goes in", "Past pauses") beside the kit heading.
- The flask icon means a lab result on pink, a medication on blue and a
  dilation schedule on pink; cross-link tiles are pink on one screen and
  magenta on four others.

**V08, roadmap strike-through.** On wrapped stock goals ("How you are
addressed at work or school", "A support group, or a community") the line sits
between the two lines and reads as an underline
(`transition/roadmap/+page.svelte:743-773`; the comment there calls wrapping
rare, but stock titles wrap at 390 px).

## What to build

- Pick one behaviour per pattern with Alicja (render the options), then apply
  it on the kit component: segmented control as tabs vs an in-page jump (two
  components if both are wanted, visibly different), one window-label format,
  formatted dates in date inputs, one disclosure marker, one heading style,
  one meaning per icon and colour.
- Strike each line of a wrapped goal (an inline span with a gradient
  background and `box-decoration-break: clone`, still animatable).

## Acceptance

- [ ] Each V12 pattern has one behaviour, decided on render and applied on the
      owning kit component; every consumer checked.
- [ ] Wrapped roadmap goals are struck on every line, and the strike still
      animates without a yank.
- [ ] `/impeccable` pass done; sign-off crops per pattern, trans light and
      dark.
