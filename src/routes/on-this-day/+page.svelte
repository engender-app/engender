<script lang="ts">
  /* On-this-day (phase 4 features ticket 03, rebuilt by phase 5 UX ticket
     23, which closes spec 05). The block itself - the qualifying lookbacks,
     each with its day's entries, letters and photos - is OnThisDayBlock
     since phase 11 ticket 07, because the Look back door opens the same
     thing in place under its on-this-day tile. This route stays for one
     reason: a wrapped/on-this-day notification (phase 4 features ticket
     04) deep-links here with `?lookback=` naming the day that triggered it
     (ADR-0028), and a notification needs an address.

     The good-day rule is untouched here or there (CONTEXT: Good day is an
     absolute rule, not a suggestion). What this route still owns is the
     off state: a person who turned the feature off gets told so, with the
     way back. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import OnThisDayBlock from '$lib/components/OnThisDayBlock.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let scrollTo = $derived(page.url.searchParams.get('lookback'));
</script>

<div class="screen">
  <ScreenHeader title={m.on_this_day()} screen="on-this-day" back="/stats" />

  {#if !prefs.onThisDayEnabled}
    <Notice
      icon="info"
      key="on-this-day-off"
      title={m.on_this_day_off_title()}
      text={m.on_this_day_off_body()}
      action={{ label: m.nav_settings(), href: '/settings' }}
      aria-live="polite"
    />
  {:else}
    <OnThisDayBlock {scrollTo} />
  {/if}
</div>
