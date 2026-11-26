/* Give icon-only controls a hover hint on pointers that support fine
   hover. Mirror aria-label into a missing title at the app root.
   Leave controls with visible text and existing titles alone.

   The accessible name remains aria-label. Screen readers that announce
   title as a description may repeat the phrase. The media query keeps
   the observer inactive on touch-only WebViews. */

import type { Action } from 'svelte/action';

/** Controls whose label lives only in `aria-label`, and that have not been
    given a `title` by their own author. */
const CANDIDATES = 'button[aria-label], a[aria-label], [role="button"][aria-label]';

/** The titles this module wrote, so it can tell them from an author's own.

    A WeakSet rather than a marker attribute: the distinction is this
    module's bookkeeping and not something the DOM should carry around, and
    a node that leaves the document takes its entry with it. */
const ours = new WeakSet<HTMLElement>();

function fillOne(el: HTMLElement): void {
  if (el.title) return;
  if (el.textContent?.trim()) return;
  const label = el.getAttribute('aria-label');
  if (!label) return;
  el.title = label;
  ours.add(el);
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
        /* Only a title this module wrote is cleared and rewritten. Clearing
           any title at all would have broken this file's own rule two
           paragraphs up - a caller that wrote its own keeps it - the moment
           that caller also changed its `aria-label`. */
        if (!ours.has(record.target)) continue;
        record.target.removeAttribute('title');
        fillOne(record.target);
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
