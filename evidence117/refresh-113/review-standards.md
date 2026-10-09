# Ticket 117 Standards review

Candidate: `7cdb58e0a12ba7a246448336efc193b95957e8a8`

Verdict: PASS. No actionable Standards findings.

The refresh keeps the change scoped to `screens.css`. At 195px, the Theme
row stays within the 185px app content area and all three options remain
visible with 48px targets. Measurement units wraps within its row. The
paired captures show both themes at 195px, 390px and 1280px; the 768-case
matrix covers English and Polish, 16 palettes, both themes and motion
settings. It checks names, keyboard selection, focus, persistence and
horizontal overflow.

The `[data-segment]` selector matches the attribute on the actual
Segmented buttons. It keeps the previous selector's specificity and applies
only to Theme options inside the narrow container. Moving the existing
`.settings-sun-header` declaration back to the start of its original
container block restores its prior placement; it does not alter layout or
cascade with the new rules. The screen-class checker passes at this exact
SHA. The earlier failure came from moving that existing declaration after
new rules, where the checker's selector scan began recognizing it as a
single-consumer class. The refresh also removes `.segment` from the shared
stylesheet selector, which correctly avoids adding a new single-consumer
class dependency.

No markup, copy, selection behavior, focus handling or theme tokens changed.
The matrix and captures support the visual and accessibility requirements.
Production build, Svelte check, Node tier, copy, licence, screen-class and
first-load budget logs pass. The broader browser-tier run remains
inconclusive due to concurrent build regeneration and sheet-scrim
interception; focused evidence covers this CSS change. No native runtime
was needed for the shared web styling.
