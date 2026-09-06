<script lang="ts">
  /* Deepening ticket 09 merged this screen into /settings/notifications, one
     screen with two toggle columns rather than two screens over the same
     registry. Nothing renders here so a bookmark or a stale link still
     lands somewhere real (ADR-0043's precedent) rather than 404ing.

     A client-side navigation at the top of the script, not a SvelteKit
     `redirect()` from a `+page.ts` load: this app has no server
     (adapter-static, ssr = false - svelte.config.js) and no other route in
     the app owns a redirect through `load` either; the one existing
     precedent (+layout.svelte's onboarding redirect) is client-side too.
     It replaces rather than pushes, so the link that landed here is not an
     entry the back control has to step over on the way out. */
  import { replaceRoute } from '$lib/navigation/smart-back';

  void replaceRoute('/settings/notifications');
</script>
