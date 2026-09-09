/* Builds the sign-off page for the gates (redesign ticket 34).

   Everything on it is a measurement or a render this ticket's own scripts
   produced, embedded so the page needs nothing at read time:

     tests/gates-gallery.mjs      the shots and floor.json, run once on this
                                  branch and once from a worktree of main for
                                  the before column
     tests/gate-motion-gallery.mjs the twelve recordings, bundled by
                                  tests/panel-motion-flipbook.mjs
     tests/gate-contrast.mjs      every piece of type on eighteen gates in
                                  eight palettes and both themes
     tests/gate-open-cost.mjs     what the opening costs the person who typed
                                  the right secret

   It shows the gates and nothing else (Alicja on ticket 07's sign-off: only
   the things the ticket changed), and every movement is a flipbook with
   frame numbers and millisecond stamps rather than a still or a video (her
   note on ticket 19's). The page's own look follows tests/setup-review.mjs,
   which is the ticket before this one's.

   Run: node tests/gate-review.mjs [outFile] */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const AFTER = resolve(root, '.claude/gate-shots');
const BEFORE = resolve(root, '../main-baseline-34/.claude/gate-shots-before');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/gate-review.html'));

/** One shot, scaled to `width` CSS pixels and encoded as a data URI. The
    shots are taken at deviceScaleFactor 2, so a 390px phone is 780px of PNG
    and everything here is a downscale. */
async function shot(dir, name, width, quality = 80) {
  try {
    const { stdout } = await run(
      'magick',
      [resolve(dir, `${name}.png`), '-resize', `${width * 2}x`, '-quality', String(quality), 'jpeg:-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }
    );
    return `data:image/jpeg;base64,${stdout.toString('base64')}`;
  } catch {
    return null;
  }
}

const contrast = JSON.parse(await readFile(resolve(root, '.claude/gate-contrast.json'), 'utf8'));
const motion = JSON.parse(await readFile(resolve(root, '.claude/gate-motion.json'), 'utf8'));
const floor = JSON.parse(await readFile(resolve(AFTER, 'floor.json'), 'utf8'));

/* ---------- the gates, before and after ---------- */

/* Every gate a person can actually meet, in the order they meet them: the
   cold start first, then the mid-session lock, then the four that only
   appear when something has gone wrong or is being changed. */
const GATES = [
  ['unlock-pin', 'Cold start, PIN'],
  ['unlock-passphrase', 'Cold start, passphrase'],
  ['unlock-biometric', 'Cold start, biometric'],
  ['android-key', 'Cold start, Android Keystore'],
  ['session-pin', 'Mid-session lock, PIN'],
  ['session-passphrase', 'Mid-session lock, passphrase'],
  ['session-device', 'Mid-session lock, the screen lock'],
  ['access-choice', 'Choosing how it opens'],
  ['recovery-entry', 'The recovery key'],
  ['post-recovery', 'After a recovery unlock'],
  ['converting', 'A conversion running'],
  ['conversion-refused', 'A conversion refused'],
  ['device-recovery', 'The device-bound dead end'],
  ['android-key-invalidated', 'The Keystore key is gone'],
  ['android-key-no-lock', 'No screen lock to bind to'],
  ['schema-too-new', 'A newer journal than this build']
];

const gatePairs = [];
for (const [key, label] of GATES) {
  gatePairs.push({
    label,
    key,
    before: await shot(BEFORE, `gate-${key}-trans-light`, 200),
    after: await shot(AFTER, `gate-${key}-trans-light`, 200)
  });
}

/* ---------- the flipbooks ---------- */

const SCENES = [
  ['unlock-passphrase', 'The app opening, passphrase', 'rule 15, ADR-0078'],
  ['unlock-pin', 'The app opening, PIN', 'rule 15, ADR-0078'],
  ['pad-digit', 'A digit on the pad', 'rule 13'],
  ['refusal', 'A wrong PIN', 'rule 15'],
  ['throttle', 'The wait draining', 'rule 15'],
  ['mode-switch', 'A mode picked, inside the gate', 'rules 10, 12']
];

const byName = new Map((motion.sets.gates ?? []).map((s) => [s.name, s]));
const flipbooks = [];
for (const [name, label, rule] of SCENES) {
  const full = byName.get(name);
  if (!full) continue;
  flipbooks.push({ name, label, rule, note: full.note, full, reduced: byName.get(`reduce-${name}`) });
}

/* ---------- the unlock's own curve, as a table ---------- */

/* The samples the passphrase unlock took, thinned to the frames that
   actually moved: this is the claim "one object, and it only moves up or
   down" as a column of numbers rather than as an impression. */
const unlockCurve = (byName.get('unlock-passphrase')?.samples ?? [])
  .filter((s) => s.nav && s.edgeOld !== null)
  .map((s) => ({
    t: s.t,
    edgeOld: s.edgeOld,
    edgeNew: s.edgeNew,
    ride: s.contentRide,
    titleRide: s.titleRide ?? 0,
    titleFade: Number(s.titleFade ?? 1).toFixed(2),
    arrivingFade: Number(s.arrivingFade ?? 0).toFixed(2)
  }));
const sameBox = unlockCurve.every((r) => r.edgeOld === r.edgeNew);
const twoSolid = unlockCurve.filter(
  (r) => Number(r.titleFade) > 0.05 && Number(r.arrivingFade) > 0.05
).length;
const edges = unlockCurve.map((r) => r.edgeOld);
const biggestStep = edges.slice(1).reduce((m, e, i) => Math.max(m, Math.abs(e - edges[i])), 0);

/* ---------- the contrast walk ---------- */

const contrastRows = Object.entries(contrast.findings)
  .filter(([, v]) => v.lowest)
  .map(([key, v]) => {
    const parts = key.split('-');
    const theme = parts.pop();
    const palette = parts.pop();
    return { scene: parts.join('-'), palette, theme, ...v };
  });
const worstByScene = new Map();
for (const row of contrastRows) {
  const held = worstByScene.get(row.scene);
  if (!held || row.lowest.ratio < held.lowest.ratio) worstByScene.set(row.scene, row);
}
const underFloor = contrastRows.filter((r) => r.failed.length).length;

/* ---------- rule 14 ---------- */

const floorRows = Object.entries(floor).map(([key, value]) => {
  const at = key.lastIndexOf('-');
  return { scene: key.slice(0, at), size: key.slice(at + 1), ...value };
});
const floorBreaches = floorRows.filter((r) => r.frame > 0);
const scrolling = floorRows.filter((r) => r.page > 0);

/* ---------- the page ---------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = `<title>The Gates Move</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Nunito:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
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
    --display: 'Outfit', 'Trebuchet MS', sans-serif;
    --body: 'Nunito', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      color-scheme: dark;
      --bg: #141011; --surface: #1E1719; --sunk: #251D20;
      --ink: #F3ECEE; --ink-2: #A69B9F; --rule: #342B2E;
      --accent: #EC8CA3; --good: #7CC79E; --warn: #E0A560;
    }
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #141011; --surface: #1E1719; --sunk: #251D20;
    --ink: #F3ECEE; --ink-2: #A69B9F; --rule: #342B2E;
    --accent: #EC8CA3; --good: #7CC79E; --warn: #E0A560;
  }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.55; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 56px 24px 96px; }
  h1 { font-family: var(--display); font-weight: 800; font-size: clamp(2.2rem, 6vw, 3.2rem); letter-spacing: -0.03em; line-height: 1; margin: 0 0 12px; text-wrap: balance; }
  .lede { font-size: 1.0625rem; color: var(--ink-2); max-width: 62ch; margin: 0 0 8px; }
  .lede strong { color: var(--ink); font-weight: 700; }
  h2 { font-family: var(--display); font-weight: 800; font-size: 1.65rem; letter-spacing: -0.02em; margin: 0 0 4px; text-wrap: balance; }
  h3 { font-family: var(--display); font-weight: 700; font-size: 1.0625rem; margin: 0 0 4px; }
  section { margin-top: 64px; }
  .eyebrow { font-family: var(--mono); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin: 0 0 6px; }
  .say { max-width: 68ch; color: var(--ink-2); margin: 0 0 20px; }
  .say strong { color: var(--ink); font-weight: 700; }
  code, .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  code { font-size: 0.9em; background: var(--sunk); padding: 1px 4px; border-radius: 3px; }
  .grid { display: grid; gap: 28px 20px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .pair { display: grid; gap: 10px; }
  .pair-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
  figure { margin: 0; display: grid; gap: 6px; }
  figure img { width: 100%; height: auto; display: block; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface); }
  figcaption { font-family: var(--mono); font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-2); }
  .measure { font-family: var(--mono); font-size: 0.75rem; color: var(--ink-2); }
  .measure b { color: var(--ink); font-weight: 600; }
  .over { color: var(--warn); font-weight: 600; }
  .zero { color: var(--good); font-weight: 600; }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  .scroller { overflow-x: auto; }
  th, td { text-align: left; padding: 7px 12px 7px 0; border-bottom: 1px solid var(--rule); }
  th { font-family: var(--mono); font-size: 0.6875rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); font-weight: 600; }
  td.n { font-family: var(--mono); font-variant-numeric: tabular-nums; }
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
  button { font-family: var(--body); font-size: 0.8125rem; font-weight: 700; color: var(--ink); background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  button:hover { border-color: var(--ink-2); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .samples { font-family: var(--mono); font-size: 0.75rem; line-height: 1.5; }
  .samples dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 14px; margin: 0; }
  .samples dt { color: var(--ink-2); }
  .samples dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .reduced { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--rule); }
  ul.notes { max-width: 68ch; padding-left: 20px; color: var(--ink-2); }
  ul.notes li { margin-bottom: 12px; }
  ul.notes strong { color: var(--ink); font-weight: 700; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>

<div class="wrap">
  <p class="eyebrow">phase 10 · redesign ticket 34 · trans, light</p>
  <h1>The gates move</h1>
  <p class="lede">
    The screens most people see most often, and the only ones phase 10 had not touched. A gate is a
    step with nothing to skip (rule 15), so every one of them wears the field now - the flag's
    second colour from the window's top edge with one title on it, the page underneath - and the
    60px tinted disc that sat above the title is gone.
  </p>
  <p class="lede">
    <strong>Arrival is still a cut</strong>, on every gate, deliberately: a cold start has nothing
    to come from and a lock arriving is the one state change whose whole value is being instant.
    Everything after that first frame moves, and the piece that matters is the last one - the
    secret accepted, which was a screen disappearing and is now the app opening.
  </p>

  <section>
    <p class="eyebrow">rule 15 · every gate, before and after</p>
    <h2>The gates</h2>
    <p class="say">
      Left is a worktree of <strong>main</strong>, right is this branch, both at 390x844 on trans
      light. Nothing else is on this page: the first run has its own galleries.
    </p>
    <div class="grid">
      ${gatePairs
        .map(
          (p) => `<div class="pair">
        <h3>${esc(p.label)}</h3>
        <div class="pair-shots">
          <figure>${p.before ? `<img src="${p.before}" alt="${esc(p.label)} before">` : '<p class="measure">no shot</p>'}<figcaption>before</figcaption></figure>
          <figure>${p.after ? `<img src="${p.after}" alt="${esc(p.label)} after">` : '<p class="measure">no shot</p>'}<figcaption>after</figcaption></figure>
        </div>
      </div>`
        )
        .join('\n')}
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 10 · frame by frame</p>
    <h2>The motion</h2>
    <p class="say">
      Drag the scrubber, or use the arrow keys once a flipbook has focus. The counter is the frame
      number and the millisecond it landed; the numbers beside it were read in the page on that
      frame. Under each movement is the same one with reduce-motion set, which the contract asks to
      substitute rather than delete.
    </p>
    <p class="say">
      On the two unlocks the numbers come off the transition's own pseudo elements rather than the
      tree: across a change like this the live DOM is not what is painted. <code>edge old</code> and
      <code>edge new</code> are the two halves of the blind, and they carry the same number on every
      frame - that is what makes it one field opening rather than two fields swapping.
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
    <p class="eyebrow">the unlock, as numbers</p>
    <h2>One object, moving down</h2>
    <p class="say">
      Every painted frame of the passphrase unlock. The edge opens from the gate's own height to the
      height the screen behind it draws, runs ${Math.max(...edges) - edges.at(-1)}px past its mark
      and comes back; the biggest step between two frames is <b class="num">${biggestStep}px</b>, so
      nothing teleports. The two halves of the blind agree on
      <b class="${sameBox ? 'zero' : 'over'}">${sameBox ? 'every frame' : 'some frames only'}</b>, and
      <b class="${twoSolid ? 'over' : 'zero'}">${twoSolid}</b> frames carry two solid titles at once.
    </p>
    <div class="scroller">
      <table>
        <thead><tr><th>ms</th><th>edge old</th><th>edge new</th><th>page rides</th><th>title rides</th><th>title</th><th>arriving</th></tr></thead>
        <tbody>
          ${unlockCurve
            .map(
              (r) => `<tr><td class="n">${r.t}</td><td class="n">${r.edgeOld}</td><td class="n">${r.edgeNew}</td><td class="n">${r.ride}</td><td class="n">${r.titleRide}</td><td class="n">${r.titleFade}</td><td class="n">${r.arrivingFade}</td></tr>`
            )
            .join('\n')}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 11 · computed on the exact pixels</p>
    <h2>Contrast, on every gate and every flag</h2>
    <p class="say">
      <code>tests/gate-contrast.mjs</code> walks every element with text of its own on eighteen
      gates in eight palettes and both themes, resolves what is actually behind it - the field's
      paint is a sibling block rather than an ancestor, so climbing the tree would measure the
      title against the page it is not drawn on - and applies the 3:1 large-text floor or the 4.5:1
      one by what the browser actually laid out.
      <strong>${contrastRows.length} gate/palette/theme combinations measured, ${underFloor} under the floor.</strong>
      The worst anywhere is <b class="num">${contrast.worst.ratio}:1</b> on ${esc(contrast.worst.where)} -
      "${esc(contrast.worst.text)}" at ${contrast.worst.size}px/${contrast.worst.weight}, against a
      ${contrast.worst.floor}:1 floor.
    </p>
    <div class="scroller">
      <table>
        <thead><tr><th>gate</th><th>worst pair</th><th>ratio</th><th>floor</th><th>what</th></tr></thead>
        <tbody>
          ${[...worstByScene.values()]
            .sort((a, b) => a.lowest.ratio - b.lowest.ratio)
            .map(
              (r) => `<tr><td>${esc(r.scene)}</td><td>${esc(r.palette)} ${esc(r.theme)}</td>` +
                `<td class="n ${r.lowest.ratio < r.lowest.floor ? 'over' : 'zero'}">${r.lowest.ratio}</td>` +
                `<td class="n">${r.lowest.floor}</td><td>${esc(r.lowest.text)}</td></tr>`
            )
            .join('\n')}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <p class="eyebrow">rule 14 · measured, not asserted</p>
    <h2>No gate scrolls</h2>
    <p class="say">
      A gate's frame is exactly the window and never scrolls; the page under the field is the one
      region that may, and on the long gates it does. Both reads, on every gate at 320x568,
      360x640, 390x844, 430x932 and 390x360 - the last standing in for a raised keyboard.
      <strong>${floorRows.length} gate/size pairs, ${floorBreaches.length} breaches.</strong>
      ${scrolling.length} of them scroll their page region, which is what it is for.
    </p>
    ${
      floorBreaches.length
        ? `<div class="scroller"><table><thead><tr><th>gate</th><th>size</th><th>frame hides</th></tr></thead><tbody>${floorBreaches
            .map((r) => `<tr><td>${esc(r.scene)}</td><td class="n">${esc(r.size)}</td><td class="n over">${r.frame}px</td></tr>`)
            .join('')}</tbody></table></div>`
        : '<p class="measure zero">every gate clears the floor at every size.</p>'
    }
  </section>

  <section>
    <p class="eyebrow">what it costs</p>
    <h2>The person who typed the right secret</h2>
    <p class="say">
      Measured as an A/B inside one build, with <code>document.startViewTransition</code> deleted
      for the control arm so the two differ by exactly the thing this ticket added
      (<code>tests/gate-open-cost.mjs</code>, median of six unlocks each):
    </p>
    <ul class="notes">
      <li>
        <strong>The app arrives one frame later.</strong> 110ms from the submit without the
        opening, 126ms with it. The commit runs inside the transition's callback rather than in the
        click's own turn, and that is the whole of the difference.
      </li>
      <li>
        <strong>For 401ms after that the app is not hit-testable</strong>, because Chromium paints
        a transition's snapshots over the page. An ordinary door change measures 433ms of the same
        thing, so this is the window every navigation in the app has had since phase 5 ticket 18
        rather than one this ticket introduced.
      </li>
      <li>
        <strong>Nothing waits on the animation.</strong> <code>openApp</code> is not awaited by any
        caller: the journal is open the instant the commit runs, and the boot's own effects start
        before it.
      </li>
    </ul>
  </section>

  <section>
    <p class="eyebrow">named rather than met</p>
    <h2>Three things to look at</h2>
    <ul class="notes">
      <li>
        <strong>A mode switch crossfades first and moves second.</strong> Flipbook six: the two
        titles cross over about 83ms, and only then does the edge travel from 115 to 70. A gate's
        edge is measured from its own field, and the outgoing title shares a grid cell with the
        incoming one, so the field cannot know it is about to get shorter until the old title has
        gone. Setup does not have this because its edge is computed from the step counter. It can be
        made simultaneous by taking the leaving title out of flow - say if it reads as a hesitation
        to you.
      </li>
      <li>
        <strong>A cold start holds the last frame of the gate for about 250ms before the opening
        starts.</strong> That is the journal being opened on the main thread, and it is the same
        wait as before this ticket - what changed is that the gate is now still on screen for it
        rather than being replaced at the end of it. The mid-session unlock has no such wait: its
        journal is already open, and the opening starts 66ms after the submit.
      </li>
      <li>
        <strong>The worst contrast on any gate is 4.5:1 against a 4.5:1 floor</strong> - "Delete
        everything and start over", the danger-coloured way out on the two dead-end gates. It
        passes, and it passes by nothing. It is the page's own <code>--danger</code> at 16/750
        rather than anything this ticket drew.
      </li>
    </ul>
  </section>
</div>

<script>
  const SAMPLES = ${JSON.stringify(
    Object.fromEntries(
      flipbooks.flatMap((f, i) => [
        [String(i), { frames: f.full.frames.map((x) => x.at), samples: f.full.samples ?? [] }],
        [`r${i}`, { frames: f.reduced?.frames.map((x) => x.at) ?? [], samples: f.reduced?.samples ?? [] }]
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
     screencast's and the page's rAF loop, which tick at the same rate and not
     on the same edge. */
  function sampleAt(key, ms) {
    const list = SAMPLES[key].samples;
    if (!list.length) return null;
    let best = list[0];
    for (const s of list) if (Math.abs(s.t - ms) < Math.abs(best.t - ms)) best = s;
    return best;
  }

  const SHOW = {
    nav: 'pattern',
    edgeOld: 'edge old',
    edgeNew: 'edge new',
    contentRide: 'page rides',
    titleRide: 'title rides',
    titleFade: 'title opacity',
    arrivingRide: 'arriving rides',
    arrivingFade: 'arriving opacity',
    gates: 'gates in the tree',
    filled: 'dots filled',
    scales: 'dot scale',
    fills: 'dot fill',
    keyPress: 'key press',
    rowShift: 'row shift',
    refused: 'refused',
    says: 'the line says',
    state: 'status',
    drain: 'rail drain',
    railThere: 'rail drawn',
    padDisabled: 'pad disabled',
    edge: 'field edge',
    clip: 'paint clip',
    askY: 'title rides',
    belowY: 'page rides'
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
    if (sample.headings) {
      rows.push([
        'titles',
        sample.headings.map((h) => h.text + ' @ ' + h.opacity).join(' / ') || 'none'
      ]);
    }
    for (const [field, label] of Object.entries(SHOW)) {
      if (!(field in sample)) continue;
      const value = sample[field];
      if (value === null) continue;
      rows.push([label, Array.isArray(value) ? JSON.stringify(value) : String(value)]);
    }
    box.innerHTML = '<dl>' + rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
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
