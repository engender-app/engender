/* Builds the sign-off page for setup's redressing (redesign ticket 33).

   Everything on it is a measurement or a render this ticket's own scripts
   produced, embedded so the page needs nothing at read time:

     tests/setup-gallery.mjs        the shots and scroll.json, run once on
                                    this branch and once from a worktree of
                                    main with --legacy for the before set
     tests/setup-motion-gallery.mjs the twelve flipbooks and their samples,
                                    bundled by tests/panel-motion-flipbook.mjs
     tests/setup-contrast.mjs       every piece of type on every step in
                                    eight palettes and two themes

   It shows the parts this ticket changed rather than the app again (Alicja
   on ticket 07's sign-off), and every movement is a flipbook with frame
   numbers and millisecond stamps rather than a still or a video (her note
   on ticket 19's).

   Run: node tests/setup-review.mjs [outFile] */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { SETUP_STEPS } from './setup-flow.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const AFTER = resolve(root, '.claude/setup-shots/trans-light');
const BEFORE = resolve(root, '.claude/setup-shots/before-main');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/setup-review.html'));

/** One shot, scaled to `width` CSS pixels and encoded as a data URI. The
    shots are taken at deviceScaleFactor 2, so a 390px phone is 780px of
    PNG and everything here is a downscale. */
async function shot(dir, name, width, quality = 82) {
  const path = resolve(dir, `${name}.png`);
  try {
    const { stdout } = await run(
      'magick',
      [path, '-resize', `${width * 2}x`, '-quality', String(quality), 'jpeg:-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }
    );
    return `data:image/jpeg;base64,${stdout.toString('base64')}`;
  } catch {
    return null;
  }
}

const scroll = {
  after: JSON.parse(await readFile(resolve(AFTER, 'scroll.json'), 'utf8')),
  before: JSON.parse(await readFile(resolve(BEFORE, 'scroll.json'), 'utf8'))
};
const contrast = JSON.parse(await readFile(resolve(root, '.claude/setup-contrast.json'), 'utf8'));
const motion = JSON.parse(await readFile(resolve(root, '.claude/setup-motion.json'), 'utf8'));

/* ---------- the frame, step by step ---------- */

/* What each step is called on the page. The order is the flow's own
   (tests/setup-flow.mjs), so a step added to the flow shows up here as a
   missing label rather than as a shot silently left out. */
const LABELS = {
  welcome: 'Welcome',
  name: 'The name',
  flag: 'The flag',
  scales: 'The scales',
  areas: 'The areas',
  lock: 'How it opens',
  permissions: 'What it can ask for',
  disguise: 'The disguise',
  done: 'The finish'
};
const STEPS = SETUP_STEPS.map((key) => [key, LABELS[key] ?? key]);

const stepPairs = [];
for (const [key, label] of STEPS) {
  stepPairs.push({
    label,
    before: await shot(BEFORE, `${key}-phone`, 210),
    after: await shot(AFTER, `${key}-phone`, 210),
    beforeOverflow: scroll.before[`${key}-phone`]?.overflow ?? 0,
    afterOverflow: scroll.after[`${key}-phone`]?.overflow ?? 0,
    field: scroll.after[`${key}-phone`]?.field ?? 0,
    question: scroll.after[`${key}-phone`]?.question ?? 0,
    answers: scroll.after[`${key}-phone`]?.answersOverflow ?? 0
  });
}

/* ---------- the parts rule 13 decides ---------- */

const PARTS = [
  [
    'question',
    'The question',
    440,
    'On the field at 48 in the display face, tracked to -0.045em and set solid: the door title’s own treatment, which is what a question is here. It was 48 on the page.'
  ],
  [
    'field',
    'The field',
    300,
    'The sun’s reach at this step plus the question, with the back control on its row and the bottom corners at the one radius. Before, the sun hung off the window’s corner behind the text and the head was a reserve with nothing in it.'
  ],
  [
    'line',
    'The line',
    440,
    'One line under the field on the page, 15 at weight 600 in the secondary ink. The flag step’s ran to three lines and explained what the sun is drawn from, which the screen demonstrates the moment you tap a flag.'
  ],
  [
    'flags',
    'The flags',
    360,
    'A flag is a block of its own stripes, drawn as bands the way the sun draws them: 56 tall, two across, the name under it on the page. The shared gradient was a 135-degree wash, which rule 8 already corrected for the sun.'
  ],
  [
    'flag-chosen',
    'The one you picked',
    220,
    'The section rule’s 3px as a frame, landing on the block from 6px outside it. It was a 2px accent outline with the whole tile tinted behind the name, which rule 13 now forbids.'
  ],
  [
    'typed',
    'A typed answer',
    380,
    'The display face at 28 on a 3px rule, no box and no fill: the first thing in the app set in the app’s own voice. It was the kit’s boxed input.'
  ],
  [
    'caption',
    'A group’s name',
    300,
    'A caption at 15/600 in the secondary ink. It was the 28px section heading with its own 3px rule, which is the one thing rule 12 says a step may not carry: a step has one heading and it is the question.'
  ],
  [
    'foot',
    'The foot',
    380,
    'The one way on at full width, then the two ways past the step side by side under it, above a hairline on the window’s bottom edge. They were stacked full-width, three deep.'
  ]
];

const partPairs = [];
for (const [key, label, width, note] of PARTS) {
  partPairs.push({
    label,
    note,
    width,
    before: await shot(BEFORE, `part-${key}`, width),
    after: await shot(AFTER, `part-${key}`, width)
  });
}

const padPairs = [];
for (const [key, label] of [
  ['pad-phone', '390 x 844'],
  ['pad-narrow', '320 x 568, the short form']
]) {
  padPairs.push({
    label,
    before: await shot(BEFORE, key, 200),
    after: await shot(AFTER, key, 200),
    beforePad: scroll.before[key]?.pad ?? 0,
    afterPad: scroll.after[key]?.pad ?? 0,
    beforeOverflow: scroll.before[key]?.overflow ?? 0,
    afterOverflow: scroll.after[key]?.overflow ?? 0
  });
}

/* ---------- rule 14, at every size it names ---------- */

const SIZES = [
  ['phone', '390 x 844'],
  ['narrow', '320 x 568'],
  ['wide', '430 x 932'],
  ['keyboard', '390 x 360, a keyboard up']
];
const scrollRows = [];
for (const [key] of STEPS) {
  for (const [size, sizeLabel] of SIZES) {
    const name = `${key}-${size}`;
    if (!(name in scroll.after) && !(name in scroll.before)) continue;
    scrollRows.push({
      step: key,
      size: sizeLabel,
      before: scroll.before[name]?.overflow,
      after: scroll.after[name]?.overflow,
      answers: scroll.after[name]?.answersOverflow
    });
  }
}

/* ---------- the contrast walk ---------- */

const contrastRows = Object.entries(contrast.findings)
  .map(([key, value]) => {
    const [palette, theme, ...rest] = key.split('-');
    return { palette, theme, step: rest.join('-'), ...value };
  })
  .reduce((worst, row) => {
    const at = `${row.palette} ${row.theme}`;
    if (!worst[at] || row.lowest.ratio < worst[at].lowest.ratio) worst[at] = row;
    return worst;
  }, {});

/* ---------- the page ---------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SCENES = [
  ['step-forward', 'A step forward', 'rule 10, 12'],
  ['step-back', 'A step back', 'rule 10, 12'],
  ['flag-picked', 'A flag picked', 'rule 13'],
  ['row-ticked', 'A row ticked', 'rule 13'],
  ['pad-digit', 'A digit on the pad', 'rule 13'],
  ['finish', 'The handover to the app', 'rule 12, ADR-0080']
];

const scenesByName = new Map(motion.sets.setup.map((s) => [s.name, s]));
const flipbooks = [];
for (const [name, label, rule] of SCENES) {
  const full = scenesByName.get(name);
  const reduced = scenesByName.get(`reduce-${name}`);
  if (!full) continue;
  flipbooks.push({ name, label, rule, note: full.note, full, reduced });
}

const page = `<title>Setup Wears the Field</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Nunito:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
  /* The app's own two faces, on the app's own review page: Outfit for
     anything set at display size, Nunito for reading, and a mono for the
     numbers, which is most of this page. */
  :root {
    color-scheme: light;
    --bg: #F7F4F5;
    --surface: #FFFFFF;
    --sunk: #EFEAEC;
    --ink: #191416;
    --ink-2: #6B6165;
    --rule: #E1D8DB;
    --accent: #A8324F;
    --good: #2C6A4C;
    --warn: #8C5310;
    --shadow: 0 1px 2px rgb(25 20 22 / 0.05);
    --display: 'Outfit', 'Trebuchet MS', sans-serif;
    --body: 'Nunito', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      color-scheme: dark;
      --bg: #141011;
      --surface: #1E1719;
      --sunk: #251D20;
      --ink: #F3ECEE;
      --ink-2: #A69B9F;
      --rule: #342B2E;
      --accent: #EC8CA3;
      --good: #7CC79E;
      --warn: #E0A560;
      --shadow: 0 1px 2px rgb(0 0 0 / 0.4);
    }
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #141011;
    --surface: #1E1719;
    --sunk: #251D20;
    --ink: #F3ECEE;
    --ink-2: #A69B9F;
    --rule: #342B2E;
    --accent: #EC8CA3;
    --good: #7CC79E;
    --warn: #E0A560;
    --shadow: 0 1px 2px rgb(0 0 0 / 0.4);
  }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--body);
    font-size: 16px;
    line-height: 1.55;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 56px 24px 96px; }
  h1 {
    font-family: var(--display);
    font-weight: 800;
    font-size: clamp(2.2rem, 6vw, 3.2rem);
    letter-spacing: -0.03em;
    line-height: 1;
    margin: 0 0 12px;
    text-wrap: balance;
  }
  .lede { font-size: 1.0625rem; color: var(--ink-2); max-width: 62ch; margin: 0 0 8px; }
  .lede strong { color: var(--ink); font-weight: 700; }
  h2 {
    font-family: var(--display);
    font-weight: 800;
    font-size: 1.65rem;
    letter-spacing: -0.02em;
    margin: 0 0 4px;
    text-wrap: balance;
  }
  h3 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.0625rem;
    margin: 0 0 4px;
  }
  section { margin-top: 64px; }
  .eyebrow {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 6px;
  }
  .say { max-width: 68ch; color: var(--ink-2); margin: 0 0 20px; }
  .say strong { color: var(--ink); font-weight: 700; }
  code, .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  code { font-size: 0.9em; background: var(--sunk); padding: 1px 4px; border-radius: 3px; }

  /* A run of before/after pairs: one object repeated, same edges and
     baselines, the label in the same place on each. */
  .grid { display: grid; gap: 28px 20px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .pair { display: grid; gap: 10px; }
  .pair-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
  .pair-shots.one { grid-template-columns: 1fr; }
  figure { margin: 0; display: grid; gap: 6px; }
  figure img { width: 100%; height: auto; display: block; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface); }
  figcaption {
    font-family: var(--mono);
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .measure { font-family: var(--mono); font-size: 0.75rem; color: var(--ink-2); }
  .measure b { color: var(--ink); font-weight: 600; }
  .over { color: var(--warn); font-weight: 600; }
  .zero { color: var(--good); font-weight: 600; }

  .parts { display: grid; gap: 40px; }
  .part { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 24px; align-items: start; }
  @media (max-width: 720px) { .part { grid-template-columns: 1fr; } }

  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  .scroller { overflow-x: auto; }
  th, td { text-align: left; padding: 7px 12px 7px 0; border-bottom: 1px solid var(--rule); }
  th { font-family: var(--mono); font-size: 0.6875rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); font-weight: 600; }
  td.n { font-family: var(--mono); font-variant-numeric: tabular-nums; }

  /* A flipbook: the frame, the counter, the scrubber, and the numbers the
     same frame measured. */
  .flip { border-top: 3px solid var(--ink); padding-top: 16px; margin-top: 48px; }
  .flip-head { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline; margin-bottom: 12px; }
  .flip-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (max-width: 860px) { .flip-body { grid-template-columns: 1fr; } }
  .stage { background: var(--sunk); border: 1px solid var(--rule); border-radius: 4px; padding: 8px; display: grid; gap: 8px; }
  .stage img { display: block; border-radius: 2px; }
  .counter { font-family: var(--mono); font-size: 0.8125rem; font-variant-numeric: tabular-nums; display: flex; gap: 12px; align-items: center; }
  .counter b { font-weight: 600; }
  .controls { display: flex; gap: 8px; align-items: center; }
  input[type='range'] { width: 100%; accent-color: var(--accent); }
  button {
    font-family: var(--body);
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button:hover { border-color: var(--ink-2); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .samples { font-family: var(--mono); font-size: 0.75rem; line-height: 1.5; }
  .samples dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 14px; margin: 0; }
  .samples dt { color: var(--ink-2); }
  .samples dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .reduced { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--rule); }

  ul.notes { max-width: 68ch; padding-left: 20px; color: var(--ink-2); }
  ul.notes li { margin-bottom: 10px; }
  ul.notes strong { color: var(--ink); font-weight: 700; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>

<div class="wrap">
  <p class="eyebrow">phase 10 · redesign ticket 33 · trans, light</p>
  <h1>Setup wears the field</h1>
  <p class="lede">
    Ten steps against DIRECTION.md rules 12 to 14: the field with the question printed on it, one
    line on the page, the answers, and a foot that does not move. Everything below is a render or a
    measurement off the built app - the before column is a worktree of <strong>main</strong>, the
    after column is this branch.
  </p>
  <p class="lede">
    Every movement is a flipbook with frame numbers and the millisecond each frame landed, and the
    numbers under each one were sampled in the page on the same animation frames. The last section
    lists what is named as a deviation rather than met.
  </p>

  <section>
    <p class="eyebrow">rule 12 · the frame</p>
    <h2>Every step, before and after</h2>
    <p class="say">
      A step is the field, one line, the answers, the foot. The screen is exactly the window and
      cannot scroll; the answers have a region of their own and are the only thing in the frame that
      can. <strong>Before</strong> each step was a plain column inside the app's one scroll region,
      so a long list carried the question and the foot off the top of the window with it.
    </p>
    <div class="grid">
      ${stepPairs
        .map(
          (p) => `<div class="pair">
        <h3>${esc(p.label)}</h3>
        <div class="pair-shots">
          <figure>
            ${p.before ? `<img src="${p.before}" alt="${esc(p.label)} on main">` : ''}
            <figcaption>before${
              p.beforeOverflow ? ` · <span class="over">${p.beforeOverflow}px</span>` : ' · 0px'
            }</figcaption>
          </figure>
          <figure>
            ${p.after ? `<img src="${p.after}" alt="${esc(p.label)} on this branch">` : ''}
            <figcaption>after · <span class="zero">${p.afterOverflow}px</span></figcaption>
          </figure>
        </div>
        <p class="measure">field <b>${p.field}</b> · question <b>${p.question}</b>${
          p.answers ? ` · answers scroll <b>${p.answers}</b>` : ''
        }</p>
      </div>`
        )
        .join('\n')}
    </div>
    <p class="say" style="margin-top:24px">
      The overflow under each shot is the app's scroll region at 390 x 844. The field's height is
      the sun's reach at that step plus the question, which is why it grows down the flow: 143px on
      the welcome to 290 on the finish.
    </p>
  </section>

  <section>
    <p class="eyebrow">rule 14 · measured, not eyeballed</p>
    <h2>No step scrolls, at any size the rule names</h2>
    <p class="say">
      Read off the built app by <code>tests/setup-gallery.mjs</code>, which writes the overflow per
      shot to <code>scroll.json</code>. The last column is the answers' own region, which is the one
      thing on a step that may scroll - on the long steps it does, under the question, and clips at
      the foot's hairline.
    </p>
    <div class="scroller">
      <table>
        <thead>
          <tr><th>Step</th><th>Size</th><th>Before</th><th>After</th><th>Answers scroll</th></tr>
        </thead>
        <tbody>
          ${scrollRows
            .map(
              (r) => `<tr>
            <td>${esc(r.step)}</td>
            <td class="n">${esc(r.size)}</td>
            <td class="n">${
              r.before === undefined
                ? '—'
                : r.before > 0
                  ? `<span class="over">${r.before}px</span>`
                  : '<span class="zero">0px</span>'
            }</td>
            <td class="n">${
              r.after === undefined
                ? '—'
                : r.after > 0
                  ? `<span class="over">${r.after}px</span>`
                  : '<span class="zero">0px</span>'
            }</td>
            <td class="n">${r.answers ? `${r.answers}px` : '—'}</td>
          </tr>`
            )
            .join('\n')}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 13 · the parts</p>
    <h2>What each answer is drawn as</h2>
    <p class="say">
      One component at a time rather than the screen again. Left is this branch, right of it is
      main, and the note says which rule decided it.
    </p>
    <div class="parts">
      ${partPairs
        .map(
          (p) => `<div class="part">
        <div class="pair-shots">
          <figure>
            ${p.after ? `<img src="${p.after}" alt="${esc(p.label)}, after">` : ''}
            <figcaption>after</figcaption>
          </figure>
          <figure>
            ${p.before ? `<img src="${p.before}" alt="${esc(p.label)}, before">` : ''}
            <figcaption>before</figcaption>
          </figure>
        </div>
        <div>
          <h3>${esc(p.label)}</h3>
          <p class="say" style="margin:0">${esc(p.note)}</p>
        </div>
      </div>`
        )
        .join('\n')}
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 13 · one drawing for the pad</p>
    <h2>The keypad, in setup and in every gate</h2>
    <p class="say">
      56px a key rather than 62, which is rule 13's number and the block size the rest of the phase
      draws at, and a short form under 640px tall: 48px keys and the dots closer in. The screen it
      sits on still scrolls, and that is the gate shell rather than the pad - ticket 34's, with the
      numbers here.
    </p>
    <div class="grid">
      ${padPairs
        .map(
          (p) => `<div class="pair">
        <h3>${esc(p.label)}</h3>
        <div class="pair-shots">
          <figure>
            ${p.before ? `<img src="${p.before}" alt="the pad before">` : ''}
            <figcaption>before · pad ${p.beforePad}px</figcaption>
          </figure>
          <figure>
            ${p.after ? `<img src="${p.after}" alt="the pad after">` : ''}
            <figcaption>after · pad ${p.afterPad}px</figcaption>
          </figure>
        </div>
        <p class="measure">screen scrolls <b>${p.beforeOverflow}px</b> → <b>${p.afterOverflow}px</b></p>
      </div>`
        )
        .join('\n')}
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 10 · one grammar, frame by frame</p>
    <h2>The motion</h2>
    <p class="say">
      Drag the scrubber, or use the arrow keys once a flipbook has focus. The counter is the frame
      number and the millisecond it landed; the numbers beside it were read in the page on that
      frame. Under each movement is the same one with reduce-motion set, which the contract asks to
      substitute rather than delete.
    </p>
    ${flipbooks
      .map(
        (f, i) => `<div class="flip">
      <div class="flip-head">
        <h2 style="margin:0">${esc(f.label)}</h2>
        <p class="eyebrow" style="margin:0">${esc(f.rule)}</p>
      </div>
      <p class="say">${esc(f.note ?? '')}</p>
      <div class="flip-body">
        <div class="stage">
          <img id="img-${i}" src="${f.full.frames[0].uri}" width="${f.full.w}" height="${f.full.h}" alt="${esc(f.label)}, frame 1">
          <div class="counter">
            <span>frame <b id="n-${i}">1</b>/${f.full.frames.length}</span>
            <span><b id="t-${i}">${f.full.frames[0].at}</b>ms</span>
          </div>
          <input type="range" id="r-${i}" min="0" max="${f.full.frames.length - 1}" value="0" step="1" aria-label="${esc(f.label)} frame">
          <div class="controls">
            <button type="button" data-step="-1" data-for="${i}">◀</button>
            <button type="button" data-play="${i}">play</button>
            <button type="button" data-step="1" data-for="${i}">▶</button>
          </div>
        </div>
        <div class="samples" id="s-${i}"></div>
      </div>
      ${
        f.reduced
          ? `<div class="reduced flip-body">
        <div class="stage">
          <img id="img-r${i}" src="${f.reduced.frames[0].uri}" width="${f.reduced.w}" height="${f.reduced.h}" alt="${esc(f.label)} with reduce-motion, frame 1">
          <div class="counter">
            <span>reduce · frame <b id="n-r${i}">1</b>/${f.reduced.frames.length}</span>
            <span><b id="t-r${i}">${f.reduced.frames[0].at}</b>ms</span>
          </div>
          <input type="range" id="r-r${i}" min="0" max="${f.reduced.frames.length - 1}" value="0" step="1" aria-label="${esc(f.label)} with reduce-motion, frame">
          <div class="controls">
            <button type="button" data-step="-1" data-for="r${i}">◀</button>
            <button type="button" data-play="r${i}">play</button>
            <button type="button" data-step="1" data-for="r${i}">▶</button>
          </div>
        </div>
        <div class="samples" id="s-r${i}"></div>
      </div>`
          : ''
      }
    </div>`
      )
      .join('\n')}
  </section>

  <section>
    <p class="eyebrow">rule 11 · computed on the exact pixels</p>
    <h2>Contrast, on every step and every flag</h2>
    <p class="say">
      <code>tests/setup-contrast.mjs</code> walks every element with text of its own on all nine
      steps in eight palettes and both themes, resolves what is actually behind it - including the
      field, whose colour is a sibling block rather than an ancestor's background - and holds large
      text to 3:1 and everything else to 4.5:1. The worst pair anywhere is
      <b class="num">${contrast.worst.ratio}:1</b> on ${esc(contrast.worst.where)}
      (${esc(contrast.worst.what)}, ${contrast.worst.size}px/${contrast.worst.weight}, floor
      ${contrast.worst.floor}).
    </p>
    <div class="scroller">
      <table>
        <thead><tr><th>Palette</th><th>Worst on any step</th><th>What it is</th><th>Size</th><th>Floor</th></tr></thead>
        <tbody>
          ${Object.entries(contrastRows)
            .map(
              ([at, row]) => `<tr>
            <td>${esc(at)}</td>
            <td class="n"><b>${row.lowest.ratio}:1</b></td>
            <td>${esc(row.lowest.text)} <span class="measure">${esc(row.lowest.what)}</span></td>
            <td class="n">${row.lowest.size}px/${row.lowest.weight}</td>
            <td class="n">${row.lowest.floor}:1</td>
          </tr>`
            )
            .join('\n')}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <p class="eyebrow">named rather than met</p>
    <h2>What this ticket did not close</h2>
    <ul class="notes">
      <li>
        <strong>The runtime flow is nine steps, not ten.</strong> The step list counts the access
        mode and the pad as two; ticket 30 split them inside the module that four screens share
        rather than into two entries in <code>steps.ts</code>, and its split was signed off that way.
        The sun's growth and its accessible step count both read the runtime list, so they agree
        with what a person actually walks.
      </li>
      <li>
        <strong>The access-mode step carries its own forward and back.</strong> Those controls drive
        a state machine inside <code>AccessModeSetup</code> that setup, the journal gate, Settings
        and the recovery screen all mount. Inside setup they take the foot's drawing, so the eye
        meets the shape it has met eight times, but the foot itself is not the way on for that one
        step.
      </li>
      <li>
        <strong>The pad inside setup is not measured, and calling that out of scope would be
        dishonest.</strong> The demo's first-run control leaves the access mode in place, so the
        lock step falls to its toggle and never mounts the module - which means the no-scroll loop
        walks nine screens and never the pad. What the shots above are is the same module at its
        settings address, a different frame: the pad itself is 260px at 390 x 844 and 216 in the
        short form, down from 284 at both, and the screen it sits on scrolls 52px and 318px, down
        from 76 and 398. Ticket 34 needs a way in before either ticket can claim the pad's own fit.
      </li>
      <li>
        <strong>The rest of the palette still arrives in one frame.</strong> The field's colour
        wipes off towards the far corner when a flag is picked, and the accent under Skip, a tick's
        fill and a row's icon block all cut, because those tokens are published on
        <code>&lt;html&gt;</code> and nothing in the app transitions them. That is the cohesion
        sweep's to answer (ticket 20) rather than a step's.
      </li>
      <li>
        <strong>Every ghost button in the app changed colour.</strong> Setup's two ways past a step
        measured 4.38:1 on trans light, under the 4.5:1 small-text floor, because
        <code>.btn-ghost</code> was using raw <code>--accent</code> - which the palette already
        knows is sized to be sat on rather than read. It takes <code>--accent-ink</code> now, the
        same hue pulled toward the page's ink until it clears the floor everywhere. The fix is in
        the kit, so it reaches every ghost control.
      </li>
    </ul>
  </section>
</div>

<script>
  const SAMPLES = ${JSON.stringify(
    Object.fromEntries(
      flipbooks.flatMap((f, i) => [
        [String(i), { frames: f.full.frames.map((x) => x.at), samples: f.full.samples ?? [] }],
        [
          `r${i}`,
          { frames: f.reduced?.frames.map((x) => x.at) ?? [], samples: f.reduced?.samples ?? [] }
        ]
      ])
    )
  )};
  const FRAMES = ${JSON.stringify(
    Object.fromEntries(
      flipbooks.flatMap((f, i) => [
        [String(i), f.full.frames.map((x) => x.uri)],
        [`r${i}`, f.reduced?.frames.map((x) => x.uri) ?? []]
      ])
    )
  )};

  /* The sample nearest this frame's own millisecond: the two clocks are the
     screencast's and the page's rAF loop, which tick at the same rate and
     not on the same edge. */
  function sampleAt(key, ms) {
    const list = SAMPLES[key].samples;
    if (!list.length) return null;
    let best = list[0];
    for (const s of list) if (Math.abs(s.t - ms) < Math.abs(best.t - ms)) best = s;
    return best;
  }

  const SHOW = {
    edge: 'field edge',
    fieldBox: 'field box',
    askY: 'question rides',
    belowY: 'page rides',
    answersTop: 'answers top',
    footTop: 'foot top',
    suns: 'suns drawn',
    outlineOffset: 'frame offset',
    ringWidths: 'ring widths',
    ticked: 'ticked',
    marks: 'mark offset',
    fills: 'box fill',
    filled: 'dots filled',
    scales: 'dot scale'
  };

  function render(key, index) {
    const at = SAMPLES[key].frames[index];
    document.getElementById('img-' + key).src = FRAMES[key][index];
    document.getElementById('n-' + key).textContent = String(index + 1);
    document.getElementById('t-' + key).textContent = String(at);
    const box = document.getElementById('s-' + key);
    const sample = sampleAt(key, at);
    if (!sample) {
      box.innerHTML = '<p class="measure">no per-frame read on this scene</p>';
      return;
    }
    const rows = [];
    if (sample.questions) {
      rows.push([
        'questions',
        sample.questions.map((q) => q.text + ' @ ' + q.opacity).join(' / ') || 'none'
      ]);
    }
    for (const [field, label] of Object.entries(SHOW)) {
      if (!(field in sample)) continue;
      const value = sample[field];
      rows.push([label, Array.isArray(value) ? JSON.stringify(value) : String(value)]);
    }
    box.innerHTML =
      '<dl>' +
      rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') +
      '</dl>';
  }

  for (const key of Object.keys(FRAMES)) {
    if (!FRAMES[key].length) continue;
    const range = document.getElementById('r-' + key);
    range.addEventListener('input', () => render(key, Number(range.value)));
    render(key, 0);
  }
  document.addEventListener('click', (event) => {
    const stepper = event.target.closest('[data-step]');
    if (stepper) {
      const key = stepper.dataset.for;
      const range = document.getElementById('r-' + key);
      range.value = String(
        Math.max(0, Math.min(Number(range.max), Number(range.value) + Number(stepper.dataset.step)))
      );
      render(key, Number(range.value));
      return;
    }
    const player = event.target.closest('[data-play]');
    if (!player) return;
    const key = player.dataset.play;
    const range = document.getElementById('r-' + key);
    if (player.dataset.timer) {
      clearInterval(Number(player.dataset.timer));
      delete player.dataset.timer;
      player.textContent = 'play';
      return;
    }
    player.textContent = 'stop';
    let i = 0;
    player.dataset.timer = String(
      setInterval(() => {
        i = (i + 1) % (Number(range.max) + 1);
        range.value = String(i);
        render(key, i);
      }, 90)
    );
  });
</script>
`;

await writeFile(outFile, page);
console.log(`${outFile}: ${(page.length / 1e6).toFixed(2)}MB`);
