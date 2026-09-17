<script lang="ts">
  /* The words the reading skips (phase 10 redesign ticket 62, ADR-0084).

     The list itself is old - phase 8 features ticket 48 - and used to hang
     under the word list on a screen of its own. Ticket 62 moved the reading
     onto the Look back door and left this behind, which is what turned
     `wordIgnore` into a reference area: its rows are spent on that reading
     and are never read here for their own sake, so it is managed in
     Settings the way modes and entry templates are, and it takes no hub
     row. ADR-0084 left the question open in exactly these words and this is
     the answer to it.

     Nothing is added here. A word starts being skipped from the reading
     that shows it, where the person can see what it is doing to the
     drawing; this screen is the one place it can be let back in, which is
     the half a cloud of two dozen words has nowhere to put. That is the
     same way through ticket 51 gave modes: the manager is in Settings and
     the surface that spends it links to the manager.

     Back to /settings rather than to the reading: this is a Settings screen
     and the header says where it sits. The address is the one it had before
     phase 8 ticket 33 moved it to the hub, so the redirect that carried
     /settings/words to /transition/words is gone and the old link is a real
     screen again. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { crossfade } from '$lib/motion/reveal';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let ignoredQuery = liveQuery((j) => j.wordIgnore.getIgnoredWords());
  let words = $derived([...(ignoredQuery.value ?? new Set<string>())].sort());
  let returnParam = $derived(page.url.searchParams.get('return'));
  let returnHref = $derived(returnParam || '/stats/words');
</script>

<div class="screen">
  <ScreenHeader title={m.words_ignored_title()} subtitle={m.words_ignored_sub()} back={returnParam || '/settings'} screen="words" />

  {#if returnParam}
    <div class="words-return-row">
      <a class="words-return-link" href={returnHref} data-words-return-reading>
        {m.words_return_to_reading()}
      </a>
    </div>
  {/if}

  {#if ignoredQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if words.length === 0}
    <Notice icon="note" key="words-ignored-empty" text={m.words_ignored_empty()} />
  {:else}
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      {#each words as word (word)}
        <ListRow
          static
          title={word}
          data-ignored-word-row={word}
          action={{
            icon: 'eye',
            label: m.words_unignore_aria({ word }),
            onclick: () => journal.wordIgnore.setWordIgnored(word, false),
            attrs: { 'data-unignore-word': word }
          }}
        />
      {/each}
    </ListCard>
  {/if}
</div>

<style>
  .words-return-row {
    margin-bottom: var(--space-3);
  }

  .words-return-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--accent);
    text-decoration: none;
  }

  .words-return-link:hover {
    text-decoration: underline;
  }
</style>
