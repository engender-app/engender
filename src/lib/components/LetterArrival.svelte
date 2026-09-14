<script lang="ts">
  /* The moment a letter's day arrives (phase 10 redesign ticket 45).

     A letter whose unlock day is today gets the whole screen, once, and then
     never again. It is the only thing in the app somebody wrote to
     themselves and could not reach until now, and it had been arriving as
     one row in a list of four.

     Once per letter, and "once" survives a reload: `markLetterGreeted` in
     letterStatus.ts, checked against the read set too, since being handed a
     letter and leaving it closed is still having met it. Meeting it is
     unconditional in one direction only - the way past does not open the
     letter, and nothing here reaches the text before the card is opened.

     **It is the card, alone**, rather than a second drawing of one: the same
     `LetterCard` in its ready state, so opening it here is the same unfold it
     would be in the list, on one object that stays one object. What the
     arrival adds is the field, the room around it, and a way past.

     **Not a route.** A route would owe the screen registry, a door rule and a
     field of its own; this is a moment on a screen rather than a place, which
     is the reading ADR-0062 gives the return surface. It covers what it
     arrived on and uncovers it again on the way out, and nothing navigates.

     **It is drawn as a step** (rule 12): the sentence on the field, the
     answers on the page under it. Not a gate, because a gate is a step with
     nothing to skip (rule 15) and the whole point of this one is that there
     is something to skip - a letter is nobody's to force open, least of all
     the app's.

     **The whole surface is the blind** (rule 10, ADR-0080). The field is
     static here, so there is no edge to walk: what arrives is the arrival
     itself, uncovered from the top edge down over --dur-slow, field and page
     together as one sheet. It leaves the same way in reverse, which is what
     puts the letters screen back exactly as it was. Reduced motion
     substitutes the crossfade its contract asks for rather than cutting. */
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { collapse } from '$lib/motion/reveal';
  import { lockBackground, trapFocus } from './overlayLock';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import LetterCard from './LetterCard.svelte';
  import type { Letter } from '$lib/data/types';
  import type { TransitionConfig } from 'svelte/transition';

  let {
    letter,
    today,
    onopen,
    ondone
  }: {
    letter: Letter;
    today: number;
    /** The letter was opened here. The arrival stays put while it is read -
        it is already the whole screen and the card unfolds inside it. */
    onopen: () => void;
    /** The moment is over, whichever way it ended: the way past, or the
        letter read and closed. Both count as having met it. */
    ondone: () => void;
  } = $props();

  let opened = $state(false);
  let frame: HTMLElement | null = $state(null);

  /* The frame takes focus rather than the open control: a screen that
     arrived on its own should announce itself before it offers anything, and
     putting focus on the card would make the way past the second stop for a
     keyboard on a screen whose whole point is that neither is forced. */
  onMount(() => frame?.focus({ preventScroll: true }));

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') trapFocus(frame, e);
  }

  /* Escape is deliberately not a way out. The two exits mean different
     things - one opens the letter and one does not - and a key that picks
     neither would have to pick one of them silently. */
  function blind(_node: Element): TransitionConfig {
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    return {
      duration: motionDuration('--dur-slow'),
      easing: EASE_OUT,
      css: (t) => `clip-path: inset(0 0 ${(1 - t) * 100}% 0)`
    };
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="letter-arrival"
  data-letter-arrival={letter.id}
  transition:blind
  {@attach lockBackground}
>
  <section
    class="letter-arrival-frame"
    bind:this={frame}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="letter-arrival-title"
    {...roleAttrs(roleAt(activeFlag.roles, 0))}
  >
    <!-- The field: the flag's own second colour from the window's top edge
         with the sentence on it, rule 12's shape with nothing on it a moment
         cannot have. `--field` and `--field-ink` are published on <html> by
         activeFlag, which already answers disguise with --surface-2 and
         --text, so this needs no disguised variant of its own to get wrong. -->
    <div class="letter-arrival-field">
      <h1 class="letter-arrival-title" id="letter-arrival-title">{m.letters_arrival_title()}</h1>
    </div>

    <div class="letter-arrival-page">
      <LetterCard
        {letter}
        {today}
        read={false}
        open={opened}
        onopen={() => {
          opened = true;
          onopen();
        }}
        onclose={ondone}
      />

      <!-- The two ways out of the moment, and only while it is still a
           moment. The card above answers a press too, as it does in the
           list, but a screen that arrived on its own has to say what it is
           offering rather than leave it to be discovered. Once the letter is
           open the card carries its own close, which ends the moment; a
           second control down here would be the same door with the wrong
           word on it. They leave by collapsing rather than by vanishing. -->
      {#if !opened}
        <div class="letter-arrival-ways" out:collapse>
          <button
            type="button"
            class="btn btn-primary press"
            data-letter-arrival-open
            onclick={() => {
              opened = true;
              onopen();
            }}
          >
            <span>{m.letters_arrival_open()}</span>
          </button>
          <button type="button" class="btn btn-soft press" data-letter-past onclick={ondone}>
            <span>{m.not_now()}</span>
          </button>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .letter-arrival {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--bg);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .letter-arrival-frame {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    outline: none;
  }

  /* The field runs to the window's top and both side edges and is padded
     back in by the screen's own 20, so the sentence starts where the card
     under it does and sits as clear of the status bar as any other first
     line. 6px on the bottom corners only, as every field has (rule 3). */
  .letter-arrival-field {
    flex: 0 0 auto;
    padding: calc(var(--inset-top) + var(--space-6)) var(--space-5) var(--space-6);
    background: var(--field);
    color: var(--field-ink);
    border-radius: 0 0 var(--r-block) var(--r-block);
  }

  .letter-arrival-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-4xl);
    font-weight: var(--weight-display);
    letter-spacing: -0.045em;
    line-height: var(--leading-display);
  }

  /* The card sits under the field rather than centred in what is left: a
     letter arriving is the next thing after the sentence, and a gap the
     height of the window between them reads as two screens. */
  .letter-arrival-page {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-5) calc(var(--inset-bottom) + var(--space-6));
  }

  .letter-arrival-ways {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
