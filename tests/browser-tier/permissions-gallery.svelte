<script lang="ts">
  /* Every state a permission row can be in, at once, against the real tokens
     (phase 10 redesign ticket 31).

     The app itself can only ever show two of them at a time: a desktop
     browser has no notification permission to grant and no exact alarms to
     link to, so on the web those two rows are permanently "Android only",
     and the four Android states - the prompt, the settled grant, the refusal
     that becomes a settings link, and the row that never had a prompt at all
     - are unreachable in a screenshot of the built web app. `PermissionRow`
     takes a resolved row and nothing else, which is what lets them all be
     drawn here side by side.

     `grantRows` is the shipped decision function, not a fixture copy: the
     states below are produced by handing it the platform, what the OS says
     and what has already been asked, exactly as the list does.

     The strings are shipped copy, read through the same message keys the app
     uses - this tier runs the real bundle in a real browser, so paraglide
     resolves here the way it does in the app (mount.ts's own note). */
  import { m } from '$lib/paraglide/messages';
  import { grantRows, type GrantKey, type GrantStates } from '$lib/permissions/catalogue';
  import PermissionRow from '$lib/components/PermissionRow.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import { readFlagRoles, roleAt, type Role } from '$lib/theme/roles';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');

  /* Read here rather than from `activeFlag`: that store is published by the
     app shell, which this page does not have, so reading it would leave every
     row drawn in whatever was on <html> at mount. The kit gallery next door
     reads the stripes the same way and for the same reason. */
  let roles = $state<Role[]>([]);

  $effect(() => {
    const html = document.documentElement;
    html.dataset.palette = palette;
    html.dataset.theme = theme;
    roles = readFlagRoles();
  });

  const NOTHING: GrantStates = {
    notifications: 'denied',
    exactAlarms: 'denied',
    microphone: 'denied',
    camera: 'denied'
  };
  const EVERYTHING: GrantStates = {
    notifications: 'granted',
    exactAlarms: 'granted',
    microphone: 'granted',
    camera: 'granted'
  };
  const REFUSED = new Set<GrantKey>(['notifications', 'microphone', 'camera']);

  const TITLE: Record<GrantKey, () => string> = {
    notifications: m.perm_notifications,
    exactAlarms: m.perm_exact_alarms,
    microphone: m.perm_microphone,
    camera: m.perm_camera
  };
  const WHY: Record<GrantKey, () => string> = {
    notifications: m.perm_notifications_why,
    exactAlarms: m.perm_exact_alarms_why,
    microphone: m.perm_microphone_why,
    camera: m.perm_camera_why
  };

  const CASES = [
    {
      key: 'android-fresh',
      head: 'Android, nothing granted yet',
      note: 'Exact alarms has no runtime dialog on Android, so its button is the settings link from the start rather than after a refusal.',
      rows: grantRows('android', NOTHING, new Set<GrantKey>())
    },
    {
      key: 'android-granted',
      head: 'Android, everything granted',
      note: 'A granted row goes quiet rather than vanishing: the reason line is still there to be read later.',
      rows: grantRows('android', EVERYTHING, new Set<GrantKey>())
    },
    {
      key: 'android-refused',
      head: 'Android, the prompt came back no',
      note: 'The way back. The microphone and the camera had none before this ticket: the second prompt never appears and nothing linked out.',
      rows: grantRows('android', NOTHING, REFUSED)
    },
    {
      key: 'web',
      head: 'The web build',
      note: 'Two rows the web cannot grant say why instead of offering a button that would do nothing, and stay on the list rather than being dropped from it.',
      rows: grantRows('web', NOTHING, new Set<GrantKey>())
    },
    {
      key: 'web-refused',
      head: 'The web build, the browser said no',
      note: "A page cannot open the browser's own site settings, so a refused web prompt ends on a sentence rather than on a button.",
      rows: grantRows('web', NOTHING, new Set<GrantKey>(['microphone', 'camera']))
    }
  ];

  /** Which row draws the just-landed bounce, so the animation is in the
      shot rather than only in the source. */
  let fresh = $state<GrantKey | null>(null);
</script>

<div class="gallery-controls">
  <select bind:value={palette} aria-label="Palette">
    {#each PALETTES as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={theme} aria-label="Theme">
    <option value="dark">dark</option>
    <option value="light">light</option>
  </select>
  <button type="button" data-replay onclick={() => (fresh = fresh ? null : 'microphone')}>
    replay the landing
  </button>
</div>

<!-- data-app-root: press.css keys off it, so the grant buttons press here
     the way they do in the app. -->
<div class="phone" data-app-root>
  {#each CASES as group (group.key)}
    <h2 class="gallery-head">{group.head}</h2>
    <p class="gallery-note">{group.note}</p>
    <!-- The screen's own 20px, because the kit deliberately gives a row no
         horizontal inset of its own (kit.css rule 6) - a crop tight to the
         card would show the trailing control against the paper's edge,
         which is not where a screen puts it. -->
    <div class="case-frame" data-case={group.key}>
      <ListCard role={roleAt(roles, 0)}>
        {#each group.rows as row (row.key)}
          <PermissionRow
            {row}
            title={TITLE[row.key]()}
            why={WHY[row.key]()}
            fresh={group.key === 'android-granted' && fresh === row.key}
            onPress={() => {}}
          />
        {/each}
      </ListCard>
    </div>
  {/each}
</div>

<style>
  /* Fixture chrome only - nothing here is part of the kit. */
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-md);
    line-height: var(--leading-body);
  }

  .phone {
    width: 390px;
    margin: 0 auto;
    padding: 12px 0 40px;
    box-sizing: border-box;
  }

  .case-frame {
    padding: 0 var(--space-5);
    background: var(--bg);
  }

  .gallery-head,
  .gallery-note {
    padding: 0 var(--space-5);
  }

  .gallery-controls {
    display: flex;
    gap: 8px;
    padding: 8px;
    justify-content: center;
    font: inherit;
  }

  .gallery-head {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    margin: var(--space-5) 0 var(--space-2);
  }

  .gallery-note {
    font-size: var(--text-xs);
    color: var(--text-2);
    margin: 0 0 var(--space-3);
  }
</style>
