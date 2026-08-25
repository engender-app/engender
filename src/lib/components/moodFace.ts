/* The five mood faces, as drawings (phase 5 ticket 31).

   One table, because a mood that smiles differently depending on which
   screen is showing it is two moods. It used to be one table of five mouths
   read by two components; it is now one table read by one component, for the
   reason set out in MoodFace.svelte.

   ## Why the eyes are part of it now

   The five mouths were five depths of one arc: 2.4 units of frown, 1.4, flat,
   1.4 of smile, 2.4. A day card draws this face at 22px, where one user unit
   is 0.92px - so step 1 and step 2 were a pixel apart and step 4 and step 5
   were the same pixel apart in the other direction. Side by side you could
   just about pick them out. On their own, which is how an entry in a day card
   actually shows up, you could not.

   Two things changed. The mouths are further apart: 3.6 units of curve at the
   extremes against 1.4 in the middle, so every neighbouring pair differs by
   2.2 units of arc depth or by the direction of the curve, and never by less.
   And the two ends of the ramp draw their eyes as lids rather than as dots -
   a downward arc at 1, an upward crease at 5. That is a change of shape
   rather than of dimension, which is the only kind of difference that
   survives being scaled to 20 pixels: no amount of moving a dot 0.3 units
   lower reads as anything at all.

   Only the ends. The three middle steps keep the dots, because the extremes
   are where a glance has to be certain and the middle is where a person is
   choosing rather than recognising. Five different pairs of eyes would also
   be five different faces, and this is meant to be one face in five moods. */

export type MoodDrawing = {
  /** The mouth, one stroked path spanning x 8 to x 16. */
  mouth: string;
  /** Present only on the two steps that draw lids instead of dots. */
  lids?: string;
};

/** Where the dot eyes sit, on the three steps that have them. */
export const MOOD_EYES = [
  { cx: 8.6, cy: 9.5 },
  { cx: 15.4, cy: 9.5 }
] as const;

export const MOOD_EYE_RADIUS = 1.25;

export const MOOD_FACES: Record<number, MoodDrawing> = {
  1: {
    mouth: 'M8 17.4C10.4 12.6 13.6 12.6 16 17.4',
    lids: 'M7.1 9.1c.6 1.4 2.4 1.4 3 0M13.9 9.1c.6 1.4 2.4 1.4 3 0'
  },
  2: { mouth: 'M8 16.2C10.4 14.33 13.6 14.33 16 16.2' },
  3: { mouth: 'M8.4 15.5h7.2' },
  4: { mouth: 'M8 14.8C10.4 16.67 13.6 16.67 16 14.8' },
  5: {
    mouth: 'M8 13.8C10.4 18.6 13.6 18.6 16 13.8',
    lids: 'M7.1 10c.6-1.4 2.4-1.4 3 0M13.9 10c.6-1.4 2.4-1.4 3 0'
  }
};
