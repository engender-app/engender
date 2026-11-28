<script lang="ts">
  /* Use the shared shell and kit for unknown routes and route errors. Choose
     localized copy by status. Keep the URL and raw error out of the page.
     Offer a link to Today so a stale bookmark has a way out. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';

  let notFound = $derived(page.status === 404);
</script>

<div class="screen" data-error-screen={notFound ? 'not-found' : 'failed'}>
  <ScreenHeader
    title={notFound ? m.error_screen_not_found_title() : m.error_screen_failed_title()}
  />
  <p>{notFound ? m.error_screen_not_found_body() : m.error_screen_failed_body()}</p>
  <a class="btn btn-primary" href="/" data-error-home><span>{m.error_screen_home()}</span></a>
</div>
