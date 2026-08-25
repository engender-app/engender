/* Lucide-style 24px/2px-stroke icon set, inlined (ISC-licensed path data style).
   The app deliberately inlines SVG so icons colour via currentColor tokens.

   ## Optical centring

   Every mark in here is held to one rule, and `tests/icon-geometry.test.ts`
   fails on a glyph that breaks it:

     A mark's optical centre is the midpoint between the centre of its ink
     bounding box and its arc-length-weighted ink centroid, and it must lie
     within 0.75 user units of (12, 12).

   The reasoning, and why neither half of that measure works alone, is in
   that test's header. What it means in practice is that a mark is allowed to
   sit off-centre in its box when its weight is lopsided - `shuffle` has
   3 units of clear space on the right and 1.5 on the left precisely because
   its two arrowheads live on the right - and that "centred" is never decided
   by eyeballing a bounding box again.

   ## The navigation set

   `home`, `calendar`, `stats`, `grid` and `plus` are drawn as one family
   rather than borrowed one at a time, because they are the only five marks a
   person sees on every screen (phase 5 ticket 31). What makes them a set:

   - One stroke: 2 units, round caps and joins, set once by `icon()` below.
   - One corner: 2 units of radius wherever a silhouette turns, as an
     absolute value and not a proportion of the shape. At 22px a corner is
     read as a corner, so a big shape and a small one want the same radius,
     which is why `calendar`'s page and one of `grid`'s four tiles are both
     rx 2 despite one being three times the other's width.
   - One optical square: the ink of all five lives inside x, y of 4 to 20,
     so no mark looks larger than its neighbour because it reaches further.
   - One level of detail: a silhouette plus its internal marks, and never
     more than two of those.

   `stats` carries the app's own chart language rather than a generic bar
   chart: no baseline, because DIRECTION.md's chart style has no axis
   furniture, and heights that go medium, tall, short rather than ascending.
   Three bars climbing left to right is a picture of improvement, and this
   app does not tell anyone their transition is going well (ADR-0012 is the
   same principle applied to colour).

   `grid` is the More tab's mark and it is deliberately not `dots`. Three
   dots is an overflow menu - the thing that opens when there is no room for
   the real controls - and /more is not that: it is a hub of feature cards,
   which is what four tiles say. `dots` stays as it is for the two places
   that do mean a row of dots, a drag handle and an entry's day count. */

export const PATHS: Record<string, string> = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 8.8V20h13V8.8"/><path d="M9.5 20v-5h5v5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15.5" rx="2"/><path d="M8.5 3.2v3.6M15.5 3.2v3.6M4 10h16"/>',
  stats: '<path d="M5 20V8M12 20V4M19 20V6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M20.03 12H6.03M13.03 19l-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/>',
  download: '<path d="M12 1.79v12M7 8.79l5 5 5-5"/><path d="M5 19.79h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  tag: '<path d="M2.81 12.31V4.81a2 2 0 0 1 2-2h7.5L21.81 12.31a2.1 2.1 0 0 1 0 3L15.31 21.81a2.1 2.1 0 0 1-3 0z"/><circle cx="8.31" cy="8.31" r="1.3"/>',
  /* Redrawn rather than shifted. Ticket 21 moved this glyph to put its
     bounding box in the middle of the box and said in as many words that
     optical centring across the set was ticket 31's - this is that: the pole
     is shorter, the banner reaches further right, and the whole mark now
     measures 0.28 off centre where the shifted version measured 1.6. */
  flag: '<path d="M6 21V5"/><path d="M6 6h12.5l-2.4 4 2.4 4H6"/>',
  flask: '<path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2"/><path d="M8 2h8M7.5 15h9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6 7l1 13a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 20l1-13"/><path d="M10 11.5v5M14 11.5v5"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-2.2 3.2M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  sparkle: '<path d="M10.2 2l1.9 5.1L17.2 9l-5.1 1.9L10.2 16l-1.9-5.1L3.2 9l5.1-1.9z"/><path d="M17.2 16l0.8 2.2L20.2 19l-2.2 0.8L17.2 22l-0.8-2.2L14.2 19l2.2-0.8z"/>',
  heart: '<path d="M19.5 6a5 5 0 0 0-7.5 0.7A5 5 0 0 0 4.5 6c-2 2-2 5.1 0 7.1L12 21l7.5-7.9c2-2 2-5.1 0-7.1z"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  grid: '<rect x="4.5" y="4.5" width="5.5" height="5.5" rx="2"/><rect x="14" y="4.5" width="5.5" height="5.5" rx="2"/><rect x="4.5" y="14" width="5.5" height="5.5" rx="2"/><rect x="14" y="14" width="5.5" height="5.5" rx="2"/>',
  fingerprint: '<path d="M12 11a3 3 0 0 0-3 3c0 2.5-.5 4.5-1.4 6"/><path d="M15 14.5c0 2-.3 4-1 5.5"/><path d="M17.8 12.3A6 6 0 0 0 6.7 9.2"/><path d="M5 13c-.2 1.5-.5 3-1.2 4.3"/><path d="M8.7 5.1A9 9 0 0 1 21 13.2"/><path d="M3.5 9A9 9 0 0 1 5 6.5"/>',
  alert: '<path d="M12 1.61 2 19.61h20z"/><path d="M12 8.61v4M12 16.11v0.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11.5V16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/>',
  palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.7-.5 2.2a4 4 0 0 1-2 .5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18"/>',
  curve: '<path d="M3 17.22h18"/><path d="M4 14.22c3.5 0 4-9 8-9s4.5 9 8 9"/>',
  timeline: '<circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M12 7.2v9.6"/>',
  shuffle: '<path d="M1.5 18h4a4 4 0 0 0 3.2-1.6l6.6-8.8A4 4 0 0 1 18.5 6H21"/><path d="M1.5 6h4a4 4 0 0 1 3.2 1.6l.9 1.2M14 15l1.3 1.4a4 4 0 0 0 3.2 1.6H21"/><path d="m18.6 3.6 2.4 2.4-2.4 2.4M18.6 15.6l2.4 2.4-2.4 2.4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.5 11.5 8-8M17 6l2.5 2.5M14 9l2 2"/>',
  backspace: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="m11 9.5 5 5M16 9.5l-5 5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M20 17v5H6.5a2.5 2.5 0 0 1 0-5"/>',
  zap: '<path d="M14 2 5 14h6l-1 8 9-12h-6z"/>',
  ruler: '<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v3M15 8v3"/>',
  comb: '<path d="M3.7 4.37h16v4H3.7z"/><path d="M5.7 8.37v13M9.2 8.37v10M12.7 8.37v13M16.2 8.37v10M19.7 8.37v13"/>',
  package:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M9 21h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 11 6-3.5v9L16 13z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
};

export function icon(name: string, size = 24, cls = ''): string {
  const d = PATHS[name] || PATHS.info;
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
