/* Tier 2's container transform: which entry is currently becoming the
   editor (phase 5 ticket 22).

   DIRECTION.md gives the app exactly one of these - "the entry card opens
   into the editor" - and says why it was still missing after ticket 18 wired
   the other three patterns: it is the one tier-2 pattern the navigation
   cannot decide on its own. Fade-through and the shared axis only need to
   know which two routes are involved. This one needs the card and the
   editor to agree on a key, so both surfaces have to be told, and that is
   what this module is.

   It is one name rather than one per entry. A view transition name has to
   be unique in the document, and only one card is ever tapped, so the
   question is not "what is this card called" but "is this the card the
   editor is growing out of". Whichever card answers yes wears the name and
   everything else wears nothing.

   **Why the flush.** SvelteKit's client intercepts the click and runs its
   navigation hooks in the same task, and the layout starts the view
   transition from inside one of them - which is the moment the browser
   photographs the outgoing screen. A `$state` write schedules a microtask,
   so without flushSync the photograph is taken before the name reaches the
   DOM and the transform has one half of a pair. Hence flushSync here rather
   than a comment somewhere asking a caller to remember.

   **Reduced motion is answered by not naming anything.** The contract is
   substitute, never delete, and tier 2's substitute is a crossfade - which
   is exactly what the whole screen already does when no element inside it
   is named, because then there is one group and app.css's reduce rules
   cover it. Suppressing the name is therefore the substitute rather than a
   way of dodging it, and it beats writing a second set of keyframes to
   animate a morph into standing still. */

import { flushSync } from 'svelte';
import { isReducedMotion } from './tokens';

/** The pair's shared name. Nothing outside this module needs it; app.css
    does, and that is a string in a stylesheet either way. */
export const ENTRY_CONTAINER = 'entry-open';

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
