/* What a screen reader is told, and when (after-release 21, audit L05-07).

   A live region only speaks a change of text inside a region that was
   already there. A toast, a progress bar or a notice inserted already
   holding its words is often missed, so the app keeps two regions that
   never leave (Toasts.svelte draws them) and everything that has to be
   heard goes through here.

   Emptied first and written a moment later, so the same sentence said
   twice (two saves in a row) is two changes and is heard twice. A second
   sentence inside that gap replaces the first, which is what a stage
   change on a progress bar wants. */

export type Region = 'polite' | 'assertive';

/** Long enough for NVDA and TalkBack to register the emptying as its own
    change; they collapse two edits inside one task into none. */
export const ANNOUNCE_GAP_MS = 100;

export function createAnnouncer(write: (region: Region, text: string) => void) {
  const pending: Partial<Record<Region, ReturnType<typeof setTimeout>>> = {};
  return (text: string, urgent = false) => {
    const region: Region = urgent ? 'assertive' : 'polite';
    clearTimeout(pending[region]);
    write(region, '');
    pending[region] = setTimeout(() => write(region, text), ANNOUNCE_GAP_MS);
  };
}
