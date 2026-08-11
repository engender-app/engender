# Native units for numbers, normalized values for colour, and no worst-to-best legend

Every number shown to a person stays in native units: mood 1 to 5, a gender
dimension within its own range. A separate normalized 0-to-1 value exists only to
drive colour intensity in the heat-map and week strip. The heat-map legend is
labelled with the active dimension's own endpoint labels, not "worst" and "best".

## Why

Mood is 1 to 5, built-in dimensions are 0 to 100, and F3 allows a custom dimension
of 0 to 10, so one number cannot serve both jobs. The demo code showed the cost of
pretending otherwise: `dayMetricValue` returned `mood * 20`, `seriesForRange`
returned raw mood, and `tagInsights` returned `mood * 20` again, so "the metric's
average" meant two different numbers depending on which function was asked. Colour
needs comparability across scales; a displayed average needs to mean what the user
logged. The PRD's own tag-insight example, "avg 34 with, 71 without", is native.

The legend is a deliberate deviation from F9, which specifies "a legend explains
the scale from worst to best". That wording is coherent for mood and for
euphoria↔dysphoria, and incoherent for **binary↔nonbinary** and
**agender↔gendered**, where neither end is better. Putting nonbinary at the "best"
end of a scale is exactly the judgment F15 forbids, in the one app that cannot
afford to make it.

## Consequences

Mood is the only metric with a worst-to-best legend, and it uses the five mood
names rather than numbers. Every other metric's legend reads low label to high
label. F9's wording is treated as an error, not as a requirement.
