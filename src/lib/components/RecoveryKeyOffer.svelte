<script lang="ts">
  /* Offer a recovery key at two points (ADR-0054). Onboarding lacks the
     context for someone to understand and store a separate way into the
     journal.

     device-bound follows a switch away from a secret on web. Android
     Keystore mints its own data key and cannot wrap an existing one
     (ADR-0041), so AccessModeSetup cannot make that switch.

     secret-changed follows a passphrase or PIN change. The caller checks
     that no recovery key exists. The change rewraps the same data key, so
     an existing recovery key keeps working.

     The caller handles navigation after the offer. */
  import { focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import Notice from './kit/Notice.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let { variant, onDismiss }: { variant: 'device-bound' | 'secret-changed'; onDismiss: () => void } =
    $props();

  let body = $derived(
    variant === 'secret-changed' ? m.rkn_offer() : isAndroid() ? m.rko_body_android() : m.rko_body_web()
  );
</script>

<h2 class="visually-hidden" data-recovery-offer-heading {@attach focusNamedTarget}>{m.rko_title()}</h2>

<Notice data-recovery-offer={variant} icon="key" title={m.rko_title()} text={body} />

<ListCard>
  <ListRow key="make-recovery-key" icon="key" title={m.rko_make()} href="/settings/recovery-key" />
</ListCard>

<button class="btn btn-ghost" type="button" data-skip-recovery-offer onclick={onDismiss}>
  <span>{m.not_now()}</span>
</button>
