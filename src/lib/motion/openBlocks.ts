/* A block that arrives above content already on screen, opened by the
   compositor instead of by layout (carpet 15 row 47).

   `disclose` animates the box's height, so every frame of it lays the page
   out again on the main thread, and it starts a frame after the change that
   asked for it. On the roadmap that change is the Polish steps switch: the
   thumb (a transform) set off at once while the list under the new group
   waited for the main thread, then caught up in a lump. This opens the same
   block with transforms alone, on the same duration and curve, so the list
   leaves in the thumb's first frame and keeps its place through a stall.

   The new content is laid out whole before the first paint. What follows it
   is translated back to where it stood and travels down; the boxes that
   arrived are each translated up so their bottom edge rides the followers'
   top, clipped there, with their children translated back so the contents
   stay where layout put them. Everything is linear in the curve's one
   progress value, so every piece takes the same two-keyframe animation.

   The followers travel only as far as the screen shows (`travel`), the way
   `disclose`'s `onScreen` and `resize` do: what lies past the bottom edge
   lands there unseen when the animations let go. */

import { EASE_OUT_CSS, motionDuration } from './tokens';
import type { TransitionConfig } from 'svelte/transition';

export type Shifts = {
  followers: [number, number];
  packBox: [number, number];
  packKids: [number, number];
  sectionBox: [number, number];
  sectionKids: [number, number];
};

/** Vertical translate of each piece at the start and the end of the opening.
    `added` is the room the new blocks take, `travel` how much of it the
    followers move through (at most `added`), `packSpace` the part of it the
    first block (the pack) takes, the section taking the rest. */
export function openingShifts({ added, travel, packSpace }: { added: number; travel: number; packSpace: number }): Shifts {
  return {
    followers: [-added, travel - added],
    packBox: [-packSpace, 0],
    packKids: [packSpace, 0],
    sectionBox: [-added, travel - added],
    sectionKids: [added - packSpace, added - travel]
  };
}

export type Opening = {
  /** Whether `node` is one of the boxes this opening is holding. */
  claims: (node: Element) => boolean;
  /** An out-transition for a claimed box: the opening plays back to nothing
      and the box leaves when it has. */
  retreat: () => TransitionConfig;
};

const DOCUMENT_POSITION_PRECEDING = 2;

/** The siblings that come after `section` in the document. DOM's
    `a.compareDocumentPosition(b)` has PRECEDING set when `b` comes before
    `a`, so an element follows the section when the section precedes it. */
export function followersAfter(section: Element, siblings: Iterable<Element>): HTMLElement[] {
  return [...siblings].filter(
    (el) => el !== section && (el.compareDocumentPosition(section) & DOCUMENT_POSITION_PRECEDING) !== 0
  ) as HTMLElement[];
}

const tr = (px: number) => `0 ${px}px`;

export function openBlocks(opts: {
  pack: HTMLElement | null;
  section: HTMLElement;
  /** Elements that stood before the blocks arrived and sit between the pack
      and the section (the roadmap's social group): they move down by the
      pack's room alone. */
  between: HTMLElement[];
  followers: HTMLElement[];
  /** Where each element that was already there stood before the blocks
      arrived. */
  before: Map<Element, number>;
  /** After the opening ends (`retreated` false) or has played back. */
  onSettled: (retreated: boolean) => void;
}): Opening | null {
  const { pack, section, between, followers } = opts;
  if (typeof section.animate !== 'function' || followers.length === 0) return null;
  const from = opts.before.get(followers[0]);
  if (from === undefined) return null;
  const added = followers[0].getBoundingClientRect().top - from;
  const travel = Math.min(added, Math.max(0, innerHeight - from));
  const betweenShifts = between.map((el) => (opts.before.get(el) ?? NaN) - el.getBoundingClientRect().top);
  /* Followers that stood under the screen's bottom edge travel nothing
     painted, and neither does the section behind them. What sits between
     the pack and the section can still be on screen and still has to be
     carried down by the pack's room. */
  const followersShow = travel >= 1;
  const betweenShows = between.some((el, i) => Number.isFinite(betweenShifts[i]) && (opts.before.get(el) as number) < innerHeight);
  if (!followersShow && !betweenShows) return null;
  const packSpace = !pack
    ? 0
    : between.length > 0 && Number.isFinite(betweenShifts[0])
      ? -betweenShifts[0]
      : section.getBoundingClientRect().top - pack.getBoundingClientRect().top;
  const shifts = openingShifts({ added, travel, packSpace });

  const timing: KeyframeAnimationOptions = { duration: motionDuration('--dur-med'), easing: EASE_OUT_CSS, fill: 'both' };
  const animations: Animation[] = [];
  const clipped: HTMLElement[] = [];
  const play = (node: HTMLElement, [from, to]: [number, number]) =>
    animations.push(node.animate([{ translate: tr(from) }, { translate: tr(to) }], timing));
  const hold = (box: HTMLElement, box_: [number, number], kids: [number, number]) => {
    box.style.overflow = 'clip';
    box.style.pointerEvents = 'none';
    clipped.push(box);
    play(box, box_);
    for (const kid of Array.from(box.children) as HTMLElement[]) play(kid, kids);
  };
  if (followersShow) for (const follower of followers) play(follower, shifts.followers);
  between.forEach((el, i) => Number.isFinite(betweenShifts[i]) && play(el, [betweenShifts[i], 0]));
  if (pack) hold(pack, shifts.packBox, shifts.packKids);
  if (followersShow) hold(section, shifts.sectionBox, shifts.sectionKids);

  let live = true;
  let retreating = false;
  let started = false;
  /* Created paused, played from the second frame after. The first frame
     lays the new rows out, and on a phone that takes 70 to 124 ms before it
     is presented: an animation takes its clock from the frame it starts in,
     so one started there showed up already half its duration in, the whole
     travel in the first presented frame (carpet 15 row 47, phone proof).
     Paused at progress 0 the first frame presents the old layout, and the
     clock starts on a frame that follows a presented one. */
  for (const animation of animations) animation.pause();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!live || retreating) return;
      started = true;
      for (const animation of animations) animation.play();
    })
  );
  const settle = (retreated: boolean) => {
    if (!live) return;
    live = false;
    for (const animation of animations) animation.cancel();
    for (const box of clipped) {
      box.style.overflow = '';
      box.style.pointerEvents = '';
    }
    opts.onSettled(retreated);
  };
  const ended = () => Promise.all(animations.map((animation) => animation.finished));
  ended().then(
    () => {
      if (!retreating) settle(false);
    },
    () => settle(false)
  );

  return {
    claims: (node) => live && (node === section || node === pack),
    retreat: () => {
      if (!retreating) {
        retreating = true;
        /* The animations hold the start state until the section has left
           the document: cancelling them a frame early would show it whole. */
        const gone = () => {
          let frames = 0;
          const wait = () => {
            if (!section.isConnected || ++frames > 60) settle(true);
            else requestAnimationFrame(wait);
          };
          wait();
        };
        if (started) {
          for (const animation of animations) animation.reverse();
          ended().then(gone, () => settle(true));
        } else {
          /* Still held at progress 0: reversing there would seek to the end
             first (a negative rate at time 0 starts from the end), showing
             the group whole. It is already at its start. */
          gone();
        }
      }
      const at = Number(animations[0]?.currentTime ?? 0);
      return { duration: Math.max(1, Math.round(at)) };
    }
  };
}
