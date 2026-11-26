<script lang="ts">
  /* The voice memos entries carry, as a Media row of their own (bug session
     18, item 70). They were the voice screen's fourth tab, beside three
     tasks that make and compare benchmarks; a memo is audio an entry owns,
     the same kind of thing the Photos row fronts, so it sits beside it. */
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import VoiceRecordings from '$lib/components/VoiceRecordings.svelte';
</script>

<div class="screen">
  <ScreenHeader title={m.vb_tab_recordings()} back="/more" />
  <VoiceRecordings />
</div>
