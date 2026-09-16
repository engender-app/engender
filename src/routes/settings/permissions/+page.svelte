<script lang="ts">
  /* The permanent home of the permissions list (phase 10 redesign ticket 31).

     Setup's permissions step says every one of these can be granted later,
     and this screen is what makes that sentence true. It draws the same list
     from the same component, so a row that was skipped in setup is the same
     row here, with the same reason under it and the same button beside it -
     rather than a second list that says almost the same thing and drifts.

     The screen itself is a header and the component. Everything the list
     knows about what this device has granted it reads from the OS at mount,
     and again whenever the app comes back to the front, so there is nothing
     for this file to hold. */
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import PermissionList from '$lib/components/PermissionList.svelte';
</script>

<div class="screen" data-screen>
  <ScreenHeader
    title={m.perms_screen_title()}
    back="/settings"
    subtitle={m.settings_permissions_sub()}
  />

  <PermissionList />
</div>
