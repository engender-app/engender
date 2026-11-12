<script lang="ts">
  /* Good moments (ADR-0037, CONTEXT: "counterevidence pool"), lifted out
     of Safe space by phase 10 redesign ticket 47 and bounded by phase 11
     ticket 15.

     The pool is days the person named as good - tagged as euphoria, or
     starred - offered back on a day that says none of it happened.

     It used to have a second half: "Save this for later" froze a copy of
     the pool into a snapshot table. Functional audit ticket 09 cut it. The
     copy carried each entry's note with no link back, so an entry the
     person deleted kept its words in a snapshot they could not see from
     the entry. The pool is a live read, so a deleted entry leaves it.

     **Six, then the rest on request.** Twenty entry cards ran the screen to
     3990px on the demo journal. Six is what fits in a viewport. The rest
     are not gone and not a second screen: "See all" discloses them in
     place (ADR-0078).

     **What the subtitle promises, the query keeps.** The pool's third arm
     used to admit an entry on one positively marked body region alone, so
     the screen could hand back a day the person had tagged as dysphoria
     and written up as miserable. entries.ts narrows that arm; the subtitle
     here is the rule stated in the person's own terms, and the two have to
     move together.

     Purely a read (ADR-0037, src/lib/data/journal/safeSpaceReads.test.ts
     pins it at the driver): opening this screen writes nothing. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtinTemplates';
  import { COUNTEREVIDENCE_LIMIT, previewWholeDays } from '$lib/data/counterevidence';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { disclose } from '$lib/motion/reveal';

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  /* What the screen opens on, and what waits behind the control. Split here
     rather than in the markup so the walkthrough can count each half.

     Drawn as days of entries, the same drawing Calendar, Search and a day
     give an entry (release audit U9: this screen alone used the older
     card). The split is by whole days (previewWholeDays), so a day the
     pool returns two entries for never gets its date bar twice. */
  let split = $derived(previewWholeDays(entryDayGroups(counterevidence)));
  let shown = $derived(split.shown);
  let held = $derived(split.held);

  /* One visit's answer, not a remembered one. Leaving the screen and coming
     back opens it on six again, which is the whole point of the bound; a
     live re-read while somebody is reading the rest must not take them
     away, so nothing resets this but the screen itself going. */
  let expanded = $state(false);
</script>

<div class="screen">
  <ScreenHeader
    title={m.safe_space_counterevidence_title()}
    back="/doubt"
    subtitle={m.safe_space_counterevidence_sub()}
    screen="safe-space-evidence"
  />

  <ReadGate read={counterevidenceQuery} variant="card" count={2}>
    {#snippet rows()}
      <EntryDays groups={shown} level={2} />

      {#if held.length > 0 && !expanded}
        <!-- Collapses out as the rest arrive rather than vanishing under
             them: the control is the thing that moved (ADR-0078), so it
             travels instead of cutting. -->
        <div out:disclose>
          <button
            type="button"
            class="btn btn-soft btn-block press"
            data-evidence-see-all
            onclick={() => (expanded = true)}
          >
            <span>{m.safe_space_evidence_see_all({ count: counterevidence.length })}</span>
          </button>
        </div>
      {/if}

      <!-- Keep the neighbour mounted before See all measures its outro.
           Otherwise its disappearing last-child margin borrows the screen
           part's bottom gap and the entries jump when it is removed. -->
      <div data-evidence-rest>
        {#if expanded}
          <EntryDays groups={held} arrive level={2} />
        {/if}
      </div>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="sparkle"
        key="no-counterevidence"
        title={m.empty_list_title()}
        text={m.doubt_no_counterevidence_body()}
        action={{ label: m.safe_space_browse_entries(), href: "/calendar", primary: true }}
      />
      <a class="btn btn-soft btn-block" href="/doubt/comfort">{m.comfort_list_title()}</a>
    {/snippet}
  </ReadGate>
</div>
