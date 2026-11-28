<script lang="ts">
  /* Yearly Wrapped and On this day share this date-led link to the
     read-only letter. letterRetrospective.ts excludes sealed texts.
     Use letterOpening for the excerpt. A CSS clamp limits only the paint,
     so passing full text would make it the entire accessible link name. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import type { Letter } from '$lib/data/types';
  import {
    letterOpening,
    LETTER_OPENING_LIMIT,
    type RetrospectiveLetter
  } from '$lib/data/letterRetrospective';
  import ListRow from './kit/ListRow.svelte';

  let {
    letter,
    kind
  }: {
    letter: Letter;
    kind: RetrospectiveLetter['kind'];
  } = $props();

  let label = $derived(
    kind === 'written'
      ? m.look_back_letter_written({ date: fmtDay(letter.epochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
      : m.look_back_letter_opened({ date: fmtDay(letter.unlockEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
  );
  let opening = $derived(letterOpening(letter.text, LETTER_OPENING_LIMIT));
</script>

<ListRow
  key={letter.id}
  data-list-row="letter-preview"
  data-letter={letter.id}
  icon="envelope"
  title={label}
  subtitle={opening}
  href={`/transition/letters/${letter.id}`}
/>
