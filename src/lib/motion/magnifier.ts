/* Scale the five mood faces as a finger crosses the Quick add row.
   The face under the finger grows most, its neighbours grow partly.
   Retarget every pointermove and ease over --dur-fast (150 ms) so the
   motion follows the current pointer. With reduced motion, retain only
   the armed colour cue. */

/** The scale of the face directly under the finger. Enough to be unmistakable
    next to its neighbours, and small enough that the face grows into the row
    above it rather than through the card - .fan-card clips, so a face that
    grew far enough would lose its own top. */
const PEAK = 1.24;

/** The plain rows' peak. The fan's 1.24 rides on a small face in a card that frames it; the
    same scale on a bare row is hard to see. 1.6 under the finger, on the sweep
    the fan's slide already answers, is what makes the row read as the same control. */
const ROW_PEAK = 1.6;

/** How far the lift reaches, in mood cells. Under 2 on purpose: at 1.7 an
    immediate neighbour comes up about a third of the way and the face two
    along is untouched, so the row reads as one raised face with a shoulder
    either side rather than as a wave running through all five. */
export const MAGNIFIER_SPREAD = 1.7;

/** The scale for a face centred at `centre` while the finger is at `x`, both
    in the same axis and the same units. `spread` is how far the effect
    reaches, which the caller measures from the row rather than assuming - the
    row is as wide as the fan, and the fan is as wide as the screen. */
export function magnify(x: number, centre: number, spread: number, peak: number = PEAK): number {
  if (spread <= 0) return 1;
  const away = Math.abs(x - centre) / spread;
  if (away >= 1) return 1;
  /* Squared rather than linear, so the curve is flat where the finger is.
     A finger holding still on a target still moves a pixel or two, and on a
     linear falloff that flutters the one face a person is looking at. */
  return 1 + (peak - 1) * (1 - away * away);
}

/** Every face's scale for a pointer at `x` over `count` evenly spaced cells
    across `row`. The fan's own slide keeps its own version of this loop
    because it also arms a target mid-gesture; a plain mood row (Home's
    chips, the entry editor's picker) only ever wants the scales themselves,
    on hover or under a held finger, which is what this is for - one shared
    answer rather than a third copy of the cell math. */
export function magnifyRow(x: number, row: DOMRect, count: number): number[] {
  const cell = row.width / count;
  /* Cells, times a cell. MAGNIFIER_SPREAD is a count of cells and `magnify`'s spread is in
     the coordinates' own units, and this handed the bare 1.7 across - so the reach was 1.7
     pixels, about three per cent of a cell, and the `cell` computed on the line above went
     into the centres and nowhere else. Every face was at rest unless the pointer was within
     two pixels of its exact middle. The fan's own copy of this loop always multiplied
     (QuickAdd's magnifyMoods), which is why the fan was the row that looked right and these
     two were the rows kept calling wrong. */
  return Array.from({ length: count }, (_, i) =>
    magnify(x, row.left + cell * (i + 0.5), cell * MAGNIFIER_SPREAD, ROW_PEAK)
  );
}

/* ---------- the gaze ----------

   The magnifier's second channel. Size is the
   answer only the face under the finger can give; every one of the other four
   is left at rest by it, which is why a row being crossed used to read as one
   face growing rather than as a row noticing. Direction is an answer all five
   can give at once, and it costs the eyes alone.

   It is also what the faces do with the aliveness they already had. The blink
   was an ambient loop that said nothing about the person using it; a face that
   turns to watch the finger is the same amount of motion spent on the one
   thing happening on the screen. */

/** How far an eye travels when fully turned, in user units of MoodFace's
    24-box - so about 2px on the picker's 44px face and under 1.5px on quick
    add's 34. An eye that moves far enough to be noticed on its own has
    stopped being an eye; what should be noticeable is five of them agreeing. */
export const GAZE_REACH = 1.05;

/** A distance in cells, as a turn from -1 to 1.

    One cell is already a full turn: the immediate neighbour looks as hard as
    it can and everything past it looks the same. Eyes run out of travel,
    which is the difference between a gaze and a compass needle, and it also
    means a row of nine would not have its outer faces staring harder than
    its inner ones. */
function clampTurn(cells: number): number {
  return Math.max(-1, Math.min(1, cells));
}

/** Every face's gaze for a pointer at `x`, as -1 (fully left) to 1 (fully
    right). The units are the row's cells rather than pixels, so the same
    turn reads the same on quick add's full-width fan and on the entry
    editor's narrower picker. */
export function gazeRow(x: number, row: DOMRect, count: number): number[] {
  const cell = row.width / count;
  if (!cell) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => clampTurn((x - (row.left + cell * (i + 0.5))) / cell));
}

/** Every face's gaze toward the face at `picked`, for the beat after a pick:
    the four that were not chosen turn to look at the one that was, and the
    chosen one looks straight out. A cell index rather than a coordinate,
    because after the pick the pointer is gone and the row's position on the
    screen is not something any of these surfaces should have to know.

    There is no "nothing was picked" here. A cleared mood is the row letting
    go, which is moodMagnifier's own resting value of null on every face, and
    a second spelling of nothing - all zeros, meaning five faces deliberately
    staring straight ahead - is a different state that nothing wants. */
export function gazeToCell(picked: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => clampTurn(picked - i));
}
