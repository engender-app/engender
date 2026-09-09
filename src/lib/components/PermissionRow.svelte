<script lang="ts">
  /* One row of the permissions list: an icon, what the capability is, one
     line saying what the app does with it, and one control at the trailing
     edge (phase 10 redesign ticket 31, DIRECTION.md rule 13).

     Split from PermissionList because what a row looks like and what the
     device currently allows are two different questions. The list owns the
     second - two Capacitor plugins and, on the web, navigator.permissions -
     and this owns the first, taking a resolved `GrantRow` and nothing else.
     That is what lets every state be rendered side by side against the real
     tokens (tests/browser-tier/permissions.html) instead of only the two a
     desktop browser happens to be in.

     The trailing control, from the fourth Mobbin sweep: Squarespace's
     permissions screen for the Allow that sits on the row rather than at the
     foot of the screen, Dot's for a granted row going quiet - a word in
     --text-2 where the button was, so the row keeps its explanation instead
     of disappearing with it - and Truecaller's for a refusal turning into a
     way into system settings on the row itself. */
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
    /** What the app does with the capability, in those terms rather than in
        the OS's (the ticket's own rule). One line. */
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
            class="btn perm-grant"
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
        {:else if row.state === 'unavailable'}
          <span class="perm-state">{m.perms_android_only()}</span>
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

  /* A block of the area's own stripe, which is what a control that is the
     row's one action gets here (rule 4). Narrower than the app's standing
     button, which spends var(--space-6) either side and would leave a
     two-word label no room beside a reason. */
  .perm-grant {
    /* Android's 48dp floor, which PRODUCT.md takes as the app's own because
       it is the stricter of the two platforms. The row is the only thing
       around it and the row is not itself a target, so this button is the
       whole of what a finger has to find. */
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    font-size: 15px;
    background: var(--role-draw);
    color: var(--role-fill-ink);
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
