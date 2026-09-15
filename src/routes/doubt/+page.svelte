<script lang="ts">
  /* Safe space (ADR-0040, CONTEXT: "Safe space"), rebuilt by phase 10
     redesign ticket 47 to open on one thing.

     It used to be a dashboard: a breathing exercise, then two tiles, two
     charts, three letters, six photographs, twenty entries, a run of saved
     snapshots and the comfort list, 5908px of it on a demo journal with
     every feature filled - the second longest screen in the app after the
     roadmap. It is also the screen a person opens on their worst day, and
     it is reachable from a live tile on Today, from a hub row and as a
     pinned Android launch route (ADR-0028), so a cold start can land
     straight on it. The app's longest surface was the one its most
     distressed reader arrived at, and it asked them to scroll past their
     own charts to reach the breathing exercise.

     Nothing was cut. The screen opens on the breath, full bleed, and
     everything it held is one tap down, in the order safeSpaceWays.ts
     states and explains. The sections themselves moved wholesale into
     /doubt/moments, /doubt/comfort, /doubt/evidence and /doubt/readings
     with their bounds, their handovers and their reasons intact.

     **Always the breath, never chosen by how you arrived.** A surface that
     opens differently depending on whether you came from the tile, the hub
     or a launch intent is one you cannot learn, and learning it is the
     whole point for a person who is not in a state to read. Same screen
     every time.

     This screen reads nothing. No live query runs on arrival, which is what
     lets a cold Android launch paint the breath as soon as the shell is up
     rather than after SQLite has answered seven of them. Each way down owns
     its own reads. */
  import { m } from '$lib/paraglide/messages';
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { SAFE_SPACE_WAYS, type SafeSpaceWayKey } from '$lib/data/safeSpaceWays';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* The words for each way, beside the list rather than in it: the order is
     a fact about the product and lives in the module (ADR-0016 keeps
     paraglide out of the node tier), and four of these five titles are the
     section headings the person already read on the screen this replaces -
     the same names, one tap further in. */
  const WAY_COPY: Record<SafeSpaceWayKey, { title: () => string; sub: () => string }> = {
    resources: { title: m.resources_title, sub: m.resources_row_sub },
    moments: { title: m.safe_space_moments_title, sub: m.safe_space_moments_sub },
    comfort: { title: m.comfort_list_title, sub: m.safe_space_comfort_sub },
    evidence: { title: m.safe_space_counterevidence_title, sub: m.safe_space_evidence_sub },
    readings: { title: m.safe_space_stats_title, sub: m.safe_space_readings_sub }
  };
</script>

<div class="screen screen-safe-space">
  <ScreenHeader title={m.safe_space_title()} back="/more" screen="safe-space" />

  <!-- The breath takes the whole of what is left, which on a 390x844 phone
       is the screen. No section heading over it: the field already says
       where this is, and a second title between the field and the ring is
       the chrome the ticket set out to clear. The eight references the
       component's own note lists draw the ring straight on the page with a
       phase word and one control, and nothing else painted. -->
  <div class="breath-stage">
    <BreathingExercise role={roleAt(activeFlag.roles, 0)} />
  </div>

  <ListCard role={roleAt(activeFlag.roles, 1)}>
    {#each SAFE_SPACE_WAYS as way, i (way.key)}
      <ListRow
        key={way.key}
        icon={way.icon}
        href={way.href}
        title={WAY_COPY[way.key].title()}
        subtitle={WAY_COPY[way.key].sub()}
        style="--row-index:{i}"
      />
    {/each}
  </ListCard>
</div>

<style>
  /* A column, so the breath can take the free height on a phone and the
     ways down sit under it rather than floating in the middle of a screen
     with nothing else on it. `.screen` is already min-height:100% of the
     scroll region, so "free" here is the window minus the field and the
     list. */
  .screen-safe-space {
    display: flex;
    flex-direction: column;
  }

  /* Full bleed in the only sense that matters on this screen: the ring is
     centred in everything the header and the list leave, so at 390x844 it
     is what a person sees and there is nothing above it to read first. It
     never shrinks below its own drawing - 272px of ring plus the
     description and the control - so a 320x568 phone scrolls rather than
     squashing it.

     The breath arrives rather than being painted where it lands: it comes
     up from 94% over --dur-authored on --ease-out (rule 10, ADR-0078).
     --dur-authored is Home's cold-boot entrance and the longest arrival the
     app has, read here rather than redefined: this is the one screen where
     slow is the subject, and a calming tool that snaps into place is the
     thing the ticket refused. Filled both ways, so the 1ms reduced-motion
     clamp ends it at rest instead of leaving it at 94%.

     The animation is on this wrapper and not on the component's own root,
     because the halo inside it is a button and press.css puts the app's
     press on every button at zero specificity - a transform of ours on the
     control itself would outrank :active and make the one thing on this
     screen unpressable. */
  .breath-stage {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: min-content;
    animation: breath-arrive var(--dur-authored) var(--ease-out) both;
  }

  @keyframes breath-arrive {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Each way down arrives as every block in the app does: its icon square
     clips open from its own left edge over --dur-slow, one --stagger-step
     per row, the words beside it cutting (rule 10, ADR-0078; the agenda's
     day block and the return surface's rows are the same movement at the
     same size). They start one --dur-fast behind the breath rather than
     after it: the first cut of this waited the breath's whole 700ms before
     the first row moved and the last row then landed 1305ms after the tap,
     measured off the trace, which is a screen still assembling long after
     it arrived. At 150ms the rows open under a breath that is still
     growing and the last one settles at 730ms, a beat after the breath
     itself - so the breath still leads and the screen is done in one.

     :global because the square is drawn inside ListRow and a scoped
     selector would never reach it. */
  .screen-safe-space :global(.kit-row-ico) {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--dur-fast) + var(--row-index, 0) * var(--stagger-step));
  }
</style>
