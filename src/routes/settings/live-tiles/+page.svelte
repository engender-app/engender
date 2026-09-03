<script lang="ts">
  /* Deepening ticket 09 merged this screen into /settings/notifications, one
     screen with two toggle columns rather than two screens over the same
     registry. Nothing renders here so a bookmark or a stale link still
     lands somewhere real (ADR-0043's precedent) rather than 404ing.

     A plain `goto` at the top of the script, not a SvelteKit `redirect()`
     from a `+page.ts` load: this app has no server (adapter-static, ssr =
     false - svelte.config.js) and no other route in the app owns a
     redirect through `load` either; the one existing precedent
     (+layout.svelte's onboarding redirect) is a client-side `goto` too. */
  import { goto } from '$app/navigation';

  goto('/settings/notifications', { replaceState: true });
</script>
