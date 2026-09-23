/* What a declared write returns when it looked and found nothing to change
   (ux-carpet 199). The write announcer in live/writes.ts announces a write's
   tables after every call, so a pass that runs in reaction to its own tables
   has to be able to say "nothing happened here", or it wakes itself up
   again. The run-out reconcile did exactly that on Android: it declares
   'stock', reran on every 'stock' announcement, and cycled about twelve
   times a second with no writes at all.

   Only a write that can know it wrote nothing returns this. Anything else
   keeps announcing as before: a spurious announcement costs one rerun, a
   missing one leaves a screen stale. The announcer swallows the marker, so
   callers of the observed journal see undefined. */

export const NOTHING_WRITTEN: unique symbol = Symbol('nothing written');
export type NothingWritten = typeof NOTHING_WRITTEN;
