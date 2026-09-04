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
  import { bandsFor, comfortBand } from '$lib/audio/bands';
  import type { PitchFrame } from '$lib/audio/pitch';
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
  import VoiceFigures from '$lib/components/VoiceFigures.svelte';
  import VoiceGauge from '$lib/components/VoiceGauge.svelte';
  import VoicingRibbon from '$lib/components/VoicingRibbon.svelte';
  import VoiceTake from '$lib/components/VoiceTake.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
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
    /* The chain the passage was recorded through (ticket 28, ADR-0061),
       carried from the session that made it because the row stores one
       chain and the passage is the take the stored figures are read
       against. The vowel step opens the same microphone under the same
       constraints seconds later; a device that answered differently
       between the two is not a state this app tells apart. */
    captureChain: string;
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
  /** The voice's longest unbroken run so far, as the gate counts it. */
  let heldSeconds = $derived((reading?.longestVoicedSeconds ?? 0).toFixed(1));

  /** The sentence beside the ribbon, in priority order: what to do
      differently if the gate has found something, otherwise that nothing
      is arriving yet, otherwise nothing at all.

      Silence is reported in words as well as drawn, so somebody who cannot
      see the ribbon gets the same answer - the contract the figure this
      replaced was held to. It clears the moment a voice arrives rather
      than lingering. */
  let liveLine = $derived.by(() => {
    if (phase === 'retry') return retryAdvice.join(' ');
    if (liveAdvice.length > 0) return liveAdvice.join(' ');
    return frames.some((frame) => frame.hz !== null) ? '' : m.vb_hearing_silent();
  });
  /* Whose typical ranges belong on the figure: the language of the passage
     being read, not the app's (ADR-0059). A passage of somebody's own words
     carries no language, so the app's is a guess and the caption says so. */
  let bands = $derived(bandsFor(passageKey, getLocale()));
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
        pitchTrack: analysed.pitchTrack,
        captureChain: active.captureChain
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
        pitchTrack: passageTake.pitchTrack,
        captureChain: passageTake.captureChain
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
      <!-- Six figures, each with the sentence that says what it is and
           links into its own reference section (ticket 27). The list was
           markup here until then; what the flow keeps is the take. -->
      <VoiceFigures
        {role}
        {figures}
        formants={vowelTake?.formants ?? null}
        snrDb={vowelTake ? vowelTake.snrDb : null}
      />

      <!-- The picture the numbers came from (ticket 09). It sits under the
           figures rather than over them: the numbers are what a person came
           to save, and the drawing is what makes them mean something. -->
      <div class="vb-take">
        <SectionHeading text={m.vb_take_heading()} />
        <VoiceTake
          data-vb-take
          {role}
          {comfort}
          language={bands.language}
          languageGuessed={bands.guessed}
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
    <div class="screen-part vb-body" {...roleAttrs(role)}>
      <SectionHeading text={step === 'passage' ? m.vb_step_passage() : m.vb_step_vowel()} />

      <!-- Mouth-to-microphone distance is the largest thing a person
           controls in the whole of this measurement, and no API can read
           it back, so it ships as an instruction rather than as a stored
           number a benchmark could not verify (ticket 28, ADR-0061). Both
           steps get it, because the vowel is a take too, and it goes after
           each step's own words rather than in front of them: what this
           screen is comes first, how to hold the phone second. It leaves
           while a take is running, like the hints it follows, because the
           gauge needs the room. -->
      {#snippet distance()}
        <p class="muted small vb-hint">{m.vb_distance_hint()}</p>
      {/snippet}

      {#if step === 'passage'}
        <!-- What a benchmark is, which is worth reading once and is in the
             way of a take in progress. It goes when the flow starts. -->
        {#if phase === 'idle'}
          <p class="muted small vb-hint">{m.vb_lead()}</p>
          {@render distance()}
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
        {@render distance()}
      {/if}

      <!-- The graph goes from the reading step and stays on the held note
           (Alicja, 2026-09-04, in three passes: no live graph while reading
           a passage; a benchmark's own picture is enough right after
           finishing it; and steadiness "should still be there to guide the
           user that their voice during the vowel recordings should be
           stable").

           Which is the distinction. Reading a passage has no shape to hit -
           pitch moves by design, the numbers come afterwards, and watching
           a curve while reading aloud is what the practise tab is for.
           Holding a note has exactly one: flat. So the vowel step keeps a
           figure and it is the one that measures the thing being asked for,
           semitones around the note itself, with no bands on it because
           where the note sits is not the question.

           The reading step keeps what the figure's words carried: how long
           the voice has been going, and anything to do differently about
           the room or the level. -->
      {#if step === 'vowel' && (phase === 'recording' || phase === 'retry')}
        <VoiceGauge
          data-vb-gauge
          {role}
          {comfort}
          reading="steadiness"
          language={bands.language}
          languageGuessed={bands.guessed}
          {frames}
          report={reading}
          {targetSeconds}
          label={m.vb_gauge_label_steady()}
          advice={phase === 'retry' ? retryAdvice : liveAdvice}
        />
      {:else if phase === 'recording' || phase === 'retry'}
        <!-- One rail of the last two seconds: filled where the tracker
             found a voice, gaps for the breaths and the commas, empty when
             nothing is arriving. Presence has no magnitude, which is what
             lets it say "this is working" in 6px where a pitch figure
             needed 148 and a gutter. -->
        <div class="vb-live" data-vb-live>
          <div class="vb-live-top">
            <span class="vb-live-label">{m.vb_hearing_label()}</span>
            <span class="vb-live-held">{m.vb_gauge_run({ seconds: heldSeconds })}</span>
          </div>
          <VoicingRibbon data-vb-hearing {frames} label={m.vb_hearing_label()} />
          <p class="vb-live-advice" aria-live="polite">{liveLine}</p>
        </div>
      {/if}

      {#if phase === 'retry'}
        <p class="muted small">{m.vb_retry_lead()}</p>
      {/if}
    </div>

    <div class="editor-savebar vb-bar">
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

  /* What a take shows while it runs, now that no figure does. The held
     figure and the advice sit together as one readout rather than as two
     stray lines. */
  .vb-live {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .vb-live-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .vb-live-label {
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .vb-live-held {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }

  .vb-live-advice {
    margin: 0;
    /* One line of room kept whether or not there is anything to say, so
       nothing jumps up the screen the moment a check clears. */
    min-height: calc(var(--text-sm) * 1.5);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--muted);
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
