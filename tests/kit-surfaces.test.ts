/* The rules the surface kit and the chart kit have to keep (phase 5 ticket
   20), at the level a stylesheet and a component's source can be held to.

   Most of what makes these surfaces right is a judgement about proportion
   that only an eye settles, and tests/kit-gallery.mjs is where that happens.
   What is left over is mechanical, and all of it is something the craft
   floor or DIRECTION.md names outright - which means it is exactly the kind
   of thing that creeps back in one screen ticket at a time unless something
   is watching.

   A stylesheet has no interface to call, so these are greps and stay
   greps (ticket 08). The kit's arithmetic is the part that does have one,
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

    Read alongside kit.css by the mark rules below (phase 8 UX ticket 04).
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
    (phase 5 UX ticket 23) is the first mark rule to carry one. Excluded by
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
      /* Not a surface: a `<g>` the area chart composes into its own plot,
         drawing what was happening around the readings (phase 5 deepening
         ticket 23). Beside the chart kit rather than inside any one screen,
         because five charts across four screens draw it and none of them
         may draw a sixth version of it. */
      'ChartAnnotations.svelte',
      'ChartCard.svelte',
      /* Not a surface: it draws one paragraph inside a chart card's own
         body, the "nothing logged in this range" text seven call sites
         used to hand-write against .kit-chart-empty directly (phase 5
         audit ticket 16). */
      'ChartEmpty.svelte',
      'ChartPicker.svelte',
      /* The box a tickable row draws (phase 5 ticket 35). Not a surface of
         its own - it is a part of ListRow, the way MoodFace is a part of a
         chip - but its mark draws itself in and that motion wants one file
         to live in rather than being inlined in a row's markup. */
      'Check.svelte',
      /* The delete-confirm every record-logging screen drew for itself
         (phase 5 UX ticket 39a). Not a surface either - it is a Sheet with
         a fixed arrangement inside it - but sixteen screens held
         byte-for-byte the same markup, and the question, the hint and both
         button labels are props, so it owns no copy. */
      'ConfirmDeleteSheet.svelte',
      'DayCard.svelte',
      'DayEntry.svelte',
      'Distribution.svelte',
      /* Parts of a whole where the parts have no order (phase 8 UX ticket
         04, ADR-0058): share by tag, share by presentation, share by
         injection site. The one mark in the kit that cannot label itself -
         an arc has nowhere to write a name that stays inside it at every
         share - which is why it is also the one that carries a legend
         outside the area chart. */
      'Donut.svelte',
      /* Not a surface: no pixels beyond a label a screen would otherwise
         have hand-drawn (phase 5 audit ticket 10). It owns the wrapper, the
         label and the id the two agree on - the control is always the
         caller's own snippet. */
      'Field.svelte',
      /* Not a surface either: the group heading four call sites in doses
         and regimen hand-wrote identically, each with the same "not a
         Field, this names the group below it" comment (phase 5 audit
         ticket 10) - a legend and a hint over a control that isn't this
         component's to own. */
      'FieldGroupHeading.svelte',
      'ListCard.svelte',
      'ListRow.svelte',
      'MoodChips.svelte',
      /* Two marks phase 5 UX ticket 23 added, both because an existing one
         was answering the wrong question. MoodYear is a year of days at a
         face each - twelve bars said where a year's shape went and a
         retrospective wanted what the year was. PairedDots is two readings
         of one scale with the gap between them, which is what a correlation
         card is: bars measured every row against the longest one and made
         six of them read as a third copy of the chart above. */
      'MoodYear.svelte',
      /* MoodFace is deliberately not here. Ticket 31 folded the kit's face
         and the picker's into one component at src/lib/components, because
         the two were one drawing with two sets of markup and the eyes could
         not be changed without changing both. A chip and a day card ask it
         for a size; the picker asks for a blink. */
      'Notice.svelte',
      /* The other half of ADR-0058's rule: parts of a whole where the
         order is the information. Mood distribution draws as this rather
         than as Distribution's columns, which is the one place the two
         forms overlap - a ring of five ordered steps cannot show
         mostly-the-middle-two, and neither can five columns without the
         reader measuring them against each other. */
      'OrderedStrip.svelte',
      'PairedDots.svelte',
      /* Not a surface: a Sheet with a fixed arrangement inside it, the same
         shape ConfirmDeleteSheet is (ticket 47) - except this one owns its
         own copy rather than taking it as props, because both callers (the
         entry editor's and the milestone editor's own add-photo flows) ask
         exactly the same question in exactly the same words. ConfirmDeleteSheet
         takes copy as props because its sixteen callers each word their own
         confirmation differently; this one has no such variation to plumb. */
      'PhotoDayPromptSheet.svelte',
      /* The rows, the add control, the confirm sheet and the alignment
         review five screens each assembled around a photo list (phase 5
         audit ticket 11). Unlike RecordSheet below, it does draw its own
         pixels - a thumbnail row over ListCard - which is why it is a
         surface rather than "the other half of" one. */
      'PhotoSection.svelte',
      /* Not a surface either, and the only kit component that draws no
         pixels of its own: the three-state gate thirty-one screens used to
         hand-write over a journal read (phase 5 audit ticket 04). It picks
         a branch - placeholder, rows, empty state, or the words two screens
         have for a read that failed - and renders the screen's snippet for
         it. The rule it renders is readGate.ts, node-tested beside it. */
      'ReadGate.svelte',
      /* The other half of what a record-logging screen used to hand-write
         (phase 5 audit ticket 09): the editor sheet around ConfirmDeleteSheet
         above, with its new-or-edit title, its save-and-delete pair and the
         three walkthrough handles that go with them. Not a surface either -
         a screen passes its fields as a snippet and this owns no field of
         its own. */
      'RecordSheet.svelte',
      'SectionHeading.svelte',
      'Tile.svelte',
      'TileGrid.svelte'
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
    expect(kitAllCss).not.toMatch(/gradient\(/);
  });

  it('gives every interactive element a data-* handle (ADR-0029)', () => {
    for (const file of components) {
      const html = markup(file);
      const interactive = /<(a|button)\b/.test(html);
      if (!interactive) continue;
      /* Spelled out in the markup, or built from the screen's own record
         name by recordHandles.ts, which is where the vocabulary for a record
         sheet's three buttons lives (phase 5 audit ticket 09). Either way
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
    /* ADR-0012, and the style read off the reference: single-hue intensity
       with the leader at full strength and the rest one diluted step of the
       same colour. So the only colours a mark may name are the section's
       own ink, mood's own ramp, and the surface it is diluted into - never
       a second accent and never a literal.

       --role-draw is what a mark is drawn in now, and it is the stripe
       itself. Ticket 20's handoff had held a bar to 3:1 like a chart line,
       which on nonbinary's light theme is olive; DIRECTION.md's strongest
       instruction is that every colour drawn as the flag is the flag's own
       hex, and Alicja restated it for marks in capitals (2026-08-25). The
       3:1 version stays for a glyph inside a tinted disc of its own colour,
       where a white band would otherwise be nothing at all.

       --role-wash and --surface-2 are here for two pieces of chrome inside
       the marks' own selectors: the pressable bar row's press fill, and the
       scrub readout's pill. Neither introduces a hue - the wash is mixed
       from the same stripe as the bar above it, and the pill is one of the
       app's own two surfaces.

       --role-2 and --role-2-draw are the one place a second hue is allowed,
       and only on the area chart's second series (phase 6 ticket 12). Two
       metrics on one plot are two readings of equal standing, and a single
       hue cannot say which line is which. It is the same kind of colour as
       the first - another stripe of the same flag, resolved through roleAt()
       by the screen and undiluted here - so the card still wears the flag
       rather than a second palette. --accent-2 is its fallback for a card
       handed no role at all, which is what the app's other second line has
       always been drawn in. Colour is not the only separation either way:
       the second line is dashed. */
    /* The donut's five (phase 8 UX ticket 04) are geometry and dilution,
       not colour: --arc-dash, --arc-rest and --arc-offset are lengths
       along the ring's own path, --circ is the circumference the first
       two add up to, and --slice-weight is how much of --role-draw an arc
       keeps before the rest of it is the card. So the hue is still the
       section's stripe and nothing here can name a second one - which is
       what this rule is about. The ordered strip needed none: its width
       is --bar-share and its fill is --dist-fill, the same two the bars
       and the distribution already use. */
    const allowed =
      /^(--role-ink|--role-mark|--role-draw|--role-wash|--dist-fill|--surface|--surface-2|--outline|--hairline|--text|--text-2|--bar-share|--bar-index|--stagger-step|--face-mood|--face-size|--mood-\d|--slice-weight|--arc-dash|--arc-rest|--arc-offset|--circ)$/;
    /* The second hue, admitted for the area chart's second series and for
       nothing else. Read per rule rather than over the whole of markCss:
       allowing it globally would let the next bar set or distribution take a
       second colour without anything here noticing, which is the opposite of
       what a named exception is for. */
    const secondSeries = /^(--role-2|--role-2-draw|--accent-2)$/;
    /* The presentation chip's ring (phase 8 features ticket 17, ADR-0048) is
       a third hue, and the same reasoning applies: it names a presentation's
       own role rather than the chart's, resolved through roleAt() by the
       screen the same way the second series is, and it is the one place
       .kit-area-highlight itself is allowed to use it. */
    const isHighlightRule = /\.kit-area-highlight/;
    for (const rule of markCss.split('}')) {
      const prelude = rule.split('{')[0] ?? '';
      const isAreaChart = /\.kit-area/.test(prelude);
      for (const [, token] of rule.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (/^--(space|text|radius|r-card|dur|ease|font|weight|leading|display)/.test(token)) continue;
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

  /* The two legends the kit draws, named here rather than left to be found -
     the same way DIRECTION.md names the wear trend's, which is the app's
     other one and lives outside the kit.

     The rule refusing legends is about a single-series chart whose marks
     carry their own values: there, a legend names the one thing the heading
     already named. The area chart carrying a second metric is not that. Two
     ranges against one axis, no value gutter, and two unnamed lines are not
     a chart (phase 6 ticket 12).

     The donut is the second, and it is the argument this paragraph invited
     rather than an extension of it (phase 8 UX ticket 04). Every other mark
     in the kit can be labelled where it is drawn: a bar has a line above it,
     a column has a name under it, a dot sits on a named row. An arc has
     nowhere - there is no position on a segment where "estradiol, 34%" stays
     inside it at every share, and the alternative, names around the ring on
     leader lines, collides at phone width as soon as two small shares land
     next to each other. So the names sit beside the ring and a swatch joins
     each one to its segment. The cap is what keeps that honest: five arcs,
     because a legend longer than that has stopped being a key and become the
     chart, which is the state the horizontal bars were already in.

     What this still does not license is a third. A chart that wants one is
     arguing with both paragraphs. */
  it('draws a legend only for the area chart with a second metric and for the donut', () => {
    const legends = [...kitAllCss.matchAll(/\.kit-[a-z-]*legend[a-z-]*/g)].map(([sel]) => sel);
    expect(legends.length).toBeGreaterThan(0);
    for (const selector of legends) expect(selector).toMatch(/^\.kit-(area|donut)-legend/);
  });

  it('caps how many points a chart draws, whatever range it is given', async () => {
    const { MAX_POSITIONS, atGrain } = await import('../src/lib/charts/grain');
    const threeYears = Array.from({ length: 1095 }, (_, i) => ({ x: i, y: i % 5 }));
    expect(atGrain(threeYears, threeYears.length).points.length).toBeLessThanOrEqual(MAX_POSITIONS);
  });
});
