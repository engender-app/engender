/* The five mood faces, as drawings (phase 5 ticket 31, redrawn in phase 10
   ticket 27).

   One table, because a mood that smiles differently depending on which
   screen is showing it is two moods. It used to be one table of five mouths
   read by two components; it is now one table read by one component, for the
   reason set out in MoodFace.svelte.

   ## Why the eyes are part of it

   The five mouths were five depths of one arc: 2.4 units of frown, 1.4, flat,
   1.4 of smile, 2.4. A day card drew this face at 22px, where one user unit
   is 0.92px - so step 1 and step 2 were a pixel apart and step 4 and step 5
   were the same pixel apart in the other direction. Side by side you could
   just about pick them out. On their own, which is how an entry in a day card
   actually shows up, you could not. An entry draws it at 28 now (Alicja,
   2026-08-25: the marks on Home were too small), which is the smallest any
   surface uses, and the drawing below is still settled against the harder 22.

   Two things changed then. The mouths went further apart - 3.4 units of curve
   at the extremes against 1.2 in the middle, so every neighbouring pair
   differs by 2.2 units of arc depth or by the direction of the curve, and
   never by less. And the two ends of the ramp draw their eyes as lids rather
   than as dots. That is a change of shape rather than of dimension, which is
   the only kind of difference that survives being scaled to 20 pixels: no
   amount of moving a dot 0.3 units lower reads as anything at all.

   Only the ends. The three middle steps keep the dots, because the extremes
   are where a glance has to be certain and the middle is where a person is
   choosing rather than recognising. Five different pairs of eyes would also
   be five different faces, and this is meant to be one face in five moods.

   ## What ticket 27 redrew, and why the strokes went

   Mood's ramp now runs between two hues instead of tinting one
   (ADR-0077), and the face was the other half of the same complaint: a flat
   disc under a 1.6-unit stroke is 1.5px of line at 22px, which goes thin and
   grey next to the disc's own hairline and takes the face's whole character
   with it. Every mark below is a filled shape now - there is no stroke left
   in the drawing, and `tests/mood-faces.test.ts` holds the stylesheet to
   that, because the 0.8 units of air the ink keeps inside the disc used to be
   spent on a stroke's outer edge.

   What that buys, beyond weight at 22px: a filled mouth can grow. It is a
   tapered lens, and the lens gets wider (7.8 units of span to 8.8) and
   thicker (1.7 to 2.0) as the mood rises, so the top of the ramp is a bigger
   mark than the bottom and not only a more curved one. The eyes went up from
   1.25 to 1.5 for the same reason, and down 0.4 of a unit so the face reads
   as a face rather than as a mark with two holes in it.

   The top step also blushes. It is the one pair the mouth's direction cannot
   separate (4 and 5 both smile), it is where an app is allowed a moment of
   delight, and it is two circles - the cheapest character in the set.
   Reference: Me+'s check-in row, which is where the filled features and the
   blush came from (Mobbin, 2026-09-08). */

type MoodDrawing = {
  /** The mouth, one filled lens spanning roughly x 8 to x 16. */
  mouth: string;
  /** Present only on the two steps that draw lids instead of dots. Two
      filled lenses, one per eye, in one path. */
  lids?: string;
  /** Present only on the top step. */
  cheeks?: true;
};

/** Where the dot eyes sit, on the three steps that have them. */
export const MOOD_EYES = [
  { cx: 8.5, cy: 9.9 },
  { cx: 15.5, cy: 9.9 }
] as const;

export const MOOD_EYE_RADIUS = 1.5;

/** Out at the edge of the disc and level with the mouth's corners, where a
    blush goes. Drawn under the eyes rather than inside them: the cheeks do
    not travel with the gaze, because a cheek is not something a face looks
    with. */
export const MOOD_CHEEKS = [
  { cx: 6.3, cy: 12.2 },
  { cx: 17.7, cy: 12.2 }
] as const;

export const MOOD_CHEEK_RADIUS = 1.2;

export const MOOD_FACES: Record<number, MoodDrawing> = {
  1: {
    mouth: 'M7.8 17C10.6 11.33 13.4 11.33 16.2 17C13.4 13.6 10.6 13.6 7.8 17Z',
    lids: 'M6.8 9.5C7.93 10.2 9.07 10.2 10.2 9.5C9.07 11.47 7.93 11.47 6.8 9.5ZM13.8 9.5C14.93 10.2 16.07 10.2 17.2 9.5C16.07 11.47 14.93 11.47 13.8 9.5Z'
  },
  2: { mouth: 'M8 15.8C10.67 13.13 13.33 13.13 16 15.8C13.33 15.27 10.67 15.27 8 15.8Z' },
  3: { mouth: 'M8.1 15.4C10.7 14.27 13.3 14.27 15.9 15.4C13.3 16.53 10.7 16.53 8.1 15.4Z' },
  4: { mouth: 'M8 14.6C10.67 15.27 13.33 15.27 16 14.6C13.33 17.4 10.67 17.4 8 14.6Z' },
  5: {
    mouth: 'M7.6 13.4C10.53 16.73 13.47 16.73 16.4 13.4C13.47 19.4 10.53 19.4 7.6 13.4Z',
    lids: 'M6.8 10.5C7.93 8.53 9.07 8.53 10.2 10.5C9.07 9.8 7.93 9.8 6.8 10.5ZM13.8 10.5C14.93 8.53 16.07 8.53 17.2 10.5C16.07 9.8 14.93 9.8 13.8 10.5Z',
    cheeks: true
  }
};
