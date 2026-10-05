/* What an overlay owes the screen it covers: nothing behind it reachable,
   nothing behind it scrolling, and focus back where it came from.

   Lifted out of Sheet.svelte by redesign ticket 45, which added the second
   surface that covers the whole app - a letter's arrival, which is not a
   sheet: it does not rise from the bottom edge and it must not be
   dismissible by a drag, because the two ways out of it mean different
   things. What it does share is all of this, and SF-001's reasoning applies
   to it unchanged.

   SF-001: every confirmation in the app is a sheet, and without this the
   background stayed reachable behind an open dialog - Tab walked straight
   out of it, and closing dropped focus to the document. `inert` on the app
   shell's other children keeps assistive tech and Tab out of the background
   regardless of how deep in that subtree the overlay itself lives (the
   `.contains` check below skips whichever child holds it); the scroll lock
   stops the scroll region moving underneath an overlay that does not cover
   it edge to edge; focus returns to whatever opened it on close.

   `inert` is also what settles the stacking: `.app-main` carries
   `view-transition-name: screen` and is therefore a stacking context, so an
   overlay's own z-index is spent inside it and can never beat the floating
   bar's 30 out in `.app`. `[data-app-root] > [inert]` (components.css) drops
   the bar behind `.app-main` for exactly as long as the overlay is up, which
   is the only thing that puts an overlay in front of it.

   Queries `data-app-root`/`data-app-scroll-region` rather than
   `.app`/`.app-main` so this stays wired to the shell even if those
   presentational class names ever change. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function isFocusable(element: HTMLElement): boolean {
  return element.tabIndex >= 0
    && !element.matches('[aria-disabled="true"]')
    && !element.closest('[hidden], [aria-hidden="true"]')
    && element.getClientRects().length > 0;
}

function focusableElements(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isFocusable);
}

/** First visible enabled control in `container`, if it has one. */
export function firstFocusable(container: ParentNode): HTMLElement | null {
  return focusableElements(container)[0] ?? null;
}

type OverlayOwner = {
  container: HTMLElement;
  dismiss?: () => void;
  regions: HTMLElement[];
  nested: Array<{ region: HTMLElement; dismiss: () => void }>;
};

const overlayOwners: OverlayOwner[] = [];

function topOwner(): OverlayOwner | undefined {
  return overlayOwners[overlayOwners.length - 1];
}

/** Escape and native Back consume the same top surface, including one that
    cannot currently close. The caller navigates only when no owner remains. */
export function dismissActiveOverlay(): boolean {
  const owner = topOwner();
  if (!owner) return false;
  const nested = owner.nested[owner.nested.length - 1];
  if (nested) nested.dismiss();
  else owner.dismiss?.();
  return true;
}

function onOverlayKeydown(event: KeyboardEvent): void {
  const owner = topOwner();
  if (!owner) return;
  if (event.key === 'Escape') {
    /* A non-dismissible surface still owns Escape. Letting it propagate
       would dismiss a sheet underneath it instead. */
    event.preventDefault();
    event.stopImmediatePropagation();
    dismissActiveOverlay();
  } else if (event.key === 'Tab') {
    trapFocus(owner.regions, event);
  }
}

/** Adds one transient surface to the shared keyboard-owner stack. The last
    registered surface alone receives Tab and Escape. */
export function registerOverlay(
  container: HTMLElement,
  options: { dismiss?: () => void } = {}
): () => void {
  const owner: OverlayOwner = { container, ...options, regions: [container], nested: [] };
  overlayOwners.push(owner);
  if (overlayOwners.length === 1) window.addEventListener('keydown', onOverlayKeydown, true);

  return () => {
    const index = overlayOwners.indexOf(owner);
    if (index !== -1) overlayOwners.splice(index, 1);
    if (!overlayOwners.length) window.removeEventListener('keydown', onOverlayKeydown, true);
  };
}

/** Extends the overlay containing `launcher` with a portalled child surface.
    The child shares the owner's Tab boundary but receives dismissal first.
    Outside an overlay, the popup owns its own keyboard and Back boundary. */
export function registerOverlayRegion(
  launcher: HTMLElement,
  region: HTMLElement,
  options: { dismiss: () => void; restoreFocus?: HTMLElement }
): () => void {
  const owner = [...overlayOwners].reverse().find((candidate) => candidate.container.contains(launcher));
  const dismiss = () => {
    /* Focus before dismissal, so the launcher has it back before the
       popup's own teardown runs. */
    if (options.restoreFocus?.isConnected && isFocusable(options.restoreFocus)) {
      options.restoreFocus.focus({ preventScroll: true });
    }
    options.dismiss();
  };
  if (!owner) return registerOverlay(region, { dismiss });
  const nested = { region, dismiss };
  owner.regions.push(region);
  owner.nested.push(nested);

  return () => {
    const regionIndex = owner.regions.indexOf(region);
    if (regionIndex !== -1) owner.regions.splice(regionIndex, 1);
    const nestedIndex = owner.nested.indexOf(nested);
    if (nestedIndex !== -1) owner.nested.splice(nestedIndex, 1);
  };
}

/* Locks overlap: a sheet releases only when its scrim is destroyed, after
   its outro, so a sheet raised by another's close takes its lock first and
   releases it last. Each lock used to remember and restore the state it
   found, and the second one found the first's `hidden` and `inert` - so
   the first release unlocked the background under the open second sheet,
   and the second release locked the scroll region again for good. The
   state is shared and counted instead: the first lock saves it, the last
   release restores it. */
const inertHolds = new Map<HTMLElement, number>();
let scrollHolds = 0;
let unlockedOverflow = '';

/** Whether any overlay currently owns the keyboard. */
export function overlayIsOpen(): boolean {
  return overlayOwners.length > 0;
}

/** Makes everything outside `node` inert and unscrollable. Returns the undo,
    which restores focus to its launcher or the nearest surviving control in
    the launcher's prior keyboard order.

    `keep` names shell children that stay live beside the overlay because it
    is drawn over them on purpose - quick add's scrim, and the bar its add
    button sits in. `withdraw: false` skips the blurred crossfade over the
    inert children, for an overlay whose own scrim already blurs them. */
export function lockBackground(
  node: HTMLElement,
  options: { keep?: HTMLElement[]; withdraw?: boolean } = {}
): () => void {
  const keep = options.keep ?? [];
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const root = document.querySelector('[data-app-root]');
  const priorFocusOrder = root ? focusableElements(root) : [];
  const priorFocusIndex = previouslyFocused ? priorFocusOrder.indexOf(previouslyFocused) : -1;
  const restoreInert: HTMLElement[] = [];
  if (root) {
    /* The hosted foot too (carpet 26 moved it into the column, which holds
       the sheet and so is never one of the root's inert children): left
       live it paints over a sheet whose screen is an isolated stacking
       context - the entry editor's mood row drew over "Record a physical
       change" - and its buttons stayed reachable behind a modal. */
    const withdrawn = [...root.children, ...root.querySelectorAll('[data-app-savebar]')] as HTMLElement[];
    for (const child of withdrawn) {
      if (child.contains(node) || keep.some((kept) => child.contains(kept))) continue;
      const holds = inertHolds.get(child);
      if (holds) inertHolds.set(child, holds + 1);
      else if (child.hasAttribute('inert')) continue;
      else {
        child.setAttribute('inert', '');
        inertHolds.set(child, 1);
      }
      restoreInert.push(child);
    }
  }
  /* The withdrawal crossfades rather than snapping (ux-carpet 232):
     components.css fades a pre-blurred `::after` in and delays the z-index
     drop, both keyed off `.is-withdrawn`, and both need the browser to have
     painted the *un*-withdrawn state at least once first or there is
     nothing to crossfade from - an `::after` this selector has never
     matched has no prior frame to animate away from. One
     `requestAnimationFrame` is that one frame; a class added in the same
     tick as `inert` would never be seen on its own. */
  let withdrawRaf: ReturnType<typeof requestAnimationFrame> | undefined =
    options.withdraw === false
      ? undefined
      : requestAnimationFrame(() => {
          withdrawRaf = undefined;
          for (const child of restoreInert) child.classList.add('is-withdrawn');
        });
  const mainEl = document.querySelector<HTMLElement>('[data-app-scroll-region]');
  if (mainEl) {
    if (scrollHolds++ === 0) unlockedOverflow = mainEl.style.overflow;
    mainEl.style.overflow = 'hidden';
  }

  return () => {
    if (withdrawRaf !== undefined) cancelAnimationFrame(withdrawRaf);
    restoreInert.forEach((el) => {
      const holds = (inertHolds.get(el) ?? 1) - 1;
      if (holds > 0) {
        inertHolds.set(el, holds);
        return;
      }
      inertHolds.delete(el);
      el.removeAttribute('inert');
      el.classList.remove('is-withdrawn');
    });
    if (mainEl && --scrollHolds === 0) mainEl.style.overflow = unlockedOverflow;
    queueMicrotask(() => {
      if (previouslyFocused?.isConnected && isFocusable(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
        return;
      }
      const after = priorFocusIndex >= 0 ? priorFocusOrder.slice(priorFocusIndex + 1) : priorFocusOrder;
      const before = priorFocusIndex >= 0 ? priorFocusOrder.slice(0, priorFocusIndex).reverse() : [];
      [...after, ...before].find((element) => element.isConnected && isFocusable(element))
        ?.focus({ preventScroll: true });
    });
  };
}

/** Keeps Tab and Shift+Tab inside `container`. Call from a `keydown` handler
    that has already established the key is Tab. */
function trapFocus(containers: HTMLElement | HTMLElement[] | null, e: KeyboardEvent): void {
  if (!containers) return;
  const regions = Array.isArray(containers) ? containers : [containers];
  const focusables = regions.flatMap(focusableElements);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  let target: HTMLElement | null = null;
  const active = document.activeElement;
  const owningRegion = regions.findIndex((region) => region.contains(active));
  if (owningRegion === -1) {
    target = e.shiftKey ? last : first;
  } else if (!focusables.includes(active as HTMLElement)) {
    /* Composite widgets such as the date picker move focus into grid cells
       with tabindex=-1. A browser has no next Tab stop from a portalled cell, so
       treat that registered region as the end of the owner's Tab order. */
    target = e.shiftKey ? last : first;
  } else if (e.shiftKey && active === first) {
    target = last;
  } else if (!e.shiftKey && active === last) {
    target = first;
  }
  if (target) {
    e.preventDefault();
    target.focus({ preventScroll: true });
  }
}
