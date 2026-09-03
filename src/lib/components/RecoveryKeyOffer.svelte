<script lang="ts">
  /* Offering a recovery key at the two moments the risk is legible
     (ADR-0054, ticket sec-02), and nowhere else.

     Not in onboarding. ADR-0054 rejects that placement outright and the
     reasoning is worth repeating where somebody might be tempted to add a
     third caller: onboarding is the moment with the least context and the
     highest skip rate, so most people skip it and keep the cliff, and the
     ones who accept mint a bypass before they understand what it opens and
     keep it on the same phone.

     The two moments this does cover:

     `device-bound` - somebody has just chosen the mode with no secret at
     all, which is the choice that creates the unrecoverable state, and they
     are already thinking about what happens if it goes wrong. Different copy
     per platform, because the cliff is a different event on each: a browser
     clearing its data on the web, the screen lock coming off on Android,
     where a scheduled backup may already cover it (ADR-0042).

     `secret-changed` - a passphrase or PIN has just been changed, which is
     the moment somebody is thinking about the secret at all. Shown only
     where no recovery key exists, and the caller checks that: changing a
     secret rewraps the same data key, so an existing recovery key keeps
     working and there is nothing here to regenerate.

     One screen and no navigation of its own. The caller decides what "not
     now" means, because for one of them it is a completed mode change and
     for the other a completed secret change, and both had somewhere they
     were already going. */
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let { variant, onDismiss }: { variant: 'device-bound' | 'secret-changed'; onDismiss: () => void } =
    $props();

  let body = $derived(
    variant === 'secret-changed'
      ? m.rkn_offer()
      : isAndroid()
        ? m.rko_body_android()
        : m.rko_body_web()
  );
</script>

<div class="card" data-recovery-offer={variant}>
  <p class="ob-text">{m.rko_title()}</p>
  <p class="ob-text">{body}</p>
</div>

<ListCard>
  <ListRow key="make-recovery-key" icon="key" title={m.rko_make()} href="/settings/recovery-key" />
</ListCard>

<button class="btn btn-ghost" type="button" data-skip-recovery-offer onclick={onDismiss}>
  <span>{m.rko_skip()}</span>
</button>
