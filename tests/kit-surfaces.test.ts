/* The rules the surface kit and the chart kit have to keep (phase 5 ticket
   20), at the level a stylesheet and a component's source can be held to.

   Most of what makes these surfaces right is a judgement about proportion
   that only an eye settles, and tests/kit-gallery.mjs is where that happens.
   What is left over is mechanical, and all of it is something the craft
   floor or DIRECTION.md names outright - which means it is exactly the kind
   of thing that creeps back in one screen ticket at a time unless something
   is watching. */

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

/** The chart kit's own section of the stylesheet. */
const chartCss = kitNoComments.slice(kitNoComments.indexOf('.kit-chart {'));

describe('the surfaces', () => {
  it('has one component per surface and per chart kind', () => {
    expect(components.sort()).toEqual([
      'AreaChart.svelte',
      'BarRows.svelte',
      'BareStrip.svelte',
      'ChartCard.svelte',
      'DayCard.svelte',
      'Distribution.svelte',
      'ListCard.svelte',
      'ListRow.svelte',
      'MoodChips.svelte',
      'Notice.svelte',
      'SectionHeading.svelte',
      'Tile.svelte',
      'TileGrid.svelte'
    ]);
  });

  it('separates with a line and never with a shadow', () => {
    // DIRECTION.md decision 2: two surfaces, not a stack of planes. The
    // app's one shadow belongs to the floating nav bar and its add button,
    // which are the shell's, not the kit's.
    expect(kitNoComments).not.toMatch(/box-shadow/);
  });

  it('has no coloured bar down the side of anything', () => {
    // The craft floor names a coloured border-left above 1px as the single
    // most recognisable AI-UI tell there is, and the slop audit took one
    // off the notice this kit replaces.
    const sided = [...kitNoComments.matchAll(/border-(left|right):\s*([^;]+);/g)];
    for (const [, side, value] of sided) {
      expect(value, `border-${side}`).toMatch(/^\s*1px|^\s*0/);
    }
  });

  it('paints flat colour, never a gradient', () => {
    expect(kitNoComments).not.toMatch(/gradient\(/);
  });

  it('gives every interactive element a data-* handle (ADR-0029)', () => {
    for (const file of components) {
      const html = markup(file);
      const interactive = /<(a|button)\b/.test(html);
      if (!interactive) continue;
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
       a second accent and never a literal. */
    const allowed = /^(--role-ink|--dist-fill|--surface|--outline|--text-2?|--bar-share|--mood-\d)$/;
    for (const [, token] of chartCss.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (/^--(space|text|radius|r-card|dur|ease|font|weight|leading|display)/.test(token)) continue;
      expect(token, `${token} in the chart rules`).toMatch(allowed);
    }
    // And no raw colour anywhere in them.
    expect(chartCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(chartCss).not.toMatch(/\b(rgb|hsl)a?\(/);
  });

  it('draws no gridline, no legend and no axis', () => {
    for (const furniture of ['gridline', 'legend', 'axis', 'tick']) {
      expect(kitNoComments, furniture).not.toMatch(new RegExp(`\\.kit-[a-z-]*${furniture}`));
    }
  });

  it('caps how many points a chart draws, whatever range it is given', async () => {
    const { MAX_SAMPLES, resample } = await import('../src/lib/charts/geometry');
    const year = Array.from({ length: 365 }, (_, i) => ({ x: i, y: i % 5 }));
    expect(resample(year).length).toBe(MAX_SAMPLES);
  });
});
