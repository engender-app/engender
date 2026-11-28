<script lang="ts">
  /* Mount members beneath the placeholder so every read can run.
     Members register while mounting, so place them before the
     markup that checks readiness. The caller wraps ReadGroup in
     use:resize to animate from its estimated height to the real one.

     After the final answer, wait a frame for pending exits and finish
     running finite animations in the held layer before revealing it.
     Those exits could otherwise show through the fade. CSS entrances
     stay paused on their first frame while held and play once shown.
     Pass fade=false when the members' own entrances provide the reveal.
     The outgoing placeholder crossfades over the group. */
  import type { Snippet } from 'svelte';
  import Skeleton from '../Skeleton.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { provideReadGroup } from './readGroup.svelte';
  import { fitReadArrival, readRevealDuration } from '$lib/motion/screenArrival';
  import { holdForArrival } from '$lib/motion/arrivalHold.svelte';

  let {
    answered = true,
    fade = true,
    variant = 'block',
    count = 1,
    children
  }: {
    /** Whatever the caller is waiting on besides the members' own reads -
        a read the screen holds and hands its members as a prop. */
    answered?: boolean;
    /** Fade the group in; false where every member arrives by its own CSS
        entrance. */
    fade?: boolean;
    /** The placeholder's shape and count, as Skeleton means them. */
    variant?: 'card' | 'block' | 'line';
    count?: number;
    children: Snippet;
  } = $props();

  const group = provideReadGroup(() => answered);
  let members: HTMLDivElement;

  /* A group whose members have all answered before it has painted once is a warm revisit
     painting from the reads' last answers: the tab is coming back to what it showed a
     minute ago, not arriving. So it shows in its first frame: the placeholder goes without
     its crossfade, the members without their fade, and their own entrances are finished
     rather than played. "Before it has painted" rather than "when it first renders",
     because a member can answer a microtask after the group's first render and still well
     before the browser draws anything. */
  let painted = false;
  $effect(() => {
    requestAnimationFrame(() => setTimeout(() => (painted = true)));
  });
  let instant = $state(false);

  /* Answered too late in an Android tab arrival to reveal within it, the
     group keeps its placeholder until the field stops (screenArrival.ts). */
  const released = holdForArrival(() => group.answered, () => painted);

  $effect(() => {
    if (group.shown || !released()) return;
    if (!painted) {
      for (const animation of members.getAnimations({ subtree: true })) {
        if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
      }
      instant = true;
      group.show();
      return;
    }
    let cancelled = false;
    requestAnimationFrame(async () => {
      /* A screen left within a frame of its reads answering has already
         unbound `members`, and reading it threw into the window. */
      if (cancelled) return;
      const exits = members
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity
        );
      for (const animation of exits) animation.finish();
      await Promise.allSettled(exits.map((animation) => animation.finished));
      if (!cancelled) {
        fitReadArrival(members.getAnimations({ subtree: true }));
        members.style.setProperty('--read-fade-duration', `${readRevealDuration('--dur-med')}ms`);
        group.show();
      }
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="read-group">
  <div
    class="read-group-members"
    class:is-held={!group.shown}
    class:fades={fade && !instant}
    bind:this={members}
  >
    {@render children()}
  </div>
  {#if !group.shown}
    <div class="read-group-wait" out:crossfade={{ instant }}><Skeleton {variant} {count} /></div>
  {/if}
</div>

<style>
  .read-group {
    position: relative;
  }

  .read-group-members.fades {
    transition: opacity var(--read-fade-duration, var(--dur-med)) var(--ease-out);
  }

  /* The members stand where the caller's own blocks stood, directly in a
     `.screen > .screen-part`, so they keep the rhythm app.css gives those:
     --space-5 between blocks and nothing after the last. A reading's card
     screen is two cards, and without this they would touch. */
  .read-group-members > :global(*) {
    margin-bottom: var(--space-5);
  }

  .read-group-members > :global(:last-child) {
    margin-bottom: 0;
  }

  /* Laid out, so every member mounts and reads, but out of flow, clipped to
     nothing and invisible - `visibility` takes it out of the accessibility
     tree and out of hit testing as well, and it is not transitioned, so it
     flips back in the same frame the fade starts from 0. */
  .read-group-members.is-held {
    position: absolute;
    inset: 0 0 auto;
    height: 0;
    overflow: clip;
    visibility: hidden;
    opacity: 0;
  }

  .read-group-members.is-held :global(*) {
    animation-play-state: paused;
  }

  /* No effect while the placeholder is in flow. `crossfade` lifts it out of
     flow on the way out, and this is what keeps it where it stood - at the
     group's top - rather than at the static position after the members,
     which are in flow by then. */
  .read-group-wait {
    top: 0;
    left: 0;
  }
</style>
