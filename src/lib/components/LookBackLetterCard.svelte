<script lang="ts">
  /* A letter as a retrospective fact (phase 5 deepening ticket 13).

     One row for the two surfaces that resurface an unlocked letter - the
     annual wrapped's letters section and an on-this-day lookback - so the
     two cannot drift into reading the same letter differently. The card
     takes the letter and why it surfaced, and owns nothing else: what is
     shown is a preview clamped by the kit row's own rule, and the tap goes
     to the letter itself, the one place its full text is read.

     Only an unlocked letter can reach here - letterRetrospective.ts answers
     the seal question before a caller has one - so the card draws no lock
     and never meets a sealed text. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import type { Letter } from '$lib/data/types';
  import type { RetrospectiveLetter } from '$lib/data/letterRetrospective';
  import ListRow from './kit/ListRow.svelte';

  let { letter, kind }: { letter: Letter; kind: RetrospectiveLetter['kind'] } = $props();

  let label = $derived(
    kind === 'written'
      ? m.look_back_letter_written({ date: fmtDay(letter.epochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
      : m.look_back_letter_opened({ date: fmtDay(letter.unlockEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
  );
</script>

<ListRow
  key={letter.id}
  data-list-row="letter-preview"
  data-letter={letter.id}
  icon="book"
  title={label}
  subtitle={letter.text}
  href={`/settings/letters/${letter.id}`}
/>
