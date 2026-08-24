/* The mouth of each mood step. One table, because the picker in the entry
   editor and the kit's own face draw the same five expressions and a mood
   that smiles differently depending on which screen is showing it is two
   moods.

   Only the geometry is shared. How a face is presented is not: the picker's
   is 44px, blinks, and lifts when it is chosen; the kit's is 22px on an
   entry and still, because a day card with six entries in it would
   otherwise carry six blinking faces, and stillness is the default
   everything outside tier 0 answers to. */
export const MOOD_MOUTHS: Record<number, string> = {
  1: 'M8 16.5c1.2-1.6 2.6-2.4 4-2.4s2.8.8 4 2.4',
  2: 'M8.5 16c1-.9 2.2-1.4 3.5-1.4s2.5.5 3.5 1.4',
  3: 'M8.5 15.5h7',
  4: 'M8.5 14.6c1 .9 2.2 1.4 3.5 1.4s2.5-.5 3.5-1.4',
  5: 'M8 14c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4'
};
