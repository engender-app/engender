<script lang="ts">
  /* Every control the app hands a finger, on one page, at phone width,
     against the real tokens (phase 5 ticket 30).

     The kit gallery next door cannot host these: it deliberately leaves
     components.css out, because the surface kit's whole claim is that it
     stands on its own, and the controls are components.css. So this is the
     second fixture, and it is where the press, the slider's ruler, the
     switch's travel and the 48px floor get looked at and measured.

     The strings are the fixture's own. Shipped copy is a message key. */
  import Field from '$lib/components/kit/Field.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import Slider from '$lib/components/Slider.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');
  let motion = $state('full');

  $effect(() => {
    const html = document.documentElement;
    html.dataset.palette = palette;
    html.dataset.theme = theme;
    if (motion === 'reduce') html.dataset.a11yMotion = 'reduce';
    else delete html.dataset.a11yMotion;
  });

  const TEN = { name: 'Femininity', low: 'Not at all', high: 'Completely', min: 0, max: 10 };
  const HUNDRED = { name: 'Euphoria', low: 'Flat', high: 'Soaring', min: 0, max: 100 };

  let ten = $state<number | null>(7);
  let hundred = $state<number | null>(65);
  let unset = $state<number | null>(null);
  let opacity = $state(50);

  let reminders = $state(true);
  let disguise = $state(false);

  let range = $state('month');
  let scale = $state('10');

  let pin = $state('');
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  let note = $state('');
  let mood = $state<number | null>(4);
</script>

<div class="gallery-controls">
  <select bind:value={palette} aria-label="Palette">
    {#each PALETTES as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={theme} aria-label="Theme">
    <option value="dark">dark</option>
    <option value="light">light</option>
  </select>
  <select bind:value={motion} aria-label="Motion">
    <option value="full">motion</option>
    <option value="reduce">reduced</option>
  </select>
</div>

<!-- data-app-root (ticket 15): press.css's default keys off this attribute,
     the same as the app shell - without it every control below would go
     back to answering nothing, which is exactly the state this gallery
     exists to catch. -->
<div class="phone" data-app-root>
  <h2 class="gallery-head">Sliders</h2>

  <div class="card" data-case="slider-ten">
    <p class="gallery-note">0 to 10. Eleven stops, every one marked, a taller mark every fifth.</p>
    <DimensionSlider dim={TEN} value={ten} onInput={(v) => (ten = v)} />
  </div>

  <div class="card" data-case="slider-hundred">
    <p class="gallery-note">0 to 100. Coarsened to 21 stops of 5, so a stop can be hit on purpose.</p>
    <DimensionSlider dim={HUNDRED} value={hundred} onInput={(v) => (hundred = v)} />
  </div>

  <div class="card" data-case="slider-unset">
    <p class="gallery-note">Nothing logged on this scale yet. The thumb rests mid-track and says so.</p>
    <DimensionSlider dim={TEN} value={unset} onInput={(v) => (unset = v)} />
  </div>

  <div class="card" data-case="slider-bare">
    <p class="gallery-note">
      The instrument with no label on it, which is what the photo review's onion skin uses.
    </p>
    <span class="field-label">Compare with the previous photo</span>
    <div class="onion-opacity">
      <Slider value={opacity} onInput={(v) => (opacity = v)} label="Compare with the previous photo" />
    </div>
    <p class="small muted">Opacity {opacity}%</p>
  </div>

  <h2 class="gallery-head">Switches</h2>
  <div class="card" data-case="switches">
    <div class="list-row">
      <div class="row-text"><span class="row-title">Reminders</span></div>
      <Switch checked={reminders} label="Reminders" onChange={(v) => (reminders = v)} />
    </div>
    <div class="list-row">
      <div class="row-text">
        <span class="row-title">Disguise mode</span>
        <span class="row-subtitle">The app opens on a plain notes screen</span>
      </div>
      <Switch checked={disguise} label="Disguise mode" onChange={(v) => (disguise = v)} />
    </div>
  </div>

  <h2 class="gallery-head">Segmented</h2>
  <div class="card" data-case="segmented">
    <p class="gallery-note">It presses now. Colour alone made a mistap on the active one read as nothing.</p>
    <Segmented
      name="Range"
      key="range"
      options={[
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'year', label: 'Year' }
      ]}
      value={range}
      onChange={(v) => (range = v)}
    />
    <div style="height: var(--space-3)"></div>
    <Segmented
      name="Scale"
      options={[
        { value: '10', label: '0 to 10' },
        { value: '100', label: '0 to 100' }
      ]}
      value={scale}
      onChange={(v) => (scale = v)}
    />
  </div>

  <h2 class="gallery-head">Buttons</h2>
  <div class="card" data-case="buttons">
    <div class="btn-stack">
      <button class="btn btn-primary"><Icon name="check" size={20} /><span>Save the entry</span></button>
      <button class="btn btn-soft"><Icon name="camera" size={18} /><span>Retake</span></button>
      <button class="btn btn-ghost"><span>Not now</span></button>
      <button class="btn btn-danger"><span>Delete this entry</span></button>
      <button class="btn btn-primary" disabled><span>Continue</span></button>
    </div>
    <div class="spread" style="margin-top: var(--space-4)">
      <span class="small muted">Icon buttons, one live and one dead</span>
      <span class="icon-pair">
        <button class="icon-btn" aria-label="Star"><Icon name="star" size={20} /></button>
        <button class="icon-btn" aria-label="Edit" disabled><Icon name="pencil" size={20} /></button>
      </span>
    </div>
  </div>

  <h2 class="gallery-head">The PIN pad</h2>
  <div class="card" data-case="pinpad">
    <div class="pin-dots">
      {#each [0, 1, 2, 3] as i (i)}
        <span class="pin-dot" class:is-filled={i < pin.length}></span>
      {/each}
    </div>
    <div class="pin-pad">
      {#each KEYS as key, i (i)}
        {#if key === ''}
          <button class="pin-key is-ghost" disabled aria-hidden="true"></button>
        {:else if key === 'del'}
          <button class="pin-key" aria-label="Delete" onclick={() => (pin = pin.slice(0, -1))}>
            <Icon name="backspace" size={20} />
          </button>
        {:else}
          <button class="pin-key" onclick={() => (pin = (pin + key).slice(0, 4))}>{key}</button>
        {/if}
      {/each}
    </div>
  </div>

  <h2 class="gallery-head">Fields</h2>
  <div class="card" data-case="fields">
    <p class="gallery-note">A field does not press. It takes a caret, and the border answers focus.</p>
    <Field label="What to call this scale" id="c-name">
      {#snippet children(id)}
        <input class="input" {id} placeholder="Femininity" />
      {/snippet}
    </Field>
    <Field label="Note" hint="(optional)">
      {#snippet children(id)}
        <textarea class="input" {id} rows="3" placeholder="Slept badly. Put the good shirt on anyway." bind:value={note}
        ></textarea>
      {/snippet}
    </Field>
    <!-- No id passed in either time - proves the mint doesn't collide with
         itself, which the run.mjs check below reads off the two `for`s. -->
    <Field label="Minted, first">
      {#snippet children(id)}
        <input class="input" {id} placeholder="No id given" />
      {/snippet}
    </Field>
    <Field label="Minted, second">
      {#snippet children(id)}
        <input class="input" {id} placeholder="No id given either" />
      {/snippet}
    </Field>
    <Field label="Which garment size" legend>
      {#snippet children(id)}
        <div class="tag-row" role="group" aria-labelledby={id}>
          <button class="tag-chip is-selected">Small</button>
          <button class="tag-chip">Medium</button>
          <button class="tag-chip">Large</button>
        </div>
      {/snippet}
    </Field>
    <Field label="Reminders" legend spread>
      {#snippet children()}
        <Switch checked={reminders} label="Reminders" onChange={(v) => (reminders = v)} />
      {/snippet}
    </Field>
    <!-- A real for/id pair, kept off screen - the shape a sheet whose own
         heading already says what the one field below it is for wants,
         rather than an aria-label saying the same word a third time. -->
    <Field label="What to call it" id="c-hidden" hidden>
      {#snippet children(id)}
        <input class="input" {id} placeholder="No visible label above this one" />
      {/snippet}
    </Field>
  </div>

  <h2 class="gallery-head">Handed to other tickets</h2>
  <div class="card" data-case="handed-on">
    <p class="gallery-note">
      Redesigning these is not this ticket's to do. Pressing them is: the tag chips and the
      toast's undo were two of the 52 controls with no response at all before ticket 15's default,
      and now answer like everything else. The mood picker was never one of the 52 either - it
      answers a selection with colour and a pop already - but it is a plain button too, so it now
      also gets the same compact press on the way down.
    </p>
    <MoodPicker value={mood} onPick={(v) => (mood = v)} />
    <div class="tag-row" style="margin-top: var(--space-4)">
      <button class="tag-chip is-selected">Dysphoria</button>
      <button class="tag-chip">Voice practice</button>
      <button class="tag-chip">Out</button>
    </div>
    <div class="spread" style="margin-top: var(--space-4)">
      <span class="small muted">A toast's action</span>
      <button class="toast-action">Undo</button>
    </div>
  </div>

  <h2 class="gallery-head">The three depths</h2>
  <div class="card" data-case="depths">
    <p class="gallery-note">
      One law at three sizes. Scale is a fraction, so the bigger the control the shallower the
      fraction, and edge travel stays inside a few pixels everywhere.
    </p>
    <div class="depth-row">
      <button class="press depth-key">0.94</button>
      <span class="small muted">compact, up to about 64px</span>
    </div>
    <div class="depth-row">
      <button class="btn btn-primary depth-wide"><span>0.97, the width of the screen</span></button>
    </div>
    <div class="depth-row">
      <button class="press-add depth-add" aria-label="Add"><Icon name="plus" size={24} /></button>
      <span class="small muted">0.90, and the shadow goes with it</span>
    </div>
  </div>
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
    padding: 12px var(--space-4) 40px;
    box-sizing: border-box;
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

  .btn-stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .icon-pair {
    display: inline-flex;
  }

  .depth-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .depth-key {
    width: 56px;
    height: 56px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-family: var(--font-display);
    cursor: pointer;
  }

  .depth-wide {
    width: 100%;
  }

  .depth-add {
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    background: var(--grad-accent);
    color: var(--on-accent);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
</style>
