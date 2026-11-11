/* The mood a new `?seedMood=` should put on a new entry that is already open,
   or null for nothing to do. The check-in notification opens the editor on a
   face; touching another face while it is open changes the address but not
   the mounted editor, which read its seed once. The mood is applied to the
   draft the person already has (picking a face is what they just did), never
   by starting the draft over. */
export function moodToApply(previous: number | null | undefined, incoming: number | null | undefined): number | null {
  return incoming != null && incoming !== previous ? incoming : null;
}
