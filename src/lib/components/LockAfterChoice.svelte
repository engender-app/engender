<script lang="ts">
  /* When the app asks for its secret again, as one of four (lock-timing
     ticket 01). The same question on the access-mode screen and in setup's
     lock step, so it is drawn once.

     A radio group of rows rather than a Segmented: "Only when the app
     restarts" is far wider than a quarter of a 390px column, and a compact
     Segmented clips a label wider than its share. Rows with a check rather
     than ListRow's `checked`, which draws a checkbox's box - the wrong shape
     for one of four, the same call the metric picker on the Settings index
     makes. Every row carries its check and only the chosen one shows it, so
     a pick fades the mark across rather than painting it in one frame. */
  import { LOCK_AFTER_CHOICES, type LockAfter } from '$lib/data/prefs/catalogue';
  import { lockAfterLabel } from '$lib/lock/lock-after-words';
  import { rovingRadio } from './rovingRadio';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import Icon from './Icon.svelte';

  let {
    value,
    onChange,
    ...rest
  }: {
    value: LockAfter;
    onChange: (next: LockAfter) => void;
    /** The group's accessible name, `aria-label` or `aria-labelledby`. */
    [attribute: string]: unknown;
  } = $props();
</script>

<div role="radiogroup" data-lock-after use:rovingRadio {...rest}>
  <ListCard>
    {#each LOCK_AFTER_CHOICES as choice (choice)}
      <ListRow
        key={`lock-after-${choice}`}
        title={lockAfterLabel[choice]()}
        chevron={false}
        role="radio"
        aria-checked={value === choice}
        data-lock-after-choice={choice}
        onclick={() => onChange(choice)}
      >
        {#snippet trailing()}
          <span class="lock-after-mark" class:is-on={value === choice} aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
        {/snippet}
      </ListRow>
    {/each}
  </ListCard>
</div>

<style>
  .lock-after-mark {
    display: inline-flex;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .lock-after-mark.is-on {
    opacity: 1;
  }
</style>
