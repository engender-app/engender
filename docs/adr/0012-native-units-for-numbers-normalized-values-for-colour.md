# Native units for numbers, normalized values for colour, and no worst-to-best legend

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-26
Supersedes: none

Every number shown to a person stays in native units: mood 1 to 5, a gender dimension within its own range. A separate normalized 0-to-1 value (`normalize` in `src/lib/data/metricRange.ts`) exists only to drive colour intensity in the heat-map and week strip, and is never displayed. A gender dimension's legend reads its own low and high endpoint labels, not "worst" and "best".

## Why

Mood is 1 to 5, built-in dimensions are 0 to 100, and a custom dimension can be 0 to 10, so one number cannot serve both jobs. The demo code showed the cost: three functions returned mood as `mood * 20`, raw mood and `mood * 20` again, so "the metric's average" meant two numbers depending on which was asked. Colour needs comparability across scales. A displayed average needs to mean what the user logged. The original spec's own tag-insight example, "avg 34 with, 71 without", is native.

The legend deliberately deviates from the original spec's "worst to best". That is coherent for mood but incoherent for **binary to nonbinary** and **agender to gendered**, where neither end is better. Putting nonbinary at the "best" end is exactly the judgment the product forbids, in the one app that cannot afford to make it.

## Consequences

`vocabulary.metricLegend` returns the dimension's own endpoint labels. Mood has no scale legend: the calendar draws it as round, faced cells in its own five-step scale, and a dimension keeps a flag-hued square with a legend. A dimension never gets a face. The original wording is treated as an error, not a requirement.

A change between two readings may be shown, in native units and signed, never coloured: Wrapped's scale that moved furthest and `/compare`'s headline and per-scale figures. Which scale moved "most" is decided on the normalized value, since a 10 on a 0-100 scale and a 1 on mood's 1 to 5 are not the same size of move, and that ranking value is never displayed. Arithmetic is not the judgment this ADR rules out; colouring a direction as better or worse would be.

History: legend wording amended 2026-11-02 to match the code, where mood is drawn as five faces and carries no legend; reviewed 2026-11-02. Change paragraph added 2026-11-26, when `/compare` started computing one.