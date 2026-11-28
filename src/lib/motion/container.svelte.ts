/* Name the one entry card opening into the editor. The source card and
   the editor share a unique view transition name. SvelteKit can capture the
   outgoing page in the same task as the click, so flushSync puts the name
   in the DOM before that capture.

   For reduced motion, leave the entry unnamed so it follows the screen's
   existing crossfade. */

import { flushSync } from 'svelte';
import { isReducedMotion } from './tokens';

/** The pair's shared name. Nothing outside this module needs it; app.css
    does, and that is a string in a stylesheet either way. */
const ENTRY_CONTAINER = 'entry-open';

const opening = $state<{ entryId: string | null }>({ entryId: null });

/** The name this entry's card should carry, or nothing. Entry ids arrive as
    strings because that is what the surfaces that draw an entry already
    pass around as a key. */
export function entryContainerName(entryId: string | null | undefined): string | undefined {
  return entryId != null && opening.entryId === entryId ? ENTRY_CONTAINER : undefined;
}

/** Whether this click is going to navigate the document it happened in.

    A ctrl, cmd, shift or middle click on a link opens it somewhere else and
    never navigates here, so `closeEntryContainer` below never runs for it -
    and the card is left wearing the name into the next navigation, which is
    exactly the sit-still bug that function exists to prevent. Reachable: the
    desktop rail layout is a mouse. */
export function opensHere(event: MouseEvent): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

/** Called by the surface being tapped, before it navigates. */
export function openEntryContainer(entryId: string): void {
  if (isReducedMotion()) return;
  opening.entryId = entryId;
  flushSync();
}

/** Called by the shell on any navigation that is not the transform, so a
    name never lingers on a card through a navigation it has no part in - a
    named element is pulled out of the screen's own snapshot, so it would
    sit still while the rest of the screen slid. */
export function closeEntryContainer(): void {
  if (opening.entryId === null) return;
  opening.entryId = null;
  flushSync();
}
