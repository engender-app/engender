<script lang="ts">
  /* The milestone rail (phase 5 UX ticket 23, moved off its own screen by
     phase 10 redesign ticket 43). Past and future on one line, the long
     empty stretches compressed, and a marker for where today falls among
     them.

     It was a screen of its own at /timeline until this ticket, reached from
     Look back while the list of the same milestones sat one door away on
     Transition. One dataset drawn twice, and the drawing that said which
     side of today a milestone fell on was the one behind the other tab. The
     rail opens the milestones screen now and the list runs under it
     (DIRECTION.md rule 16), which is why this is a component rather than
     markup inside that screen: the arithmetic, the markup and the classes
     that draw a rail are one thing, and the screen that carries it is
     already 500 lines of editor, picker and photo prompt.

     What the rail is built from is $lib/data/timelineItems - the ordering,
     the gap rule and today's place are calendar arithmetic and belong in a
     module with tests rather than in markup. That is also where the defect
     went: the marker used to be inserted only between two milestones, so a
     journal whose milestones were all still ahead drew a timeline of the
     future with no present on it.

     Milestones are mirrored (ADR-0004), so this needs no loading state:
     they arrive with boot, bounded at tens of rows and already in date
     order from the journal.

     The rail takes the flag rather than the accent, the same rule every
     other area of the app follows (DIRECTION.md). A future milestone is the
     same mark drawn hollow, which is the one place here where colour
     carries a meaning - and it is a fact about time, not a judgement, so
     ADR-0012 has nothing to say about it.

     ## Era bands (redesign ticket 16)

     Eras left Transition's own hub row for Settings (ADR-0084: spent on
     seven other screens, created on exactly one), and this rail is the one
     place left under Transition where an era is still drawn - a low layer
     behind the marks rather than a row of its own.

     The rail has no continuous day-to-pixel scale the way the Look back
     rail's does: the long empty stretches are compressed to one gap row,
     so a band cannot be positioned by interpolating a day into a pixel.
     `timelineEraBands` anchors it to whichever rows actually exist instead
     - the first row an era's span touches to the last - and this component
     measures those rows the way anything else on the page is measured,
     through their own elements rather than a scale. An era with no row
     inside it (swept entirely into a compressed gap between two milestones
     that both fall outside it) draws no band; there is nothing on the rail
     for it to run behind.

     The colour is `theme/roles.ts`'s `eraBandRoles` - the same cycle the
     Look back rail's own era bands use, so the two rails agree on which
     stripe a given era gets. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, calendarDuration } from '$lib/data/epochDay';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { resolveMilestoneOrigin } from '$lib/data/provenance';
  import { timelineItems } from '$lib/data/timelineItems';
  import { timelineEraBands } from '$lib/data/timelineEraBands';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import type { Era, Milestone } from '$lib/data/types';
  import { collapse } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { eraBandRoles, roleAt, type Role } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import PhotoThumb from './PhotoThumb.svelte';

  let {
    milestones,
    eras,
    onOpen,
    onOpenEra
  }: {
    milestones: Milestone[];
    eras: readonly Era[];
    onOpen: (milestone: Milestone) => void;
    onOpenEra: (eraId: string) => void;
  } = $props();

  let today = $derived(todayEpochDay());
  let items = $derived(timelineItems(milestones, today));

  const statusOf = (milestone: Milestone) => {
    const s = milestoneStatus(milestone, today);
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.ms_status_today();
    return m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
  };

  const gapLabel = (fromEpochDay: number, toEpochDay: number) =>
    fmtDuration(calendarDuration(fromEpochDay, toEpochDay));

  /* Era bands: which rows each era covers (pure, tested), and the pixels
     that turns into (this component's own job, since it depends on what
     actually rendered). */
  let eraBandRanges = $derived(timelineEraBands(items, eras, today));
  let bandRoles = $derived(eraBandRoles(activeFlag.roles));

  let rail = $state<HTMLElement | undefined>();
  /** One element per row of `items`, in the same order, bound from the
      `{#each}` below regardless of which of the three shapes that row
      takes - the only thing a band needs from a row is where it sits. */
  let itemEls = $state<(HTMLElement | undefined)[]>([]);

  interface BandRect {
    id: string;
    name: string;
    top: number;
    height: number;
    role: Role | undefined;
  }

  let bandRects = $state<BandRect[]>([]);

  function measureBands() {
    const el = rail;
    if (!el) {
      bandRects = [];
      return;
    }
    const railTop = el.getBoundingClientRect().top;
    const next: BandRect[] = [];
    eraBandRanges.forEach((band, index) => {
      const first = itemEls[band.startIndex];
      const last = itemEls[band.endIndex];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      next.push({
        id: band.id,
        name: band.name,
        top: a.top - railTop,
        height: b.bottom - a.top,
        role: roleAt(bandRoles, index)
      });
    });
    bandRects = next;
  }

  /* Re-measured whenever the rows or the eras themselves change, and on
     any resize of the rail - a locale whose row text wraps to a second
     line changes every row's height, and with it every band under it. */
  $effect(() => {
    eraBandRanges;
    itemEls;
    measureBands();
  });
  $effect(() => {
    if (!rail) return;
    const el = rail;
    const observer = new ResizeObserver(() => measureBands());
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<!-- One role for the whole rail rather than one per item: the rail is a
     single area of the screen, and a colour per milestone would make the
     palette a sequence of unrelated marks. -->
<div class="timeline" data-milestone-rail bind:this={rail} {...roleAttrs(roleAt(activeFlag.roles, 0))}>
  <!-- The low layer redesign ticket 16 adds: one band per era with a row
       inside it, behind the axis and the marks (DOM order alone puts it
       there - `.timeline::before` is painted first, these next, the rows
       themselves last). Each is a button rather than a link, the same
       reason the milestone rows below are: it opens a sheet on this
       screen's own address, not a destination. -->
  {#each bandRects as band (band.id)}
    <button
      type="button"
      class="tl-era-band"
      data-tl-era={band.id}
      style:top="{band.top}px"
      style:height="{band.height}px"
      aria-label={m.era_band_open_aria({ name: band.name })}
      onclick={() => onOpenEra(band.id)}
      {...roleAttrs(band.role)}
    >
      <span class="tl-era-name">{band.name}</span>
    </button>
  {/each}
  {#each items as item, index (item.id)}
    <!-- Adding or deleting a milestone changes the rail under the person's
         hands, and a mark that cuts in or out in one frame is the yank the
         standing clause forbids. `collapse` gives the height back over the
         same curve everywhere else does, and stands down while the screen
         is still arriving (`stillArriving` in motion/reveal.ts) - the
         arrival is the field blind's, not twenty marks each playing their
         own over the top of it. -->
    {#if item.kind === 'today'}
      <div class="tl-item tl-today" data-tl-today bind:this={itemEls[index]} transition:collapse|global>
        <span class="tl-dot is-today"></span>
        <p class="tl-here">{m.tl_you_are_here()}</p>
      </div>
    {:else if item.kind === 'gap'}
      {@const label = gapLabel(item.fromEpochDay, item.toEpochDay)}
      <!-- The axis runs behind this rather than being interrupted by it,
           so the label is the only thing here: two dashed rules either
           side of it were what broke the line into pieces. -->
      <div
        class="tl-gap"
        data-tl-gap
        bind:this={itemEls[index]}
        aria-label={m.tl_gap_aria({ duration: label })}
        transition:collapse|global
      >
        <span class="tl-gap-label">{m.tl_gap_label({ duration: label })}</span>
      </div>
    {:else}
      {@const origin = resolveMilestoneOrigin(item.milestone)}
      <div
        class="tl-item"
        class:is-future={item.future}
        data-tl-item={item.milestone.id}
        bind:this={itemEls[index]}
        transition:collapse|global
      >
        <span class="tl-dot"></span>
        <div class="tl-body">
          <!-- Straight into the editor the list below opens (ticket 99
               item 4, kept by ticket 43): the two drawings of a milestone
               are on one screen now, so this is a call rather than the
               `?edit=` deep link it used to be from the other tab. -->
          <button type="button" class="tl-body-link" data-tl-open onclick={() => onOpen(item.milestone)}>
            <div class="tl-head">
              <span class="tl-name" data-tl-name>{item.milestone.name}</span>
              {#if item.future}<span class="tl-count">{statusOf(item.milestone)}</span>{/if}
            </div>
            <span class="tl-date">
              {fmtDay(item.milestone.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{item.future
                ? ''
                : ` · ${statusOf(item.milestone)}`}
            </span>
            {#if item.milestone.photo}
              <div class="tl-photo"><PhotoThumb photo={item.milestone.photo} size={88} /></div>
            {/if}
          </button>
          {#if origin}
            <p class="tl-provenance muted small">
              {origin.text}
              {#if origin.href}<a href={origin.href}>{m.prov_open_source()}</a>{/if}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  /* Back to the shape that worked (Alicja, 2026-08-25: "it looks much better
     before - what have you done? we want the vertical time axis on the left
     just like before"). The axis is a continuous line down the left, every
     milestone is a point on it, and the description sits beside the point.

     What ticket 23's own rebuild had got wrong: it kept the same parts and
     loosened all of them. The rail was 32% of a stripe on a dark ground, so it
     read as a suggestion; the dots sat outside a card with no card edge to
     measure against; and the axis stopped and restarted around the gap and the
     today marker, so there was no continuous line at all. The parts are the
     old ones again, tightened rather than restyled: the axis runs the whole
     height without a break, the dots are on it, and the only thing kept from
     the rebuild is that it wears the flag instead of the accent - which is the
     rule every other area of the app follows. */
  .timeline {
    position: relative;
    padding-left: 30px;
  }

  /* One line, top to bottom, behind everything - including the gap and the
     today marker, which used to interrupt it. A timeline whose axis stops is
     not an axis. */
  .timeline::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 1px;
    background: color-mix(in oklab, var(--role-draw) 60%, var(--bg));
  }

  /* An era's band (redesign ticket 16): the same gutter the axis and the
     dots share, wide enough to sit under both, top and height set from the
     rows it measures. Every band wears an edge, the reason SpanTimeline's
     own bands do - a black or white flag leaves no other way for two
     adjacent bands to read as separate objects. */
  .tl-era-band {
    position: absolute;
    left: 0;
    width: 20px;
    box-sizing: border-box;
    display: block;
    padding: var(--space-1) 0;
    margin: 0;
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--role-draw);
    color: var(--role-fill-ink);
    font: inherit;
    cursor: pointer;
  }

  /* Read top to bottom with the timeline itself, at the band's own left
     edge - the one label a short band still has room for, however few rows
     it covers. */
  .tl-era-name {
    display: block;
    writing-mode: vertical-rl;
    margin: 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 100%;
  }

  .tl-item {
    position: relative;
    margin-bottom: var(--space-4);
  }

  /* The point on the axis, centred on the line and cut out of it by a ring in
     the page colour, so the line appears to pass behind rather than through. */
  .tl-dot {
    position: absolute;
    left: -30px;
    top: 18px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--role-draw);
    box-shadow: 0 0 0 4px var(--bg);
  }

  /* Ahead rather than behind: the same point, unfilled. */
  .tl-item.is-future .tl-dot {
    background: var(--bg);
    box-shadow: 0 0 0 4px var(--bg), inset 0 0 0 2px var(--role-draw);
  }

  /* Today is the one mark on the axis that is not a milestone, so it is the
     one drawn in the text colour rather than the flag's. */
  .tl-today {
    margin: var(--space-5) 0;
    min-height: 20px;
  }

  .tl-today .tl-dot {
    top: 2px;
    background: var(--text);
    box-shadow: 0 0 0 4px var(--bg);
  }

  .tl-here {
    margin: 0;
    padding-top: 1px;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--text);
  }

  .tl-body {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    padding: var(--space-4);
  }

  /* Wraps everything but the provenance line - the row's own click target
     (ticket 99 item 4), kept out of the provenance <a> so the two never
     nest. */
  .tl-body-link {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .tl-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .tl-name {
    font-weight: var(--weight-bold);
    min-width: 0;
  }

  .tl-count {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
    background: var(--role-tint);
    border: var(--role-hairline);
    padding: 3px 10px;
    border-radius: var(--r-block);
  }

  .tl-date {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .tl-photo { margin-top: var(--space-3); }

  .tl-provenance {
    margin: var(--space-1) 0 0;
  }

  .tl-provenance a {
    color: inherit;
    text-decoration: underline;
  }

  /* The compressed stretch. It sits on the axis rather than replacing it: the
     line runs behind, and this is a label with the page colour behind it so
     the line does not cross the words. */
  .tl-gap {
    position: relative;
    display: flex;
    align-items: center;
    margin: var(--space-5) 0;
    padding-left: 6px;
    color: var(--text-2);
    font-size: var(--text-xs);
  }

  .tl-gap-label {
    background: var(--bg);
    padding: 2px 8px 2px 0;
  }
</style>
