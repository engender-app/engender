/* The rules the surface kit and the chart kit have to keep, at the level a stylesheet and a component's source can be held to.

   Most of what makes these surfaces right is a judgement about proportion
   that only an eye settles, and tests/kit-gallery.mjs is where that happens.
   What is left over is mechanical, and all of it is something the craft
   floor or DIRECTION.md names outright - which means it is exactly the kind
   of thing that creeps back in one screen ticket at a time unless something
   is watching.

   A stylesheet has no interface to call, so these are greps and stay
   greps. The kit's arithmetic is the part that does have one,
   and it is held to values in chart-geometry.test.ts rather than read out
   of a component here. */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const kit = readFileSync('src/lib/styles/kit.css', 'utf8');
const kitNoComments = kit.replace(/\/\*[\s\S]*?\*\//g, '');

const componentDir = 'src/lib/components/kit';
const components = readdirSync(componentDir).filter((f) => f.endsWith('.svelte'));
const source = (file: string) => readFileSync(`${componentDir}/${file}`, 'utf8');

/** The markup half of a component: no script, no style. */
function markup(file: string): string {
  return source(file)
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
}

/** A component's own `<style>` block, comments stripped, or nothing where
    it has none.

    Read alongside kit.css by the mark rules below.
    A kit class has one consumer by construction - its component - so
    scripts/check-screens-classes.mjs asks a new one to live beside it
    rather than in the shared sheet, and the two components that ticket
    added are the first in the kit to take that up. A single-hue check that
    only read kit.css would have gone quietly vacuous the moment it
    mattered - which is why tests/motion-system.test.ts reads every
    component's style block too, and says so where it caps keyframe blur. */
function styleBlock(file: string): string {
  return [...source(file).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(([, css]) => css.replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
}

/** Everything the kit paints with, wherever the ticket that wrote it chose
    to put it: the shared sheet plus every kit component's own block. Every
    ban below reads this rather than kit.css alone, or a component style
    block becomes the place to put the shadow, the gradient and the second
    hue none of them may have. */
const kitAllCss = [kitNoComments, ...components.map(styleBlock)].join('\n');

/** Just the rules that draw a chart's marks - the line, its fill, the
    bars, the distribution, the donut's arcs and the ordered strip's
    segments. The card around them and the picker on its
    heading are chrome, and chrome is allowed the app's own surface and
    accent colours; the single-hue rule is about the marks.

    A focus ring is chrome too, wherever it lands. It is one of the browser
    surfaces the craft floor asks to be themed from the palette, every one
    in the app is drawn in the accent, and a bar row that can be focused
     is the first mark rule to carry one. Excluded by
    the state rather than by the selector, so the rules that paint the bar
    itself stay held to the hue. */
const markCss = kitAllCss
  .split('}')
  .filter((rule) => {
    const prelude = rule.split('{')[0] ?? '';
    return /\.kit-(area|bar|dist|donut|ordered)[a-z-]*/.test(prelude) && !prelude.includes(':focus-visible');
  })
  .join('}');

describe('the surfaces', () => {
  it('has one component per surface, its rows, and per chart kind', () => {
    expect(components.sort()).toEqual([
      'AreaChart.svelte',
      'BarRows.svelte',
      'BareStrip.svelte',
      'BatchedList.svelte',
      /* Not a surface: a `<g>` the area chart composes into its own plot,
         drawing what was happening around the readings. Beside the chart kit rather than inside any one screen,
         because five charts across four screens draw it and none of them
         may draw a sixth version of it. */
      'ChartAnnotations.svelte',
      'ChartCard.svelte',
      /* Not a surface: it draws one paragraph inside a chart card's own
         body, the "nothing logged in this range" text seven call sites
         used to hand-write against .kit-chart-empty directly. */
      'ChartEmpty.svelte',
      'ChartPicker.svelte',
      /* The box a tickable row draws. Not a surface of
         its own - it is a part of ListRow, the way MoodFace is a part of a
         chip - but its mark draws itself in and that motion wants one file
         to live in rather than being inlined in a row's markup. */
      'Check.svelte',
      /* Not a surface: one choice of a set drawn as wrapping chips, for
         choices whose labels a Segmented's equal shares clipped (phase 15
         release-blockers ticket 05). Three call sites, the tryout kind and
         the measurement type on the screen and in its editor. */
      'ChoiceChips.svelte',
      /* The delete-confirm every record-logging screen drew for itself
         (phase 5 UX ticket 39a). Not a surface either - it is a Sheet with
         a fixed arrangement inside it - but sixteen screens held
         byte-for-byte the same markup, and the question, the hint and both
         button labels are props, so it owns no copy. */
      'ConfirmDeleteSheet.svelte',
      'DayCard.svelte',
      'DayEntry.svelte',
      /* The question leaving changed work asks. Not a surface:
         a Sheet with a fixed arrangement, rendered from leaveGuard.ts, and
         the same words on every screen that has a draft to lose, so it
         owns its copy the way PhotoDayPromptSheet does. A screen may say
         more about what is lost in its body line, and nothing else. */
      'DiscardSheet.svelte',
      /* The app's one fold (after-release 28): a full-width row with its
         chevron at the far edge and the block it opens growing under it.
         Not a surface. It replaced native <details> on the managed lists,
         whose triangle and one-frame opening matched no other fold. */
      'Disclosure.svelte',
      'Distribution.svelte',
      /* A bar out of a zero line, left for lower and right for higher, in the
         section's one colour (ticket 20, the tag card). Sized by its caller
         against the rows of its own scale only, which is the thing the
         paired dots could not do for a list that mixed scales. */
      'DivergingBars.svelte',
      /* Parts of a whole where the parts have no order (ADR-0058): share by tag, share by presentation, share by
         injection site. The one mark in the kit that cannot label itself -
         an arc has nowhere to write a name that stays inside it at every
         share - which is why it is also the one that carries a legend
         outside the area chart. */
      'Donut.svelte',
      /* Not a surface: no pixels beyond a label a screen would otherwise
         have hand-drawn. It owns the wrapper, the
         label and the id the two agree on - the control is always the
         caller's own snippet. */
      'Field.svelte',
      /* Not a surface either: the group heading four call sites in doses
         and regimen hand-wrote identically, each with the same "not a
         Field, this names the group below it" comment - a legend and a hint over a control that isn't this
         component's to own. */
      'FieldGroupHeading.svelte',
      'ListCard.svelte',
      'ListRow.svelte',
      'MoodChips.svelte',
      /* MoodFace is deliberately not here. Ticket 31 folded the kit's face
         and the picker's into one component at src/lib/components, because
         the two were one drawing with two sets of markup and the eyes could
         not be changed without changing both. A chip and a day card ask it
         for a size; a chip and the picker ask it to be alive, which is the
         glance and the gaze together. */
      'Notice.svelte',
      /* The other half of ADR-0058's rule: parts of a whole where the
         order is the information. Mood distribution draws as this rather
         than as Distribution's columns, which is the one place the two
         forms overlap - a ring of five ordered steps cannot show
         mostly-the-middle-two, and neither can five columns without the
         reader measuring them against each other. */
      'OrderedStrip.svelte',
      /* Two positions on one scale with the gap between them: the merged
         tag card's own mark, and the survivor of a
         real choice between it and bars, since a paired dot reads each row
         against its own track rather than against the longest one in the
         set, which is what let the merged card mix scales with no
         normalizing of its own. */
      'PairedDots.svelte',
      /* Not a surface: a Sheet with a fixed arrangement inside it, the same
         shape ConfirmDeleteSheet is - except this one owns its
         own copy rather than taking it as props, because both callers (the
         entry editor's and the milestone editor's own add-photo flows) ask
         exactly the same question in exactly the same words. ConfirmDeleteSheet
         takes copy as props because its sixteen callers each word their own
         confirmation differently; this one has no such variation to plumb. */
      'PhotoDayPromptSheet.svelte',
      /* The rows, the add control, the confirm sheet and the alignment
         review five screens each assembled around a photo list. Unlike RecordSheet below, it does draw its own
         pixels - a thumbnail row over ListCard - which is why it is a
         surface rather than "the other half of" one. */
      'PhotoSection.svelte',
      /* Two photographs of the same body months apart, in one frame, under
         one draggable divider. A surface of
         its own: it draws a frame, two plates, two date blocks and a
         handle, and the progress-photo comparison reads it. */
      'PhotoWipe.svelte',
      /* Not a surface either, and the only kit component that draws no
         pixels of its own: the three-state gate thirty-one screens used to
         hand-write over a journal read. It picks
         a branch - placeholder, rows, empty state, or the words two screens
         have for a read that failed - and renders the screen's snippet for
         it. The rule it renders is readGate.ts, node-tested beside it. */
      'ReadGate.svelte',
      /* Not a surface either: the gate that holds several independently read
         components behind one placeholder. */
      'ReadGroup.svelte',
      'ReadReserve.svelte',
      /* The Look back door's readings as tiles: a
         flush tile stating one figure for the span with a chevron into its
         own screen, and the two-column hairlined grid they sit in. In the
         kit because the tile is a surface with a rule of its own - name in
         the secondary ink, figure in the page's, colour only in the drawing
         - and because nine call sites draw it. */
      'ReadingGrid.svelte',
      'ReadingTile.svelte',
      /* The other half of what a record-logging screen used to hand-write:
         the editor sheet around ConfirmDeleteSheet
         above, with its new-or-edit title, its save-and-delete pair and the
         three walkthrough handles that go with them. Not a surface either -
         a screen passes its fields as a snippet and this owns no field of
         its own. */
      'RecordSheet.svelte',
      'SectionHeading.svelte',
      'Tile.svelte',
      'TileGrid.svelte',
      /* The year's days as words under YearRows' picture (phase 14
         pre-release ticket 30, accessibility audit A06): a fold, a month
         stepper and a list. In the kit beside the grid it reads, because
         the pair is one chart - the picture for the eye, the list for
         everybody the picture leaves out. */
      'YearDaysList.svelte',
      /* Phase 5 UX ticket 23: a year of days, because twelve bars said
         where a year's shape went and a retrospective wanted what the year
         was. Phase 11 ticket 07 made the days shaded cells in twelve rows
         rather than a face each. */
      'YearRows.svelte'
    ]);
  });

  it('separates with a line and never with a shadow', () => {
    // DIRECTION.md decision 2: two surfaces, not a stack of planes. The
    // app's one shadow belongs to the floating nav bar and its add button,
    // which are the shell's, not the kit's.
    expect(kitAllCss).not.toMatch(/box-shadow/);
  });

  it('has no coloured bar down the side of anything', () => {
    // The craft floor names a coloured border-left above 1px as the single
    // most recognisable AI-UI tell there is, and the slop audit took one
    // off the notice this kit replaces.
    const sided = [...kitAllCss.matchAll(/border-(left|right):\s*([^;]+);/g)];
    for (const [, side, value] of sided) {
      expect(value, `border-${side}`).toMatch(/^\s*1px|^\s*0/);
    }
  });

  it('paints flat colour, never a gradient', () => {
    /* Strip uses radial-gradient for a 1.5px neutral dot pattern on blank days,
       not a color gradient fill. */
    const stripped = kitAllCss.replace(
      /radial-gradient\(circle at center,\s*var\(--outline\)\s*1\.5px,\s*transparent\s*1\.6px\)/g,
      ''
    );
    expect(stripped).not.toMatch(/gradient\(/);
  });

  it('gives every interactive element a data-* handle (ADR-0029)', () => {
    for (const file of components) {
      const html = markup(file);
      const interactive = /<(a|button)\b/.test(html);
      if (!interactive) continue;
      /* Spelled out in the markup, or built from the screen's own record
         name by recordHandles.ts, which is where the vocabulary for a record
         sheet's three buttons lives. Either way
         the handle exists; tests/walkthrough-handles-exist.ts is what
         resolves a generated one back to the screen that named it. */
      if (source(file).includes('recordHandles')) continue;
      expect(html, file).toMatch(/data-[a-z-]+/);
    }
  });

  it('takes every string as a message key or a prop, never as inline copy', () => {
    for (const file of components) {
      const text = markup(file)
        // Expressions are what a message key or a prop arrives as.
        .replace(/\{[^{}]*\}/g, '')
        // Comments, and the tags themselves.
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]*>/g, '\n');
      const copy = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /[A-Za-z]/.test(line));
      expect(copy, file).toEqual([]);
    }
  });
});

describe('the charts', () => {
  it('has nowhere to say what a reading means', () => {
    // PRODUCT.md: the app never interprets a value, and a headline is an
    // interpretation. The heading names what the chart shows; there is no
    // prop for a finding and no slot under the marks for a paragraph.
    const chartCard = source('ChartCard.svelte');
    for (const forbidden of ['description', 'caption', 'finding', 'summary', 'insight', 'note']) {
      expect(chartCard, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\??:`));
    }
  });

  it('draws every mark in one hue', () => {
    /* Marks use one hue per series (ADR-0012). --role-draw is the
       undiluted flag stripe. The 3:1 adjustment stays on glyphs drawn
       inside tinted discs. --role-wash and --surface-2 also cover bar-row
       press feedback and scrub readout chrome.

       The area chart's dashed second series may use --role-2 and
       --role-2-draw, resolved from another stripe of the same flag.
       --accent-2 covers cards without a role. Keep that exception scoped
       to the second series. */
    /* The donut's five are geometry and dilution,
       not colour: --arc-dash, --arc-rest and --arc-offset are lengths
       along the ring's own path, --circ is the circumference the first
       two add up to, and --slice-weight is how much of --role-draw an arc
       keeps before the rest of it is the card. So the hue is still the
       section's stripe and nothing here can name a second one - which is
       what this rule is about. The ordered strip needed none: its width
       is --bar-share and its fill is --dist-fill, the same two the bars
       and the distribution already use. */
    /* --role-fill-ink joins them for the same reason --role-ink is here: it
       is the role's own colour again, not a second one. It is what a label
       written on top of --role-draw is drawn in - the ink the role's heat
       ramp carries for the step whose fill is the stripe itself - so the
       card still wears one hue and the words on the bar can be read. */
    /* --role-edge too: the casing under a line whose
       stripe is under 3:1, which is the stripe's own hue moved in lightness
       the way --role-mark is. The second series' edge rides with the second
       series. */
    const allowed =
      /^(--role-ink|--role-mark|--role-draw|--role-edge|--role-fill-ink|--role-wash|--dist-fill|--surface|--surface-2|--outline|--hairline|--text|--text-2|--bar-share|--bar-index|--bar-delay|--stagger-step|--face-mood|--face-size|--mood-\d|--slice-weight|--arc-dash|--arc-rest|--arc-offset|--circ)$/;
    /* The second hue, admitted for the area chart's second series and for
       nothing else. Read per rule rather than over the whole of markCss:
       allowing it globally would let the next bar set or distribution take a
       second colour without anything here noticing, which is the opposite of
       what a named exception is for. */
    const secondSeries = /^(--role-2|--role-2-draw|--role-2-edge|--role-2-edge-in|--accent-2)$/;
    /* The presentation chip's ring (ADR-0048) is
       a third hue, and the same reasoning applies: it names a presentation's
       own role rather than the chart's, resolved through roleAt() by the
       screen the same way the second series is, and it is the one place
       .kit-area-highlight itself is allowed to use it. */
    const isHighlightRule = /\.kit-area-highlight/;
    for (const rule of markCss.split('}')) {
      const prelude = rule.split('{')[0] ?? '';
      const isAreaChart = /\.kit-area/.test(prelude);
      for (const [, token] of rule.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (/^--(space|text|radius|r-block|dur|ease|font|weight|leading|display|touch)/.test(token)) continue;
        if (isAreaChart && secondSeries.test(token)) continue;
        if (isHighlightRule.test(prelude) && token === '--highlight') continue;
        expect(token, `${token} in the chart rules`).toMatch(allowed);
      }
    }
    // And no raw colour anywhere in them.
    expect(markCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markCss).not.toMatch(/\b(rgb|hsl)a?\(/);
    // The filter above has to have found the marks at all.
    expect(markCss).toMatch(/\.kit-area-line/);
    expect(markCss).toMatch(/\.kit-bar-mark/);
    expect(markCss).toMatch(/\.kit-dist-mark/);
    expect(markCss).toMatch(/\.kit-donut-arc/);
    expect(markCss).toMatch(/\.kit-ordered-seg/);
  });

  it('draws no gridline, no axis and no tick', () => {
    for (const furniture of ['gridline', 'axis', 'tick']) {
      expect(kitAllCss, furniture).not.toMatch(new RegExp(`\\.kit-[a-z-]*${furniture}`));
    }
  });

  /* The kit allows legends on two charts. A two-series area chart needs
     both metrics named. A donut needs swatches beside its segments because
     small arcs cannot fit labels or leader lines at phone width. Cap it at
     five arcs. Single-series marks carry their own labels. The wear trend's
     legend is outside the kit. */
  it('draws a legend only for the area chart with a second metric and for the donut', () => {
    const legends = [...kitAllCss.matchAll(/\.kit-[a-z-]*legend[a-z-]*/g)].map(([sel]) => sel);
    expect(legends.length).toBeGreaterThan(0);
    for (const selector of legends) expect(selector).toMatch(/^\.kit-(area|donut)-legend/);
  });

  it('breaks a row subtitle inside a word, like its title, so it never runs under a trailing control', () => {
    const rule = /\.kit-row-sub\s*\{([^}]*)\}/.exec(kitNoComments);
    expect(rule?.[1]).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('caps how many points a chart draws, whatever range it is given', async () => {
    const { MAX_POSITIONS, atGrain } = await import('../src/lib/charts/grain');
    const threeYears = Array.from({ length: 1095 }, (_, i) => ({ x: i, y: i % 5 }));
    expect(atGrain(threeYears, threeYears.length).points.length).toBeLessThanOrEqual(MAX_POSITIONS);
  });
});
