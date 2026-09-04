<script lang="ts">
  /* Making a voice benchmark (phase 5 deepening ticket 15, CONTEXT: "Voice
     benchmark"), as one tab of the voice screen (phase 8 features
     ticket 09).

     It was its own route until ticket 09 merged the two halves of this
     feature into one screen with three tabs. Nothing about the flow itself
     changed in that move: it is a component rather than a page, it reports
     a finished benchmark to whoever embedded it instead of navigating, and
     the screen's own header is the screen's.

     Two takes in one sitting: the passage read out, then one note held. They
     are separate steps because they fail separately - a vowel spoiled by a
     door slamming is one tap to redo, and re-reading four hundred words to
     fix three seconds is the thing this flow exists to avoid. So a failed
     vowel comes back to the vowel, and the passage stays where it is.

     Nothing on this screen reads anything into a voice (PRODUCT.md:109).
     The figures are stated in their own units and the advice is always about
     the recording - the room, the distance, the length - never about how
     somebody sounds.

     The analysis is pure and lives in $lib/audio; the microphone and the
     decode live in stores/voiceBenchmark.ts. What is here is the flow. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { analysePassage, analyseVowel } from '$lib/audio/benchmark';
  import { comfortBand } from '$lib/audio/bands';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { noteName } from '$lib/audio/pitch';
  import { PASSAGE_CHECKS, VOWEL_CHECKS, type QualityCheck, type QualityReport } from '$lib/audio/quality';
  import type { Formants } from '$lib/audio/resonance';
  import { journal } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { builtInPassageKey, customPassageKey, wordCountOf } from '$lib/data/voice/passages';
  import { ANALYSIS_SAMPLE_RATE, startTake, type TakeSession } from '$lib/stores/voiceBenchmark';
  import type { MicRefusal } from '$lib/stores/voiceRecording';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import VoiceGauge from '$lib/components/VoiceGauge.svelte';
  import VoiceTake from '$lib/components/VoiceTake.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let { onSaved }: { onSaved: () => void } = $props();

  /** What the gate wants of a held vowel, and what the run bar fills
      towards. The passage has no target of its own - it is done when the
      person stops reading - so its bar fills towards the gate's own floor. */
  const VOWEL_SECONDS = 3;
  const PASSAGE_TARGET_SECONDS = 1.5;
  /** A ceiling on a take nobody stopped: a microphone left open is a
      microphone left open, and the vowel step ends itself once it has what
      it needs anyway. */
  const VOWEL_CEILING_SECONDS = 10;
  const READING_MS = 100;
  /** Two seconds of trace on screen, at the tracker's 10 ms frame. */
  const TRACE_FRAMES = 200;

  type Step = 'passage' | 'vowel' | 'summary';
  type Phase = 'idle' | 'recording' | 'analysing' | 'retry';

  let step = $state<Step>('passage');
  let phase = $state<Phase>('idle');
  let refusal = $state<MicRefusal | null>(null);
  /* Whether asking has already been tried once. Android stops offering the
     dialog after a refusal it treats as final, and a button that silently
     does nothing is worse than no button - so the second refusal swaps the
     ask for the sentence about where the switch actually lives. */
  let askedAgain = $state(false);
  let saving = $state(false);

  let session: TakeSession | null = null;
  let reading = $state<QualityReport | null>(null);
  let frames = $state<readonly PitchFrame[]>([]);
  let failed = $state<QualityCheck[]>([]);

  let passageTake = $state<{
    bytes: Uint8Array;
    figures: ReturnType<typeof analysePassage>['figures'];
    pitchTrack: string | null;
  } | null>(null);
  let vowelTake = $state<{ bytes: Uint8Array; formants: Formants | null; snrDb: number } | null>(null);
  let note = $state('');

  /* The passage: whatever the person reads from, and the key their series is
     filed under (CONTEXT: "Benchmark passage"). */
  let ownPassage = $derived(prefs.voiceBenchmarkPassage.trim());
  let passageText = $derived(ownPassage || m.vb_passage());
  let passageKey = $derived(ownPassage ? customPassageKey(ownPassage) : builtInPassageKey(getLocale()));

  let editingPassage = $state(false);
  let passageDraft = $state('');

  let role = $derived(roleAt(activeFlag.roles, 0));
  /** The person's own band, if they have set one. Drawn on the live figure
      as well as on the finished take: the point of it is to be visible
      while somebody is speaking. */
  let comfort = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));
  let targetSeconds = $derived(step === 'vowel' ? VOWEL_SECONDS : PASSAGE_TARGET_SECONDS);

  /** The gate's own findings, in words, and only ever about the recording. */
  function adviceFor(checks: readonly QualityCheck[], forStep: Step): string[] {
    return checks.map((check) => {
      switch (check) {
        case 'clipping':
          return m.vb_fail_clipping();
        case 'noise':
          return m.vb_fail_noise();
        case 'tooShort':
          return forStep === 'vowel' ? m.vb_fail_short() : m.vb_fail_short_passage();
        case 'unsteady':
          return m.vb_fail_unsteady();
      }
    });
  }

  /** What a refusal says, and what it can offer. A second refusal keeps the
      title and changes the sentence: the ask is gone, so the copy has to
      name where the switch is instead. */
  let refusalCopy = $derived.by(() => {
    if (refusal === 'unavailable') return { title: m.vb_mic_missing_title(), text: m.vb_mic_missing_body() };
    if (refusal === 'unsupported') return { title: m.vb_mic_unsupported_title(), text: m.vb_mic_unsupported_body() };
    return {
      title: m.vb_mic_denied_title(),
      text: askedAgain ? m.vb_mic_denied_again_body() : m.vb_mic_denied_body()
    };
  });

  let liveAdvice = $derived(reading ? adviceFor(reading.failed, step) : []);
  let retryAdvice = $derived(adviceFor(failed, step));

  let poll: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (poll) clearInterval(poll);
    poll = null;
  }

  async function start(checks: readonly QualityCheck[]) {
    const opened = await startTake(checks);
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
    phase = 'recording';

    poll = setInterval(() => {
      if (!session) return;
      reading = session.read();
      frames = session.recentFrames(TRACE_FRAMES);
      // The vowel step ends itself the moment it has its three unbroken
      // seconds, so nobody has to judge that by eye, and it gives up at the
      // ceiling rather than holding the microphone open for a take that is
      // not arriving.
      if (step === 'vowel') {
        const held = reading.longestVoicedSeconds >= VOWEL_SECONDS;
        if (held || session.secondsCaptured() >= VOWEL_CEILING_SECONDS) void stop();
      }
    }, READING_MS);
  }

  async function stop() {
    const active = session;
    if (!active) return;
    session = null;
    stopPolling();
    phase = 'analysing';

    const take = await active.finish();
    if (!take) {
      phase = 'idle';
      return;
    }

    if (step === 'passage') {
      const analysed = analysePassage(take.samples, ANALYSIS_SAMPLE_RATE, wordCountOf(passageText));
      if (!analysed.quality.passed || !analysed.figures) {
        failed = analysed.quality.failed;
        phase = 'retry';
        return;
      }
      passageTake = {
        bytes: take.bytes,
        figures: analysed.figures,
        pitchTrack: analysed.pitchTrack
      };
      step = 'vowel';
      phase = 'idle';
      return;
    }

    const analysed = analyseVowel(take.samples, ANALYSIS_SAMPLE_RATE);
    if (!analysed.quality.passed) {
      failed = analysed.quality.failed;
      phase = 'retry';
      return;
    }
    vowelTake = { bytes: take.bytes, formants: analysed.formants, snrDb: analysed.quality.snrDb };
    step = 'summary';
    phase = 'idle';
  }

  function skipVowel() {
    vowelTake = null;
    step = 'summary';
    phase = 'idle';
  }

  async function save() {
    if (!passageTake?.figures || saving) return;
    saving = true;
    try {
      await journal.voiceBenchmarks.saveBenchmark({
        epochDay: todayEpochDay(),
        passageKey,
        passageAudio: passageTake.bytes,
        vowelAudio: vowelTake?.bytes ?? null,
        ...passageTake.figures,
        f1Hz: vowelTake?.formants?.f1Hz ?? null,
        f2Hz: vowelTake?.formants?.f2Hz ?? null,
        snrDb: vowelTake?.snrDb ?? null,
        note: note.trim() || null,
        pitchTrack: passageTake.pitchTrack
      });
      toast(m.vb_saved());
      onSaved();
    } finally {
      saving = false;
    }
  }

  function openPassageEditor() {
    passageDraft = ownPassage || m.vb_passage();
    editingPassage = true;
  }

  function useOwnPassage() {
    prefs.voiceBenchmarkPassage = passageDraft.trim();
    editingPassage = false;
  }

  function clearOwnPassage() {
    prefs.voiceBenchmarkPassage = '';
    editingPassage = false;
  }

  /** A figure as the screen states it: a fixed number of places, as text.
      Named for what it produces rather than for rounding, which is what it
      does on the way. */
  const figure = (value: number, places = 0) => value.toFixed(places);

  onDestroy(() => {
    stopPolling();
    // Leaving mid-take closes the microphone rather than leaving it open
    // behind a screen nobody is on.
    void session?.discard();
    session = null;
  });
</script>

<div class="vbf">
  {#if refusal}
    <div class="screen-part">
      <!-- The ask is a real button rather than a sentence about settings
           (Alicja, 2026-08-31): a first refusal is usually the OS dialog
           being dismissed, and asking again brings it straight back. Only
           'denied' gets it - there is nothing to ask a device with no
           microphone, or a browser that cannot record at all. -->
      <Notice
        icon="mic"
        key="voice-benchmark-refused"
        {role}
        title={refusalCopy.title}
        text={refusalCopy.text}
        action={refusal === 'denied' && !askedAgain
          ? {
              label: m.vb_mic_ask(),
              primary: true,
              onclick: () => start(step === 'vowel' ? VOWEL_CHECKS : PASSAGE_CHECKS)
            }
          : undefined}
      />
    </div>
  {:else if step === 'summary' && passageTake?.figures}
    {@const figures = passageTake.figures}
    <div class="screen-part vb-body">
      <SectionHeading text={m.vb_measured()} />
      <dl class="vb-figures kit-panel">
        <div><dt>{m.vb_pitch()}</dt>
          <dd>{m.vb_hz({ value: figure(figures.f0MedianHz) })}
            <span class="vb-aside">{noteName(figures.f0MedianHz)}</span></dd></div>
        <div><dt>{m.vb_span()}</dt>
          <dd>{m.vb_hz_range({ low: figure(figures.f0P10Hz), high: figure(figures.f0P90Hz) })}</dd></div>
        <div><dt>{m.vb_spread()}</dt>
          <dd>{m.vb_semitones({ value: figure(figures.semitoneSd, 1) })}</dd></div>
        <div><dt>{m.vb_rate()}</dt>
          <dd>{m.vb_wpm({ value: figure(figures.wordsPerMinute) })}</dd></div>
        <div><dt>{m.vb_resonance()}</dt>
          <dd>
            {#if vowelTake?.formants}
              {m.vb_hz({ value: figure(vowelTake.formants.f1Hz) })} · {m.vb_hz({
                value: figure(vowelTake.formants.f2Hz)
              })}
            {:else}
              <span class="vb-aside">{m.vb_not_measured()}</span>
            {/if}
          </dd></div>
        <div><dt>{m.vb_room()}</dt>
          <dd>
            {#if vowelTake}
              {m.vb_db({ value: figure(vowelTake.snrDb) })}
            {:else}
              <span class="vb-aside">{m.vb_not_measured()}</span>
            {/if}
          </dd></div>
      </dl>

      <!-- The picture the numbers came from (ticket 09). It sits under the
           figures rather than over them: the numbers are what a person came
           to save, and the drawing is what makes them mean something. -->
      <div class="vb-take">
        <SectionHeading text={m.vb_take_heading()} />
        <VoiceTake
          data-vb-take
          {role}
          {comfort}
          pitchTrack={passageTake.pitchTrack}
          medianHz={figures.f0MedianHz}
          p10Hz={figures.f0P10Hz}
          p90Hz={figures.f0P90Hz}
        />
      </div>

      <label class="field vb-note">
        <span class="field-label">{m.vb_note_label()}</span>
        <textarea class="input" rows="2" bind:value={note} placeholder={m.vb_note_placeholder()}></textarea>
      </label>
    </div>

    <div class="editor-savebar">
      <button class="btn btn-primary" data-vb-save disabled={saving} onclick={save}>
        <Icon name="check" size={20} /><span>{m.vb_save()}</span>
      </button>
    </div>
  {:else}
    <div class="screen-part vb-body">
      <SectionHeading text={step === 'passage' ? m.vb_step_passage() : m.vb_step_vowel()} />

      {#if step === 'passage'}
        <!-- What a benchmark is, which is worth reading once and is in the
             way of a take in progress. It goes when the flow starts. -->
        {#if phase === 'idle'}
          <p class="muted small vb-hint">{m.vb_lead()}</p>
        {/if}
        <p class="vb-passage kit-panel" data-vb-passage>{passageText}</p>
        <button class="btn btn-quiet vb-passage-own" type="button" onclick={openPassageEditor}>
          <Icon name="pencil" size={18} />
          <span>{ownPassage ? m.vb_passage_own_in_use() : m.vb_passage_own()}</span>
        </button>
      {:else if phase !== 'recording'}
        <!-- What to do, until it is being done: during the take the gauge is
             saying it, and the instruction is taking up the room the gauge
             needs. -->
        <p class="muted small vb-hint">{m.vb_vowel_hint()}</p>
      {/if}

      {#if step === 'vowel' && (phase === 'recording' || phase === 'retry')}
        <VoiceGauge
          data-vb-gauge
          {role}
          {comfort}
          {frames}
          report={reading}
          {targetSeconds}
          label={m.vb_gauge_label()}
          advice={phase === 'retry' ? retryAdvice : liveAdvice}
        />
      {/if}

      {#if phase === 'retry'}
        <p class="muted small">{m.vb_retry_lead()}</p>
      {/if}
    </div>

    <div class="editor-savebar vb-bar">
      <!-- On the passage step the figure rides the action bar rather than
           the body: the passage is a screenful of text somebody is reading
           off the screen, and a gauge under it is a gauge nobody can see.
           The vowel step has nothing to read, so there it is the thing on
           the screen and takes its full size. -->
      {#if step === 'passage' && (phase === 'recording' || phase === 'retry')}
        <VoiceGauge
          compact
          data-vb-gauge
          {role}
          {comfort}
          {frames}
          report={reading}
          {targetSeconds}
          label={m.vb_gauge_label()}
          advice={phase === 'retry' ? retryAdvice : liveAdvice}
        />
      {/if}

      {#if phase === 'recording'}
        <button class="btn btn-primary" data-vb-stop onclick={stop}>
          <Icon name="pause" size={20} /><span>{m.vb_stop()}</span>
        </button>
      {:else if phase === 'analysing'}
        <button class="btn btn-soft" disabled>
          <span>{m.vb_analysing()}</span>
        </button>
      {:else}
        <button
          class="btn btn-primary"
          data-vb-record
          onclick={() => start(step === 'vowel' ? VOWEL_CHECKS : PASSAGE_CHECKS)}
        >
          <Icon name="mic" size={20} />
          <span>
            {phase === 'retry' ? m.vb_again() : step === 'vowel' ? m.vb_vowel_start() : m.vb_record()}
          </span>
        </button>
      {/if}

      {#if step === 'vowel' && phase !== 'recording' && phase !== 'analysing'}
        <button class="btn btn-quiet" data-vb-skip onclick={skipVowel}>
          <span>{m.vb_vowel_skip()}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<Sheet open={editingPassage} title={m.vb_passage_own_title()} onClose={() => (editingPassage = false)}>
  <p class="muted small">{m.vb_passage_own_hint()}</p>
  <label class="field">
    <span class="field-label">{m.vb_passage_own_title()}</span>
    <textarea class="input" rows="6" bind:value={passageDraft} placeholder={m.vb_passage_own_placeholder()}
    ></textarea>
  </label>
  <div class="vb-sheet-actions">
    <button class="btn btn-primary" onclick={useOwnPassage}>
      <span>{m.vb_passage_own_use()}</span>
    </button>
    {#if ownPassage}
      <button class="btn btn-quiet" onclick={clearOwnPassage}>
        <span>{m.vb_passage_own_clear()}</span>
      </button>
    {/if}
  </div>
</Sheet>

<style>
  /* The action bar is sticky, so it floats over whatever is beneath it at
     rest. Everything on this screen under it is load-bearing - the advice
     the gauge is giving, the note field - so the body reserves the bar's
     own height rather than leaving it to a scroll somebody mid-take cannot
     make. */
  .vb-body {
    padding-bottom: calc(var(--touch-target) * 2);
  }

  .vb-passage {
    margin: 0;
    font-size: var(--text-lg);
    line-height: 1.6;
    /* A passage is read off the screen at arm's length, so it gets the
       reading measure rather than the app's usual dense body block. */
    max-width: 60ch;
  }

  .vb-passage-own {
    margin-top: var(--space-3);
  }

  .vb-hint {
    margin: 0 0 var(--space-4);
  }

  .vb-figures {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  .vb-figures > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .vb-figures dt {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .vb-figures dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-semibold);
    text-align: right;
  }

  .vb-aside {
    color: var(--muted);
    font-weight: var(--weight-regular);
  }

  .vb-take {
    margin-top: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .vb-note {
    margin-top: var(--space-4);
  }

  .vb-bar {
    display: grid;
    gap: var(--space-2);
  }

  .vb-sheet-actions {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
</style>
