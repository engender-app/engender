<script lang="ts" module>
  export interface JumpSection {
    value: string;
    label: string;
    /** The id of the element the name scrolls to. */
    target: string;
  }

</script>

<script lang="ts">
  /* An index of a long screen's halves: each name scrolls its half into
     view, and the mark under the names follows whichever half is being
     read.

     Not a Segmented (after-release 28, audit V12). Dose log's segmented
     control swaps what the screen shows; Hair progress and Measurements
     used the same pill to scroll to a section, so one look had two
     behaviours. A jump now looks like what it is - names over a rule, the
     page's own links - and a Segmented only ever swaps. The mark is the
     kit heading's 3px rule in small, travelling under the names.

     What moves is the scroll of the app's own region (`[data-app-scroll-
     region]`), never the window: the window does not scroll in this app,
     which is why Hair progress's jump back used to land nowhere (audit
     L08-07). Leaving the first half remembers where it was read to, and
     coming back lands there again, not at its top.

     The halves usually mount after this does (inside a ReadReserve, behind
     a read), so the scroll watcher waits for every target to exist before
     it observes them; Hair progress's watcher used to look once, find
     nothing and never attach. */
  import { onMount } from 'svelte';
  import { scrollBehavior } from '$lib/motion/tokens';

  let {
    name,
    sections,
    key
  }: {
    name: string;
    sections: JumpSection[];
    /** The group's identity for the walkthrough's handle (ADR-0029). */
    key: string;
  } = $props();

  /* Empty until something is chosen or scrolled to: the first half is the
     one a screen opens on. */
  let chosen = $state<string | null>(null);
  let active = $derived(chosen ?? sections[0]?.value ?? '');
  let savedScroll: number | null = null;

  let nav = $state<HTMLElement>();
  let links = $state<Record<string, HTMLElement>>({});
  let mark = $state<{ x: number; w: number } | null>(null);
  let placed = $state(false);

  const region = () => document.querySelector<HTMLElement>('[data-app-scroll-region]');

  function focusTarget(el: HTMLElement) {
    const target = el.querySelector<HTMLElement>('[role="radiogroup"], h2') ?? el;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /** Scrolls a half into view and gives it focus. Exported for a screen's
      own way back (the arrow on a half's heading) and for a hash link. */
  export function jump(value: string) {
    const index = sections.findIndex((s) => s.value === value);
    if (index < 0) return;
    const from = sections.findIndex((s) => s.value === active);
    chosen = value;
    const el = document.getElementById(sections[index].target);
    if (!el) return;
    const scroller = region();
    const behavior = scrollBehavior();
    if (index > 0 && from === 0) savedScroll = scroller?.scrollTop ?? null;
    if (index === 0 && scroller && savedScroll !== null) {
      scroller.scrollTo({ top: savedScroll, behavior });
    } else {
      el.scrollIntoView({ behavior, block: 'start' });
    }
    focusTarget(el);
  }

  function measure() {
    const link = links[active];
    if (!nav || !link) return;
    const box = nav.getBoundingClientRect();
    const own = link.getBoundingClientRect();
    mark = { x: own.left - box.left, w: own.width };
  }

  $effect(() => {
    void active;
    measure();
  });

  onMount(() => {
    const resized = new ResizeObserver(measure);
    if (nav) resized.observe(nav);
    /* The first placement draws where it is; only later moves travel. */
    const frame = requestAnimationFrame(() => (placed = true));
    return () => {
      resized.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  /* Scrolling is also choosing: the half being read is the last one whose
     top has crossed into the upper 40% of the screen. The observer only
     says when a top crosses that line, in either direction; which half is
     current is then read off the tops themselves, so scrolling back up into
     a long first half moves the mark as soon as the second half's top drops
     below the line, not when the first half's heading comes back into view. */
  $effect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ids = sections.map((s) => s.target);
    let spy: IntersectionObserver | undefined;
    let waiting: MutationObserver | undefined;

    const attach = () => {
      const targets = ids.map((id) => document.getElementById(id));
      if (targets.some((t) => !t)) return false;
      spy = new IntersectionObserver(
        () => {
          const line = window.innerHeight * 0.4;
          let current = sections[0]?.value ?? '';
          for (const [i, s] of sections.entries()) {
            const top = targets[i]?.getBoundingClientRect().top;
            if (top !== undefined && top <= line) current = s.value;
          }
          chosen = current;
        },
        { rootMargin: '0px 0px -60% 0px' }
      );
      for (const t of targets) spy.observe(t!);
      return true;
    };

    if (!attach()) {
      waiting = new MutationObserver(() => {
        if (attach()) waiting?.disconnect();
      });
      waiting.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      waiting?.disconnect();
      spy?.disconnect();
    };
  });
</script>

<nav class="section-jump" aria-label={name} data-section-jump={key} bind:this={nav}>
  {#each sections as s (s.value)}
    <a
      class="section-jump-link"
      href={`#${s.target}`}
      aria-current={active === s.value ? 'location' : undefined}
      data-jump-to={s.value}
      data-label={s.label}
      bind:this={links[s.value]}
      onclick={(event) => {
        event.preventDefault();
        jump(s.value);
      }}
    >
      {s.label}
    </a>
  {/each}
  <span
    class="section-jump-mark"
    class:is-placed={placed}
    aria-hidden="true"
    style:--mark-x={`${mark?.x ?? 0}px`}
    style:--mark-w={mark?.w ?? 0}
  ></span>
</nav>

<style>
  .section-jump {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-5);
    border-bottom: 1px solid var(--outline);
  }

  .section-jump-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target);
    min-width: var(--touch-target);
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-decoration: none;
  }

  /* The current name darkens by a copy of itself in --text fading in over
     it: opacity, the motion system's own property, rather than a colour
     transition (ADR-0078 keeps that for the segmented label meeting its
     pill). The `/ ""` keeps the copy out of the accessible name. */
  .section-jump-link::after {
    content: attr(data-label) / '';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
    pointer-events: none;
  }

  .section-jump-link[aria-current='location']::after {
    opacity: 1;
  }

  /* A 100px bar scaled to the current name's width, so the whole move is
     one transform the compositor runs: no width, no left. */
  .section-jump-mark {
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 100px;
    height: 3px;
    background: var(--text);
    transform-origin: left center;
    transform: translateX(var(--mark-x)) scaleX(calc(var(--mark-w) / 100));
    pointer-events: none;
  }

  .section-jump-mark.is-placed {
    transition: transform var(--dur-med) var(--ease-out);
  }
</style>
