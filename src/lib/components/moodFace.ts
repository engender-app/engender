/* The five mood faces, as drawings (phase 5 ticket 31, polished and moved
   onto a block in phase 10 ticket 27).

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
   at the extremes against 1.3 in the middle, so every neighbouring pair
   differs by 2.1 units of arc depth or by the direction of the curve, and
   never by less. And the two ends of the ramp draw their eyes as lids rather
   than as dots. That is a change of shape rather than of dimension, which is
   the only kind of difference that survives being scaled to 20 pixels: no
   amount of moving a dot 0.3 units lower reads as anything at all.

   Only the ends. The three middle steps keep the dots, because the extremes
   are where a glance has to be certain and the middle is where a person is
   choosing rather than recognising. Five different pairs of eyes would also
   be five different faces, and this is meant to be one face in five moods.

   ## What ticket 27 polished, and what it did not

   A first attempt redrew the face in filled shapes - a tapered lens for a
   mouth, bigger eyes, a blush - and Alicja turned it down on the renders:
   "too anime/soft like and doesnt fit the design of the app". So this is the
   same drawing as before, at the same weight, with four things tightened and
   nothing restyled:

   - **Every mouth is a true circular arc.** They were cubics with control
     points at fixed offsets, so the curvature ran shallow at the corners and
     tight in the middle, differently in each of the five. One radius per step
     now (4.95 units at the extremes, 9.15 in the middle, a straight line at
     3), so the five read as one instrument rather than as five sketches.
   - **One span for all five.** They were 7.2 to 8.0 units wide depending on
     the step, so the mouth's width jittered as the mood changed. It is 9.4
     for every step - wider than any of them was, because the face sits on a
     block now rather than inside a disc, and a block has the room.
   - **The mouth's box is centred on one baseline.** Its corners and its
     middle move around y 15.4 rather than the corners staying put, so a face
     does not bob up the box as the mood rises.
   - **Bigger, which is what the block bought.** Alicja asked for the face to
     fill its background better and then for more of it again once she saw the
     first attempt: the eyes are 1.45 rather than 1.25 and sit 1.4 further
     apart, the mouth is 9.4 wide against 8.0, the stroke is 1.9 rather than
     1.6, and the lids are arcs of the same family as the mouths. The mouth
     spans 42% of the block's width, against the 33% the face spent inside its
     disc.

   The disc became a rounded block (MoodFace.svelte) because a circle was the
   one shape in the app that phase 10's own language does not use, and because
   a block holds a bigger drawing at the same size. */

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
    proportion of its width the app's blocks are (DIRECTION.md's one radius).
    Exported because the geometry test measures the drawing against it and
    MoodFace.svelte draws it. */
export const MOOD_BLOCK = { x: 0.9, y: 0.9, size: 22.2, radius: 6.4 } as const;
