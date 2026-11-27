/* Share one drawing per mood on every screen. Preserve the differences
   at 22px, even though the smallest shipped entry mark uses 28px.
   The extremes use lids, and the three middle steps use dot eyes.
   Circular mouth arcs have radius 4.95 at the extremes and 9.15 in
   the middle steps. The neutral mouth is straight.

   Keep every mouth 9.4 units wide and center its box at y=15.4 so
   changing mood cannot make the face jitter or bob. MoodFace.svelte
   gives the drawing a rounded block with room for the wider mouth. */

type MoodDrawing = {
  /** The mouth: one stroked circular arc spanning x 7.3 to 16.7, or the flat
      line at step 3. */
  mouth: string;
  /** Present only on the two steps that draw lids instead of dots. Two arcs
      of the mouth's own family, one per eye, in one path. */
  lids?: string;
};

/** Where the dot eyes sit, on the three steps that have them. */
export const MOOD_EYES = [
  { cx: 7.9, cy: 9.3 },
  { cx: 16.1, cy: 9.3 }
] as const;

export const MOOD_EYE_RADIUS = 1.45;

export const MOOD_FACES: Record<number, MoodDrawing> = {
  1: {
    mouth: 'M7.3 17.1A4.95 4.95 0 0 1 16.7 17.1',
    lids: 'M6.2 8.85A2.06 2.06 0 0 0 9.6 8.85M14.4 8.85A2.06 2.06 0 0 0 17.8 8.85'
  },
  2: { mouth: 'M7.3 16.05A9.15 9.15 0 0 1 16.7 16.05' },
  3: { mouth: 'M7.3 15.4H16.7' },
  4: { mouth: 'M7.3 14.75A9.15 9.15 0 0 0 16.7 14.75' },
  5: {
    mouth: 'M7.3 13.7A4.95 4.95 0 0 0 16.7 13.7',
    lids: 'M6.2 9.75A2.06 2.06 0 0 1 9.6 9.75M14.4 9.75A2.06 2.06 0 0 1 17.8 9.75'
  }
};

/** The block the face is drawn on, in the 24-unit box: inset by 0.9 so its
    own 1-unit hairline sits inside the viewBox, and rounded to the same
    proportion of its width as the app uses for blocks.
    The geometry test checks this block against the drawing. */
export const MOOD_BLOCK = { x: 0.9, y: 0.9, size: 22.2, radius: 6.4 } as const;
