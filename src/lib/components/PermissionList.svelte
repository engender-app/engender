<script lang="ts">
  /* Everything the app can ask this device for, in one list (phase 10
     redesign ticket 31).

     One component, two hosts: the setup step and `/settings/permissions`.
     That is the whole reason it exists as a component - the ticket's promise
     is that "you can do this later" is true, and it is only true if the
     screen somebody comes back to is the same list they skipped.

     Neither host's title or intro line is here. A step's question is 48px on
     the field and a screen's is a ScreenHeader, and DIRECTION.md rule 12 is
     explicit that a step carries one heading; so the hosts own their heading
     and this owns the list under it.

     What a grantable row looks like is PermissionRow's; what this device
     currently allows is this file's. The two are separated so every row
     state can be rendered against the real tokens rather than only the two a
     desktop browser is ever in.

     Shape, from the fourth Mobbin sweep and rule 13: rows between hairlines,
     a title at 17, one reason line under it, one control trailing. Not
     taken: the card around each group, the per-permission paragraph, and the
     pre-prompt screens that draw the OS dialog as an illustration. */
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { roleAt } from '$lib/theme/roles';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import PermissionRow from '$lib/components/PermissionRow.svelte';
  import {
    ambientRows,
    grantRows,
    type AmbientKey,
    type GrantKey,
    type GrantStates
  } from '$lib/permissions/catalogue';
  import { openSystemSettings, readGrantStates, requestGrant } from '$lib/permissions/grant';

  let platform = $derived(isAndroid() ? ('android' as const) : ('web' as const));

  let states = $state<GrantStates>({
    notifications: 'denied',
    exactAlarms: 'denied',
    microphone: 'denied',
    camera: 'denied'
  });

  /* What has already been put in front of the person in this visit. A row
     offers the real dialog until it has been shown once; after that the
     button is the way into system settings, because a second press of a
     prompt Android has stopped showing does nothing at all. Held here rather
     than stored: it is about this visit to the list, not about the install. */
  let asked = $state(new Set<GrantKey>());

  /** The row whose answer changed last, so the arrival can be animated on
      that row alone rather than on the whole list. */
  let justChanged = $state<GrantKey | null>(null);

  let busy = $state<GrantKey | null>(null);

  let grants = $derived(grantRows(platform, states, asked));
  let ambient = $derived(ambientRows(platform));

  async function refresh() {
    states = await readGrantStates();
  }

  async function press(key: GrantKey) {
    const row = grants.find((r) => r.key === key);
    if (!row || busy) return;

    if (row.action === 'settings') {
      if (row.settingsTarget) await openSystemSettings(row.settingsTarget);
      return;
    }
    if (row.action !== 'prompt' || key === 'exactAlarms') return;

    busy = key;
    try {
      const answer = await requestGrant(key);
      asked = new Set(asked).add(key);
      states = { ...states, [key]: answer };
      if (answer === 'granted') justChanged = key;
    } finally {
      busy = null;
    }
  }

  $effect(() => {
    void refresh();
  });

  /* The way out of a refusal is a system screen, so the answer can change
     while the app is not looking. Re-read on the way back rather than
     leaving a row claiming a permission that was granted a swipe ago. */
  $effect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  /* Written out rather than reached through `m[key]`: check-copy.mjs reads
     every `m.<key>` in the tree as plain text to find the keys nothing calls,
     and a dynamic lookup is invisible to it. */
  const GRANT_COPY: Record<GrantKey, { title: () => string; why: () => string }> = {
    notifications: { title: m.perm_notifications, why: m.perm_notifications_why },
    exactAlarms: { title: m.perm_exact_alarms, why: m.perm_exact_alarms_why },
    microphone: { title: m.perm_microphone, why: m.perm_microphone_why },
    camera: { title: m.perm_camera, why: m.perm_camera_why }
  };

  const AMBIENT_COPY: Record<AmbientKey, { title: () => string; why: () => string }> = {
    takePhoto: { title: m.perm_take_photo, why: m.perm_take_photo_why },
    pickFile: { title: m.perm_pick_file, why: m.perm_pick_file_why },
    backupFolder: { title: m.perm_backup_folder, why: m.perm_backup_folder_why },
    print: { title: m.perm_print, why: m.perm_print_why },
    /* The one line that differs by platform, because the protection does:
       Android marks the clip sensitive and clears it after a minute and the
       web clipboard has neither. */
    clipboard: {
      title: m.perm_clipboard,
      why: () => (isAndroid() ? m.perm_clipboard_why() : m.perm_clipboard_why_web())
    }
  };
</script>

<div class="perms" data-permission-list>
  <p class="perm-caption">{m.perms_group_ask()}</p>
  <ListCard role={roleAt(activeFlag.roles, 0)}>
    {#each grants as row (row.key)}
      <PermissionRow
        {row}
        title={GRANT_COPY[row.key].title()}
        why={GRANT_COPY[row.key].why()}
        busy={busy === row.key}
        fresh={justChanged === row.key}
        onPress={() => press(row.key)}
      />
    {/each}
  </ListCard>

  <p class="perm-caption">{m.perms_group_no_ask()}</p>
  <ListCard role={roleAt(activeFlag.roles, 1)}>
    {#each ambient as row (row.key)}
      <ListRow
        static
        key={`perm-${row.key}`}
        icon={row.icon}
        title={AMBIENT_COPY[row.key].title()}
        subtitle={AMBIENT_COPY[row.key].why()}
        chevron={false}
        data-permission={row.key}
      />
    {/each}
  </ListCard>

  <p class="perm-closer" data-no-internet>{m.perms_no_internet()}</p>
</div>

<style>
  .perms {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Rule 12: a group inside a list is named by a caption, never by the 28px
     section rule, which a step may not carry at all. */
  .perm-caption {
    margin: var(--space-3) 0 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
  }
  .perm-caption:first-child {
    margin-top: 0;
  }

  .perm-closer {
    margin: var(--space-2) 0 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
  }

</style>
