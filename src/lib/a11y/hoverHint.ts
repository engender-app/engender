/* Hover info for the app's icon-only controls (ticket 99 item 16: "the
   icons such as star, 'see it again' and delete should have a hover info on
   web").

   Every one of those controls already carries the words: an icon button
   with no accessible name is unusable by voice and unannounceable by a
   screen reader, so `aria-label` is on all of them by construction and the
   kit's own components refuse to take a handler without one. What was
   missing is that a sighted mouse user never hears any of it. `title` is
   the one hover affordance the platform gives for free, and mirroring the
   label into it means the hover text can never drift from what the control
   announces.

   Done here, once, over the app root rather than at 48 call sites. A rule
   about a whole class of control belongs in one place, and this way an
   icon button written next month gets the hover text without its author
   remembering to ask for it.

   Web with a mouse only. `(hover: hover) and (pointer: fine)` is false in
   the Android WebView, so neither the observer nor its work exists on the
   phone - where a `title` does nothing anyway, since there is no pointer to
   rest on it.

   The name is left alone. An element whose text content is empty is one
   whose label lives entirely in `aria-label`; anything with visible words
   already says what it is, and giving it a `title` on top would be a second
   copy of its own label in a tooltip. A caller that has written its own
   `title` keeps it - this only fills a gap, it never overrides a decision.

   The accname tradeoff, since it is a real one: with both present the
   accessible name still comes from `aria-label`, and `title` falls to being
   the description. Some screen readers read that description after the
   name, so a few users may hear the same short phrase twice. Weighed
   against a mouse user having no way at all to learn what an icon does,
   the repeat is the smaller cost - and it is the same tradeoff any
   icon-button tooltip makes. A designed tooltip, with its own placement and
   its own timing, is a component rather than a polish fix and is not this. */

import type { Action } from 'svelte/action';

/** Controls whose label lives only in `aria-label`, and that have not been
    given a `title` by their own author. */
const CANDIDATES = 'button[aria-label], a[aria-label], [role="button"][aria-label]';

function fillOne(el: HTMLElement): void {
  if (el.title) return;
  if (el.textContent?.trim()) return;
  const label = el.getAttribute('aria-label');
  if (label) el.title = label;
}

function fill(root: ParentNode): void {
  /* The subtree and the node itself: an added node is very often the
     control rather than a wrapper around one, and querySelectorAll never
     matches the element it is called on. */
  if (root instanceof HTMLElement && root.matches(CANDIDATES)) fillOne(root);
  for (const el of root.querySelectorAll<HTMLElement>(CANDIDATES)) fillOne(el);
}

/**
 * Mirror `aria-label` into `title` on every icon-only control under `root`,
 * and keep doing it as screens replace each other.
 *
 * A Svelte action, the same shape `resize` in $lib/motion/reveal takes: it
 * returns its teardown as `destroy`, or nothing at all where this does not
 * apply - a server, or a device with no hovering pointer, where there is
 * nothing to tear down either.
 */
export const hoverHints: Action<HTMLElement> = (root) => {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  fill(root);
  /* Attributes are watched as well as nodes: a control that swaps its own
     label with its state - a star that becomes "remove from starred" once
     it is starred - would otherwise keep the hover text it was born with. */
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        record.target.removeAttribute('title');
        fill(record.target.parentNode ?? root);
      } else {
        for (const node of record.addedNodes) if (node instanceof HTMLElement) fill(node);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-label']
  });

  return {
    destroy() {
      observer.disconnect();
    }
  };
};
