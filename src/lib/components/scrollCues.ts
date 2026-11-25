/* Which ends of a scroller have more behind them (tester report 02, ticket
   09). A new entry's steps fit the window wherever they can, and where
   something cannot - a tag group wider than the row, sixteen scales - the
   part that scrolls says so at the end where more is, and only there.

   The action goes on a frame that does not scroll and watches the scroller
   inside it (its first child unless named), writing `data-more-start` and
   `data-more-end` on the frame. The frame's stylesheet draws the cue, so a
   cue that comes or goes fades on its own transition rather than cutting.
   RTL needs nothing: scrollLeft runs negative there, and `start` is read
   as the reading start. */

export type ScrollEdges = { start: boolean; end: boolean };

/** A pixel of slack, for the fractional scroll positions a zoomed or
    snapped scroller reports at either end. */
export function edgesWithMore(position: number, client: number, scroll: number): ScrollEdges {
  const from = Math.abs(position);
  return { start: from > 1, end: scroll - client - from > 1 };
}

export type ScrollCuesParams = { axis: 'x' | 'y'; scroller?: HTMLElement | null };

export function scrollCues(frame: HTMLElement, params: ScrollCuesParams) {
  let current = params;
  let target: HTMLElement | null = null;
  const observer = new ResizeObserver(() => update());

  function update() {
    if (!target) return;
    const x = current.axis === 'x';
    const edges = edgesWithMore(
      x ? target.scrollLeft : target.scrollTop,
      x ? target.clientWidth : target.clientHeight,
      x ? target.scrollWidth : target.scrollHeight
    );
    frame.toggleAttribute('data-more-start', edges.start);
    frame.toggleAttribute('data-more-end', edges.end);
  }

  function attach() {
    target?.removeEventListener('scroll', update);
    observer.disconnect();
    target = current.scroller ?? (frame.firstElementChild as HTMLElement | null);
    if (!target) return;
    target.addEventListener('scroll', update, { passive: true });
    observer.observe(target);
    for (const child of target.children) observer.observe(child);
    update();
  }

  attach();
  return {
    update(next: ScrollCuesParams) {
      current = next;
      attach();
    },
    destroy() {
      target?.removeEventListener('scroll', update);
      observer.disconnect();
    }
  };
}
