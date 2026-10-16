<script lang="ts">
  /* The screen for an address the app does not know, and for a route that
     threw (phase 15 last-audit UI ticket 23, finding U35).

     Without it SvelteKit drew its bare "404 Not Found" under the bar: no
     header, no way back, English in Polish too. It sits inside the layout's
     shell, so the bar and the nav are the ones every screen has, and it is
     the ordinary header and button kit rather than markup of its own.

     Says nothing about the address or the error: not the path, not
     `page.error.message`. The address bar already shows the path, and
     under disguise a screen that echoed it would be a second place for it
     to be read from. The status only picks between two fixed sentences.

     No back arrow: a stale bookmark has no entry behind it to go back to,
     and the button is the way out. It goes to Today as a plain link, so it
     is a real anchor and carries no transform of its own (press.css owns
     the press at zero specificity). */
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
