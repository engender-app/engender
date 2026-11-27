<script lang="ts">
  /* Render a resolved GrantRow. PermissionList reads device status,
     and permissions.html can show this component's states together.
     Put Allow on the row, replace it with status after grant, and
     link to system settings after refusal. */
  import { m } from '$lib/paraglide/messages';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import type { GrantRow } from '$lib/permissions/catalogue';

  /* Written out rather than reached through `m[note]`: check-copy.mjs reads
     every `m.<key>` in the tree as plain text to find the keys nothing calls,
     and a dynamic lookup is invisible to it. */
  const NOTE = { browserHolds: m.perms_note_browser_holds };

  let {
    row,
    title,
    why,
    busy = false,
    fresh = false,
    onPress
  }: {
    row: GrantRow;
    title: string;
    /** Describe what the app does with this permission in one line. */
    why: string;
    busy?: boolean;
    /** True on the row whose answer just changed, which is the one row that
        animates rather than the whole list re-arriving. */
    fresh?: boolean;
    onPress: () => void;
  } = $props();
</script>

<!-- The reason always, and a second line only on the one row that can dead
     end: a web prompt the browser has refused and will not show again, which
     is the single refusal the app cannot hand a button to. ListRow drops a
     falsy line, so every other row is one line under its title. -->
<ListRow
  static
  key={`perm-${row.key}`}
  icon={row.icon}
  {title}
  subtitle={[why, row.note !== null && NOTE[row.note]()]}
  chevron={false}
  data-permission={row.key}
  data-permission-state={row.state}
>
  {#snippet trailing()}
    <!-- Keyed on what the control is, so the swap from a button to a settled
         word is an arrival rather than a label change: the keyed block is a
         new element, and a new element runs the entrance animation below.
         The wrapper carries that animation, never the button - press.css
         holds the app's press at zero specificity, so a transform on the
         control itself would outrank :active and make it unpressable. -->
    {#key `${row.action}-${row.state}`}
      <span class="perm-trail" class:is-fresh={fresh}>
        {#if row.action === 'prompt' || row.action === 'settings'}
          <button
            type="button"
            class="btn btn-soft perm-grant"
            data-grant={row.key}
            disabled={busy}
            aria-label={row.action === 'prompt'
              ? m.perms_allow_aria({ thing: title })
              : m.perms_settings_aria({ thing: title })}
            onclick={onPress}
          >
            {row.action === 'prompt' ? m.perms_allow() : m.perms_open_settings()}
          </button>
        {:else if row.state === 'granted'}
          <span class="perm-state" data-granted>{m.perms_allowed()}</span>
        {:else}
          <span class="perm-state">{m.perms_browser_blocked()}</span>
        {/if}
      </span>
    {/key}
  {/snippet}
</ListRow>

<style>
  .perm-trail {
    display: inline-flex;
    align-items: center;
    /* Every swap moves. The default is a small rise into place; a grant that
       just landed gets the bounce below instead. Transform and opacity only,
       which is the whole of what materials.css allows. */
    animation: perm-swap var(--dur-med) var(--ease-out) both;
  }

  /* The app's secondary button, an outline block of the page. It was a filled block of the
     area's stripe, a button drawn nowhere else in the app. Narrower than the standing
     button, which spends var(--space-6) either side and would leave a two-word label no
     room beside a reason. */
  .perm-grant {
    /* This button is the only target in the row. Keep it at least 48dp. */
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    font-size: 15px;
    white-space: nowrap;
  }

  .perm-state {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
    text-align: right;
  }

  .perm-trail.is-fresh {
    animation-name: perm-land;
    animation-duration: var(--dur-slow);
  }

  @keyframes perm-swap {
    from {
      transform: translateY(4px);
      opacity: 0;
    }
  }

  @keyframes perm-land {
    0% {
      transform: scale(0.7);
      opacity: 0;
    }
    60% {
      transform: scale(1.08);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
