/* The voice figure's two "exactly one" claims (phase 8 features ticket 09,
   ADR-0059), as rules over the tree rather than as sentences in a header.

   Both are the kind of thing that stays true until somebody adds a second
   one in good faith. The ticket asks for them by name: there is one live
   audio component, and one absolute axis. A copy of either drifts from the
   original the moment a threshold moves, and the screen then encourages a
   take the save rejects, or draws two figures that disagree about where
   165 Hz is.

   Greps, deliberately: the question is a negative over the whole tree and
   has no call form. Each rule is run over every component rather than over
   a written-out list, so a new file is covered the day it lands. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../src/', import.meta.url));

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (statSync(path).isDirectory()) return svelteFiles(`${path}/`);
    return name.endsWith('.svelte') ? [path] : [];
  });
}

const components = svelteFiles(root).map((path) => ({
  path: path.slice(root.length),
  source: readFileSync(path, 'utf8')
}));

/** A component's source with its prose taken out. The colour rule below is
    about what gets drawn, and both of these files explain the rule in a
    header comment that names the colours it forbids - which the rule read
    as a violation of itself on the first run. */
function drawn(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}

describe('the voice figure', () => {
  it('has been found at all, so a rename cannot make these rules vacuous', () => {
    expect(components.length).toBeGreaterThan(50);
    expect(components.map((c) => c.path)).toContain('lib/components/PitchFigure.svelte');
    expect(components.map((c) => c.path)).toContain('lib/components/PitchBandsCaption.svelte');
    expect(components.map((c) => c.path)).toContain('lib/components/VoiceGauge.svelte');
  });

  it('is drawn live by exactly one component', () => {
    /* What makes a component a live gauge is not that it holds a
       QualityReport - the flow and the practise tab both do, to pass one
       along - but that it turns the gate's readings into marks. Those two
       thresholds are that arithmetic, and a second file doing it is a
       second gauge whatever it is called. */
    const gauges = components
      .filter((c) => /PEAK_CEILING|MAX_F0_CV/.test(c.source))
      .map((c) => c.path);
    expect(gauges).toEqual(['lib/components/VoiceGauge.svelte']);
  });

  it('maps a frequency to a position in exactly one component', () => {
    const mappers = components.filter((c) => c.source.includes('axisFraction')).map((c) => c.path);
    expect(mappers).toEqual(['lib/components/PitchFigure.svelte']);
  });

  it('cannot draw a cited band without its source and its caveat', () => {
    /* ADR-0059 permits the reference bands only with their figures, their
       source and the averages sentence. The figure renders the caption
       itself, so the only way to leave it off is `captionShared` - and
       whoever passes that has to be rendering one for the pair. Two takes
       side by side are the case: one caption each is the same three
       paragraphs twice, in half the width. */
    const figure = components.find((c) => c.path === 'lib/components/PitchFigure.svelte')!.source;
    expect(figure).toContain('PitchBandsCaption');
    expect(figure).toMatch(/\{#if !compact && !captionShared\}/);

    for (const component of components) {
      const markup = drawn(component.source);
      if (!/captionShared(?!\?)/.test(markup)) continue;
      // A component that only forwards the flag on is not the one that owes
      // a caption; the one that turns it on is.
      if (/\{captionShared\}/.test(markup)) continue;
      // Against the markup rather than the whole file: a comment naming the
      // caption satisfied an earlier version of this check, which is how a
      // deliberately broken route passed it.
      expect(markup, `${component.path} silences the caption`).toContain('<PitchBandsCaption');
    }
  });

  it('never carries a verdict colour, on any of its marks', () => {
    /* ADR-0012, which ADR-0059 narrowed for the bands and not for this: one
       hue, the section's own flag stripe. A red, a green or a warning token
       anywhere in the figure is a judgement about a voice. */
    for (const path of ['lib/components/PitchFigure.svelte', 'lib/components/VoiceGauge.svelte']) {
      const source = drawn(components.find((c) => c.path === path)!.source);
      expect(source).not.toMatch(/--(danger|warning|success|positive|negative)/);
      expect(source).not.toMatch(/\b(red|green|orange|amber|crimson)\b/i);
    }
  });
});
