<script lang="ts">
  /* A group of independently-read components drawn together (ux-carpet
     ticket 190; readGroup.ts says why). The placeholder holds the group's
     space while its members answer; the members themselves are already
     mounted underneath, out of flow and unseen, so every read is running
     and every tile has decided whether it exists before anything is shown.
     Then the whole group fades in at once and the placeholder fades out
     under it (`crossfade`, out only - see its own note in reveal.ts).

     The placeholder is a guess at the group's height, not a measure of it.
     A caller wraps this in `use:resize` (the screen-part it already sits
     in), so the difference between the guess and the group's real height
     travels instead of landing in one frame - ticket 183's "any height
     error resizes smoothly".

     Shown once the members have answered and the held layer has come to
     rest, not the moment they answer. The last answer can start an exit
     inside the layer - a reading whose own read landed before the
     screen's recap drew "not enough data" and takes it off with a slide
     when the recap says otherwise - and a fade-in over that exit shows it
     as a ghost at a third of its opacity (ticket 167, measured on the
     phone). So the group waits a frame for those exits to begin, then
     finishes every running finite animation in the layer on the spot and
     shows once they have settled. Waiting them out instead held the
     phone's skeleton up for another 240ms of layout nobody could see.

     A member's own CSS entrance is a different thing: it is the arrival,
     not a leftover, and playing it where nobody can see it would spend it.
     A tile clips open from its left edge on its grid's stagger (kit.css,
     kit-block-in). So CSS animations are paused while the group holds -
     a paused entrance sits on its first frame, fully clipped, and is left
     alone - and play from there once it shows. A group whose members
     all arrive that way passes `fade={false}`: the entrance is the
     arrival, and a fade on top of it would be two. The skeleton's shimmer
     is paused along with everything else, which nobody can see either.

     The members are rendered first in the markup on purpose: they join the
     group while their own script runs, so they have to exist before
     anything below reads whether the group has answered. */
  import type { Snippet } from 'svelte';
  import Skeleton from '../Skeleton.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { provideReadGroup } from './readGroup.svelte';
  import { readRevealDuration } from '$lib/motion/screenArrival';

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

  /* A group whose members have all answered before it has painted once is
     a warm revisit painting from the reads' last answers (ux-carpet 201):
     the tab is coming back to what it showed a minute ago, not arriving. So
     it shows in its first frame: the placeholder goes without its crossfade,
     the members without their fade, and their own entrances are finished
     rather than played. "Before it has painted" rather than "when it first
     renders", because a member can answer a microtask after the group's
     first render and still well before the browser draws anything. */
  let painted = false;
  $effect(() => {
    requestAnimationFrame(() => setTimeout(() => (painted = true)));
  });
  let instant = $state(false);

  $effect(() => {
    if (group.shown || !group.answered) return;
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
      const exits = members
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity
        );
      for (const animation of exits) animation.finish();
      await Promise.allSettled(exits.map((animation) => animation.finished));
      if (!cancelled) {
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
