# Look back Wrapped link, ticket 121

The link now reveals through a wrapper. Its text keeps the link's full
48px layout instead of being vertically centred again in each animated
height. The outgoing explanation and incoming link remain separated.
The shared `disclose` primitive, duration, reduced-motion substitute,
entry threshold, selected span and URLs are unchanged.

## Before and after

Baseline: ux-carpet integration `22961332`, with ticket 112 already merged.
A fresh one-day-to-history-band capture reproduces the collision in
`web-before/span-offer-appear-persona-light-p1-cast/006-88ms.png`.
The earlier focused probe also reproduces it at `before/light/004-69ms.png`.
Its geometry assertion reports zero overlaps because the sibling boxes
meet without intersecting; the painted text still crowds together.
That assertion alone cannot establish this fix.

Evidence lives under the integration worktree at
`.claude/evidence121/`. Each sweep directory retains the unmodified
report, style samples, every compositor PNG and timestamp manifest.
Labeled contact sheets sit beside those directories. Keep this evidence
while the ticket is referenced.

| Capture | Runs | Painted frames | Coverage |
| --- | ---: | ---: | --- |
| `web-before` | 6 | 240 | Light/dark, three repeats |
| `web-after` | 6 | 242 | Light/dark, three repeats |
| `device-before` | 6 | 434 | Light/dark, three repeats |
| `device-after` | 6 | 433 | Light/dark, three repeats |
| `desktop-after` | 2 | See manifests | Light/dark, one repeat |

All requested runs completed with no missing runs or action/capture errors.
Review of consecutive replacement frames found no text collision after
the change. Web light repeat 1 frames 7-9 show the clipped explanation
above the link with space between them. Pixel light repeat 2 frames 23-27
and dark repeat 1 frames 24-27 show the same separation. The review also
covered the replacement in the other repeats. These are sampled compositor
frames, not a claim about every display refresh between captures.

Web viewports were 390x844 and 1280x900. Native captures came from the
physical Pixel 10a, Android 17, Vanadium WebView 154.0.8037.126.0, display
1080x2424 at 420 dpi. The installed debug APK used demo build
`1791560274568`, version `0.0.0-dev+g22961332.dirty`, schema 88. APK SHA256:
`3d4d42cd2e491cc93dd092451d609c6ae7d96eb96f777c427274626066568a0b`.
Capacitor sync preceded the Gradle build and installation.

The unchanged sweep reports 31 style candidates on narrow web, 19 on
desktop, and 86 style/9 paint candidates on the Pixel after the change.
Before counts were 30 on narrow web and 65 style/8 paint on the Pixel.
These include surrounding reading arrivals and clipped departures. They
remain in the reports; this ticket does not clear the whole screen's
motion or suppress detector findings.

## Functional and design checks

The existing `lookback-span-content-motion.mjs` probe passes all ten
motion configurations: English and Polish, light/dark, reduced motion,
disguise and 195px width. It checks the thin explanation, populated facts,
selected dates, Wrapped query parameters, quick picks, reading links,
resurfacing cards and keyboard rail changes. Live dev-server runs pass
both themes too. No settle duration or detector threshold changed.

The impeccable audit and polish pass preserves the existing tokens,
underlined link, typography, touch target and disclosure motion. The
wrapper changes no resting dimensions or catalogue copy. No additional
polish change was needed. Palette screenshots use the existing probe's
16-palette light/dark loop. The first combined run lost its browser during
the gallery after all ten motion configurations passed; the palette-only
continuation passes all 32 combinations and retains its log and screenshots
in `palettes/`.

Typecheck passes with zero errors and warnings. The existing source test
was adjusted to allow a wrapper while retaining the explanation-branch
assertion. Its 39 checks pass; the final full Node run passes all 7,326
tests in 567 files. Copy, licence and screen-class checks pass. The
first-load check reports its explicit demo-build exemption; no production
budget result is claimed.

Independent Standards and Spec reviews of `22961332..5e328ad4` found no
issues. The main-relative diff was available as context; unrelated
integrated tickets were outside this review. The Spec review independently
confirmed the baseline collision and the physical Android dark replacement
across all three repeats.
