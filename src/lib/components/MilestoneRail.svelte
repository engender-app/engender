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
  import { calendarDuration } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { resolveMilestoneOrigin } from '$lib/data/provenance';
  import { timelineItems } from '$lib/data/timelineItems';
  import { placeEraLabel, timelineEraBands } from '$lib/data/timelineEraBands';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import type { Era, Milestone } from '$lib/data/types';
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { collapse } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, isReducedMotion, motionDuration } from '$lib/motion/tokens';
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

  let today = $derived(currentDay());
  let items = $derived(timelineItems(milestones, today));

  const statusOf = (milestone: Milestone) => {
    const s = milestoneStatus(milestone, today);
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.today_status();
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
  /** One hidden copy of each band's name, in `eraBandRanges` order, set in
      the same type as the drawn name: what its rendered length is, measured
      before the band it goes into is placed (last-audit UI 51). */
  let rulerEls = $state<(HTMLElement | undefined)[]>([]);

  interface BandRect {
    id: string;
    name: string;
    top: number;
    height: number;
    role: Role | undefined;
    /** Where the name sits, relative to the band's own top - the largest
        stretch of the band no dot's ring reaches into, not the band's
        full height (`placeEraLabel`). A band covering one milestone still
        has a top and a bottom clear of that milestone's own dot; a band
        covering three picks whichever of the gaps between them is
        biggest. */
    labelTop: number;
    labelHeight: number;
  }

  /** How far a dot's own ring reaches past its 12px circle - `.tl-dot`'s
      `box-shadow: 0 0 0 4px`, which `getBoundingClientRect` never counts
      as part of the element's box. A label sharing that ring's actual
      footprint is the collision this exists to rule out, not just the
      bare circle's. */
  const DOT_RING_PX = 4;

  /** `.tl-era-band`'s border. `labelTop` counts from the band's outer
      edge, the way its rows were measured, but an absolutely placed child
      counts from inside the border, so without this the name sat 1px
      lower than the stretch it was placed in (last-audit UI 51). */
  const BAND_EDGE_PX = 1;

  /** A rough vertical advance per character of a rotated `--text-xs` bold
      name (Alicja, 2026-09-16: an era too short for its own name has to be
      "artificially lengthened a little on the timeline" - "Full time"
      read as a barely-legible knot rather than a band). Generous rather
      than tight: a band a few pixels taller than its name strictly needs
      reads as a band with room to breathe, and a band a few pixels short
      of it reads as broken. This sets how long a short band is drawn; the
      name's measured length (`rulerEls`) is what decides whether the name
      actually fits between the band's dots, which a whole band's length
      says nothing about - "Full time" was 88px long and still ran into
      the today dot that took 20px of it (last-audit UI 51). */
  const CHAR_HEIGHT_PX = 8;
  const LABEL_PADDING_PX = 16;
  /** Never under the touch floor either (`floor`, the --touch-target
      token): a band is a button, and a three-letter name ("HRT") would
      otherwise draw a 40px one (after-release 18). */
  const minLabelHeight = (name: string, floor: number) =>
    Math.max(floor, name.length * CHAR_HEIGHT_PX + LABEL_PADDING_PX);

  let bandRects = $state<BandRect[]>([]);

  /* Deleting or restoring a milestone changes the bands under the rows
     while those rows are still collapsing or opening (carpet 15 row 48):
     a band whose era lost its last row was gone at full opacity in one
     frame, and a name whose biggest dot-free stretch moved jumped there,
     101px in one frame. A band leaving fades where it stood, one arriving
     after the rail first placed its bands fades in, and a name that is
     placed somewhere else within its band travels there. */
  let nameEls: Record<string, HTMLElement | undefined> = {};
  let bandsPlaced = false;
  const bandFade = () => ({ duration: bandsPlaced ? motionDuration('--dur-fast') : 0 });

  /** The name's centre, which is where its text is drawn (it is centred in
      its own box), measured from its band's top. */
  function centreIn(name: HTMLElement, band: HTMLElement) {
    const box = name.getBoundingClientRect();
    return box.top + box.height / 2 - band.getBoundingClientRect().top;
  }

  function followNames(from: Map<string, number>) {
    if (isReducedMotion()) return;
    for (const [id, offset] of from) {
      const name = nameEls[id];
      const band = name?.parentElement;
      if (!name?.isConnected || !band) continue;
      for (const running of name.getAnimations()) running.cancel();
      const dy = offset - centreIn(name, band);
      if (Math.abs(dy) < 2) continue;
      name.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
        duration: motionDuration('--dur-med'),
        easing: EASE_OUT_CSS
      });
    }
  }

  function measureBands() {
    const el = rail;
    if (!el) {
      bandRects = [];
      return;
    }
    const railTop = el.getBoundingClientRect().top;
    const floor = parseFloat(getComputedStyle(el).getPropertyValue('--touch-target')) || 0;
    const next: BandRect[] = [];
    eraBandRanges.forEach((band, index) => {
      const first = itemEls[band.startIndex];
      const last = itemEls[band.endIndex];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();

      const rings: [number, number][] = [];
      for (let i = band.startIndex; i <= band.endIndex; i += 1) {
        const dot = itemEls[i]?.querySelector('.tl-dot');
        if (!dot) continue;
        const dotRect = dot.getBoundingClientRect();
        rings.push([dotRect.top - railTop - DOT_RING_PX, dotRect.bottom - railTop + DOT_RING_PX]);
      }

      const nameLength = rulerEls[index]?.getBoundingClientRect().height ?? 0;
      const placed = placeEraLabel(
        { top: a.top - railTop, height: b.bottom - a.top },
        rings,
        nameLength,
        minLabelHeight(band.name, floor),
        { endsToday: items[band.endIndex]?.kind === 'today' }
      );

      next.push({ id: band.id, name: band.name, role: roleAt(bandRoles, index), ...placed });
    });
    /* Where each name is drawn now, relative to its band, so only a change
       of placement travels and the name never lags the band itself. */
    const from = new Map<string, number>();
    for (const [id, name] of Object.entries(nameEls)) {
      const band = name?.parentElement;
      if (name?.isConnected && band) from.set(id, centreIn(name, band));
    }
    bandRects = next;
    void tick().then(() => {
      if (next.length) bandsPlaced = true;
      followNames(from);
    });
  }

  /* Re-measured whenever the rows or the eras themselves change, and on
     any resize of the rail - a locale whose row text wraps to a second
     line changes every row's height, and with it every band under it. */
  $effect(() => {
    eraBandRanges;
    itemEls;
    rulerEls;
    measureBands();
  });
  /* A name's own length changes without the rail's when its font arrives
     late or the text size setting changes, so the rulers are watched too. */
  $effect(() => {
    if (!rail) return;
    const el = rail;
    const observer = new ResizeObserver(() => measureBands());
    observer.observe(el);
    for (const ruler of rulerEls) if (ruler) observer.observe(ruler);
    return () => observer.disconnect();
  });
</script>

<!-- One role for the whole rail rather than one per item: the rail is a
     single area of the screen, and a colour per milestone would make the
     palette a sequence of unrelated marks. -->
<div
  class="timeline"
  class:has-eras={bandRects.length > 0}
  data-milestone-rail
  bind:this={rail}
  {...roleAttrs(roleAt(activeFlag.roles, 0))}
>
  <!-- The low layer redesign ticket 16 adds: one band per era, centred on
       the thread the way the ticket's own reference draws it. It sits
       above the bare thread and below the rows: the thread's own colour is
       what a stretch with no era draws, and a band is what the same stretch
       draws once one is named, not a second thing layered over the first
       (Alicja, 2026-09-16, on why the two don't need to coexist: "the
       thread needs to be below the era rails"). A dot still paints over
       both, which is what lets its ring read as a mark on the line rather
       than a mark floating beside it.

       The name is the harder half: a band spans every row its era covers,
       and a name centred on the whole span runs straight through whichever
       dot happens to sit near the middle - the defect version of this drew
       "First year on HRT" through the milestone it was naming (2026-09-16).
       `measureBands` places it in the band's biggest dot-free stretch
       instead (`largestGap`), never the band's own geometric centre, so
       the two only compete for space when a band is too short to give the
       name anywhere else to be - and then the band is lengthened at its
       roomier end until the name fits with room either side
       (`placeEraLabel`, last-audit UI 51). Each band is a button rather than a link,
       the same reason the milestone rows below are: it opens a sheet on
       this screen's own address, not a destination. -->
  {#each eraBandRanges as band, index (band.id)}
    <span class="tl-era-ruler" aria-hidden="true" bind:this={rulerEls[index]}>{band.name}</span>
  {/each}
  {#each bandRects as band (band.id)}
    <button
      type="button"
      class="tl-era-band hit-floor"
      data-tl-era={band.id}
      style:top="{band.top}px"
      style:height="{band.height}px"
      aria-label={m.era_band_open_aria({ name: band.name })}
      onclick={() => onOpenEra(band.id)}
      {...roleAttrs(band.role)}
      transition:fade={bandFade()}
    >
      <span class="tl-era-name" bind:this={nameEls[band.id]} style:top="{band.labelTop - BAND_EDGE_PX}px" style:height="{band.labelHeight}px">{band.name}</span>
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
           side of it were what broke the line into pieces. The fuller
           sentence is hidden text rather than an aria-label, which a plain
           div does not have read (after-release 21, audit L04-14). -->
      <div class="tl-gap" data-tl-gap bind:this={itemEls[index]} transition:collapse|global>
        <span class="tl-gap-label" aria-hidden="true">{m.tl_gap_label({ duration: label })}</span>
        <span class="visually-hidden">{m.tl_gap_aria({ duration: label })}</span>
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

  /* Widened only when there is a band to show (redesign ticket 16): a
     journal with no eras spends nothing on the extra room. The dot/axis
     column moves 10px further right to make that room on its own left,
     symmetric with the 10px the band's other edge takes on its right - so
     the column stays exactly where a band centres on it rather than the
     band being centred on empty space beside the column. */
  .timeline.has-eras {
    padding-left: 40px;
  }

  /* The thread, top to bottom, behind everything - including the gap and
     the today marker, which used to interrupt it. A timeline whose axis
     stops is not an axis. An era's own band paints over it further down
     this stretch, on purpose: the thread is what an unnamed stretch draws,
     the band is what the same stretch draws once it is named, and neither
     needs to show through the other (Alicja, 2026-09-16: "the thread needs
     to be below the era rails"). */
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
  .timeline.has-eras::before {
    left: 15px;
  }

  /* An era's band (redesign ticket 16): centred on the thread and the dots
     rather than beside them, the way the ticket's own reference draws it,
     over the bare thread and under the dots (a dot's own ring still cuts a
     clean gap through a band or a name behind it, the way it always has
     through the thread). Every band wears an edge, the reason
     SpanTimeline's own bands do - a black or white flag leaves no other
     way for two adjacent bands to read as separate objects.

     The drawn band is 20px; its target is the 48px floor (.hit-floor in
     components.css), 14px out each side. That is exactly the room there
     is: the band's centre is 16px into the rail, so the target runs from
     8px into the screen's own gutter to the 40px where the milestone cards
     begin, and covers nothing that is pressable (after-release 18; it
     was 20px wide). */
  .tl-era-band {
    position: absolute;
    left: 6px;
    width: 20px;
    box-sizing: border-box;
    padding: var(--space-1) 0;
    margin: 0;
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--role-draw);
    color: var(--role-fill-ink);
    font: inherit;
    cursor: pointer;
    /* A band's colour is its place in the role order, so a band before it
       leaving recolours it; that change fades rather than cutting. */
    transition-property: background-color, border-color, color;
    transition-duration: var(--dur-med);
    transition-timing-function: var(--ease-out);
  }

  /* Placed by `measureBands`' `largestGap`, not the band's own centre - the
     one stretch of the band no dot's ring reaches into, so the name never
     competes with the mark it is naming. Centred within that stretch,
     which is its own top/height rather than the band's. */
  .tl-era-name {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The name and its ruler share one type, so the length the ruler gives
     is the length the name draws. The ruler takes its own length (no
     height of its own, nothing to stretch it) and is never seen. */
  .tl-era-name,
  .tl-era-ruler {
    writing-mode: vertical-rl;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }

  .tl-era-ruler {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .tl-item {
    position: relative;
    margin-bottom: var(--space-4);
  }

  /* The point on the axis, centred on the line and cut out of it by a ring in
     the page colour, so the line appears to pass behind rather than through.
     Not a control, and it paints over an era's band, so it lets presses
     through: a press on the dot used to fall to nothing, and the band's
     target had a 20px hole wherever a milestone sat on it (after-release
     18). */
  .tl-dot {
    pointer-events: none;
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
