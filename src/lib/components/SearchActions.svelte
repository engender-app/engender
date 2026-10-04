<script lang="ts">
  /* Save this question and Random entry, as header actions (ticket 16).

     They sat as two full-width buttons over the results and put the first
     result at y 628 of 844; in the header they share the back control's
     line, which is otherwise empty. Search offers both and a saved question
     offers Random beside its rename and delete. Each is drawn only when it
     has something to act on - Save once an answer found something, Random
     once there are entries to draw from - and opens its own width from
     nothing and gives it back (`collapse`), so the header never cuts. */
  import { m } from '$lib/paraglide/messages';
  import { collapse } from '$lib/motion/reveal';
  import { whileStaying } from '$lib/motion/whileStaying';
  import Icon from './Icon.svelte';

  let { save, draw }: { save?: () => void; draw?: () => void } = $props();
</script>

{#if save}
  <button
    class="icon-btn press"
    data-search-save
    aria-label={m.saved_question_save()}
    aria-haspopup="dialog"
    transition:collapse={whileStaying}
    onclick={save}
  >
    <Icon name="bookmark" />
  </button>
{/if}
{#if draw}
  <!-- A draw from the question currently being asked, not a mode of its
       own (spec.md's own line). -->
  <button
    class="icon-btn press"
    data-search-random
    aria-label={m.random_draw_label()}
    transition:collapse={whileStaying}
    onclick={draw}
  >
    <Icon name="shuffle" />
  </button>
{/if}
