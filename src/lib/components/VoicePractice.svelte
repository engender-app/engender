<script lang="ts">
  /* Practising, with the live graph and nothing kept (phase 8 features
     ticket 09).

     The benchmark flow is a measurement: a fixed passage, a held note, a
     quality gate, a row written down. Practising is the other thing a
     person does with a voice app, and until this ticket the app had no
     place for it - the only way to see the live figure at all was to start
     a benchmark you did not want to save.

     So this opens the microphone, draws the same figure the benchmark
     draws, and stores nothing. No row, no file, no take: `discard()`
     rather than `finish()` on the way out, so the recorded bytes are never
     even decoded. That is the whole difference between the two tabs, and it
     is why this one needs no gate verdict and shows no advice about
     retaking - there is nothing to retake.

     The gate's readings are still worth having, because the room and the
     level are what make the trace trustworthy: a figure drawn from a take
     that is clipping is a figure about the microphone. So the same advice
     line runs, and it is the only thing on this tab that mentions the
     recording at all.

     One live audio component in the tree (the ticket): this is a third
     caller of VoiceGauge, not a second gauge. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { bandLanguageOf, comfortBand } from '$lib/audio/bands';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { PASSAGE_CHECKS, type QualityCheck, type QualityReport } from '$lib/audio/quality';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { startTake, type TakeSession } from '$lib/stores/voiceBenchmark';
  import type { MicRefusal } from '$lib/stores/voiceRecording';
  import Icon from '$lib/components/Icon.svelte';
  import VoiceGauge from '$lib/components/VoiceGauge.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /** The same cadence the benchmark reads at, and for the reason written
      down in stores/voiceBenchmark.ts: slower than an animation frame on
      purpose, so the phone's main thread is not spent re-running the gate
      sixty times a second. */
  const READING_MS = 100;
  /** Two seconds of trace on screen, at the tracker's 10 ms frame. */
  const TRACE_FRAMES = 200;
  /** What the run bar fills towards. The gate's own length floor: nothing
      here is working towards a longer hold, so the bar says "this counts as
      speaking" and stops. */
  const TARGET_SECONDS = 1.5;

  let running = $state(false);
  let refusal = $state<MicRefusal | null>(null);
  let askedAgain = $state(false);
  let reading = $state<QualityReport | null>(null);
  let frames = $state<readonly PitchFrame[]>([]);

  let session: TakeSession | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  let role = $derived(roleAt(activeFlag.roles, 0));
  let comfort = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));
  /* Practising reads nothing, so there is no passage to take a language
     from and the app's is a guess at what is being spoken. Marked as one:
     the bands are per language because pitch is, and a band drawn for the
     wrong population is worse than no band (ADR-0059). */
  let bandLanguage = $derived(bandLanguageOf('', getLocale()));

  /** The gate's findings, in words, and only ever about the recording. The
      length check is left out of the sentence: on this tab a short stretch
      of speech is a short stretch of speech, not a take that came up
      short. */
  let advice = $derived(
    (reading?.failed ?? [])
      .filter((check) => check !== 'tooShort')
      .map((check: QualityCheck) => (check === 'clipping' ? m.vb_fail_clipping() : m.vb_fail_noise()))
  );

  let refusalCopy = $derived.by(() => {
    if (refusal === 'unavailable') return { title: m.vb_mic_missing_title(), text: m.vb_mic_missing_body() };
    if (refusal === 'unsupported') return { title: m.vb_mic_unsupported_title(), text: m.vb_mic_unsupported_body() };
    return {
      title: m.vb_mic_denied_title(),
      text: askedAgain ? m.vb_mic_denied_again_body() : m.vb_mic_denied_body()
    };
  });

  function stopPolling() {
    if (poll) clearInterval(poll);
    poll = null;
  }

  async function start() {
    const opened = await startTake(PASSAGE_CHECKS);
    if (typeof opened === 'string') {
      if (refusal) askedAgain = true;
      refusal = opened;
      return;
    }
    refusal = null;
    askedAgain = false;
    session = opened;
    reading = null;
    frames = [];
    running = true;

    poll = setInterval(() => {
      if (!session) return;
      reading = session.read();
      frames = session.recentFrames(TRACE_FRAMES);
    }, READING_MS);
  }

  /** Stops, and keeps nothing. `discard()` closes the microphone without
      asking MediaRecorder's bytes for anything, so a practice run leaves
      no file to sweep and nothing to decode. */
  async function stop() {
    const active = session;
    session = null;
    stopPolling();
    running = false;
    frames = [];
    reading = null;
    await active?.discard();
  }

  onDestroy(() => {
    stopPolling();
    void session?.discard();
    session = null;
  });
</script>

<div class="vp">
  {#if refusal}
    <div class="screen-part">
      <Notice
        icon="mic"
        key="voice-practice-refused"
        {role}
        title={refusalCopy.title}
        text={refusalCopy.text}
        action={refusal === 'denied' && !askedAgain
          ? { label: m.vb_mic_ask(), primary: true, onclick: start }
          : undefined}
      />
    </div>
  {:else}
    <div class="screen-part vp-body">
      <p class="muted small vp-lead">{m.vb_practise_lead()}</p>

      {#if running}
        <VoiceGauge
          data-vp-gauge
          {role}
          {comfort}
          language={bandLanguage}
          languageGuessed
          {frames}
          report={reading}
          targetSeconds={TARGET_SECONDS}
          label={m.vb_practise_gauge()}
          {advice}
        />
      {:else}
        <p class="muted small">{m.vb_practise_idle()}</p>
      {/if}
    </div>

    <div class="editor-savebar">
      {#if running}
        <button class="btn btn-primary" data-vp-stop onclick={stop}>
          <Icon name="pause" size={20} /><span>{m.vb_practise_stop()}</span>
        </button>
      {:else}
        <button class="btn btn-primary" data-vp-start onclick={start}>
          <Icon name="mic" size={20} /><span>{m.vb_practise_start()}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The action bar is sticky and floats over whatever is beneath it at
     rest, and everything under it here is load-bearing - the figure's
     caveat, the advice - so the body reserves the bar's own height rather
     than leaving it to a scroll somebody mid-take cannot make. */
  .vp-body {
    padding-bottom: calc(var(--touch-target) * 2);
  }

  .vp-lead {
    margin: 0 0 var(--space-4);
  }
</style>
