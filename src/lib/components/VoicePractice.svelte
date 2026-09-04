<script lang="ts">
  /* Practising, with the live graph (phase 8 features tickets 09 and 10).

     The benchmark flow is a measurement: a fixed passage, a held note, a
     quality gate, a row written down. Practising is the other thing a
     person does with a voice app - ticket 09 gave it the live figure, and
     this ticket gives it something to keep: stopping offers a felt-sense
     rating and a save, never both at once as a single "recording saved"
     step, because the two observations the practice material is built on
     (ears improve faster than muscles, and one bad take is one data point)
     argue for asking how it felt before anything about the numbers is
     shown at all - the numbers stay behind the seal `journal.voicePracticeTakes`
     puts on every take until tomorrow (migrations.ts's own note on why).
     Declining to save is still there; `stop()` calls `finish()` now rather
     than `discard()`, but nothing is written until Save is pressed, and
     nothing is asked if the take captured no voice at all.

     The gate's readings are still worth having, because the room and the
     level are what make the trace trustworthy: a figure drawn from a take
     that is clipping is a figure about the microphone. So the same advice
     line runs, and it is the only thing on this tab that mentions the
     recording while it is running.

     One live audio component in the tree (ticket 09): this is a third
     caller of VoiceGauge, not a second gauge. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { bandsFor, comfortBand } from '$lib/audio/bands';
  import { trackPitch, type PitchFrame } from '$lib/audio/pitch';
  import { practiceTakeStats, type PracticeTakeStats } from '$lib/audio/practiceTake';
  import { PASSAGE_CHECKS, type QualityCheck, type QualityReport } from '$lib/audio/quality';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ANALYSIS_SAMPLE_RATE, startTake, type TakeSession } from '$lib/stores/voiceBenchmark';
  import type { MicRefusal } from '$lib/stores/voiceRecording';
  import Icon from '$lib/components/Icon.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import VoiceGauge from '$lib/components/VoiceGauge.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
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

  /** Set once a stopped take has something to keep - the figures never
      shown here, only used to save them, so the review step cannot become
      a second place to read a number the seal is meant to hold back
      (vb_practice_sealed_note). */
  let review = $state<PracticeTakeStats | null>(null);
  let feltSense = $state<number | null>(null);
  let saving = $state(false);

  let session: TakeSession | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  let role = $derived(roleAt(activeFlag.roles, 0));
  let comfort = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));
  /* Practising reads nothing, so there is no passage to take a language
     from and the app's is a guess at what is being spoken - which is what
     `bandsFor` returns for an empty key, `guessed` included. The bands are
     per language because pitch is, and a band drawn for the wrong
     population is worse than no band (ADR-0059). */
  let bands = $derived(bandsFor('', getLocale()));

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

  /** Stops and closes the microphone, then offers a save if the take has
      anything to save. `finish()` decodes the recorded bytes for the one
      thing they are wanted for - the per-take figures - and neither the
      bytes nor the decoded samples outlive this function; no file is
      written, the same as before this ticket. Nothing voiced at all (silence,
      cut off before a single frame) leaves nothing to review, so the take
      is dropped exactly as a discard always was. */
  async function stop() {
    const active = session;
    session = null;
    stopPolling();
    running = false;
    frames = [];
    reading = null;

    const take = await active?.finish();
    if (!take) return;
    const track = trackPitch(take.samples, ANALYSIS_SAMPLE_RATE);
    review = practiceTakeStats(track.frames);
  }

  async function saveTake() {
    if (!review) return;
    saving = true;
    await journal.voicePracticeTakes.addTake({
      epochDay: todayEpochDay(),
      minHz: review.minHz,
      maxHz: review.maxHz,
      medianHz: review.medianHz,
      feltSense
    });
    saving = false;
    review = null;
    feltSense = null;
  }

  function discardTake() {
    review = null;
    feltSense = null;
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
  {:else if review}
    <div class="screen-part vp-body">
      <SectionHeading text={m.vb_practice_review_heading()} />
      <MoodPicker value={feltSense} onPick={(v) => (feltSense = v)} />
      <p class="muted small vp-sealed-note">{m.vb_practice_sealed_note()}</p>
    </div>

    <div class="editor-savebar vp-review-actions">
      <button class="btn btn-ghost" data-vp-discard disabled={saving} onclick={discardTake}>
        <span>{m.vb_practice_discard()}</span>
      </button>
      <button class="btn btn-primary" data-vp-save disabled={saving} onclick={saveTake}>
        <Icon name="check" size={20} /><span>{m.vb_practice_save()}</span>
      </button>
    </div>
  {:else}
    <div class="screen-part vp-body">
      <p class="muted small vp-lead">{m.vb_practise_lead()}</p>

      {#if running}
        <VoiceGauge
          data-vp-gauge
          {role}
          {comfort}
          language={bands.language}
          languageGuessed={bands.guessed}
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
          <Icon name="pause" size={20} /><span>{m.vb_stop()}</span>
        </button>
      {:else}
        <button class="btn btn-primary" data-vp-start onclick={start}>
          <Icon name="mic" size={20} /><span>{m.vb_record()}</span>
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

  .vp-sealed-note {
    margin: var(--space-4) 0 0;
  }

  /* Discard and Save, side by side rather than stacked - the savebar's own
     default - because neither is the primary action a person came to the
     screen for the way a single save button usually is: declining to keep
     a take is as ordinary an outcome here as keeping it. */
  .vp-review-actions {
    display: flex;
    gap: var(--space-3);
  }

  .vp-review-actions .btn {
    flex: 1;
  }
</style>
