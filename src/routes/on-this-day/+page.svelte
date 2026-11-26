<script lang="ts">
  /* The pinned On this day route. Look back also opens its block in place. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { surfaceOn } from '$lib/unprompted/registry';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import OnThisDayBlock from '$lib/components/OnThisDayBlock.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { notificationsTitle } from '$lib/notificationsTitle';

  let scrollTo = $derived(page.url.searchParams.get('lookback'));
</script>

<div class="screen">
  <ScreenHeader title={m.on_this_day()} screen="on-this-day" back="/stats" />

  {#if !surfaceOn(prefs.surfaceOverrides, 'on-this-day')}
    <Notice
      icon="info"
      key="on-this-day-off"
      title={m.on_this_day_off_title()}
      text={m.on_this_day_off_body()}
      action={{ label: notificationsTitle(), href: '/settings/notifications' }}
      aria-live="polite"
    />
  {:else}
    <OnThisDayBlock {scrollTo} />
  {/if}
</div>
