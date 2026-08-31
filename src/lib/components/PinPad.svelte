<script lang="ts">
  /* The keypad and the dots above it, extracted from LockScreen when ticket
     53 gave the PIN three jobs instead of one: choosing it in the setup
     module, confirming it there, and typing it at a gate - cold start or
     mid-session. Three copies of a keypad is how the two it replaced had
     already drifted once.

     Deliberately dumb. It collects digits and says when it has enough; the
     throttle, the error copy, the biometric key and what a finished PIN
     means all belong to whoever mounted it, because those differ per job
     while the pad itself never does.

     Its motion is the half of the system that belongs on a screen met under
     stress (DIRECTION.md tier 2): dots filling as a response to a press, a
     shake keyed to the refusal count so it plays once per refusal rather
     than once per mount, and nothing that arrives or leaves. */

  import { m } from '$lib/paraglide/messages';
  import { PIN_LENGTH } from '$lib/crypto/params';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    disabled = false,
    /** Counts refusals rather than holding a flag, so the shake plays again
        on the second wrong PIN. A boolean would have to be set, cleared on a
        timer and raced against the next attempt; a number keyed into the
        markup gives a fresh element per refusal and the animation runs once
        per element with nothing to clean up. */
    refusals = 0,
    onComplete,
    /** Android's biometric key, where there is a prompt behind it. The pad
        leaves the slot empty rather than knowing what could fill it. */
    aux
  }: {
    value?: string;
    disabled?: boolean;
    refusals?: number;
    onComplete: (pin: string) => void;
    aux?: Snippet;
  } = $props();

  function press(key: string) {
    if (disabled || value.length >= PIN_LENGTH) return;
    value += key;
    if (value.length === PIN_LENGTH) onComplete(value);
  }
</script>

<!-- Keyed on the refusal count so a wrong PIN gets a fresh row and the
     shake plays once per refusal rather than once per mount. -->
{#key refusals}
  <div
    class="pin-dots"
    class:is-refused={refusals > 0}
    aria-label={m.pin_progress({ typed: String(value.length), total: String(PIN_LENGTH) })}
  >
    {#each Array.from({ length: PIN_LENGTH }) as _, i (i)}<span
        class="pin-dot"
        class:is-filled={i < value.length}
      ></span>{/each}
  </div>
{/key}

<div class="pin-pad" data-pin-pad class:is-waiting={disabled}>
  {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as n (n)}
    <button class="pin-key" data-key={n} {disabled} onclick={() => press(n)}>{n}</button>
  {/each}
  {#if aux}{@render aux()}{:else}<span></span>{/if}
  <button class="pin-key" data-key="0" {disabled} onclick={() => press('0')}>0</button>
  <button
    class="pin-key is-ghost"
    data-backspace
    aria-label={m.pin_backspace()}
    {disabled}
    onclick={() => (value = value.slice(0, -1))}
  >
    <Icon name="backspace" size={24} />
  </button>
</div>
