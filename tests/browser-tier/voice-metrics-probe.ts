/* Browser-tier check for the metric reference (phase 8 features ticket 27,
   ADR-0060), the half no Node test can reach.

   What is only provable here: that the link under a figure lands on that
   figure's own section. The Node tier can compare two strings and say the
   href matches the key; only a browser resolves a fragment against a
   rendered document, and the failure this guards is a link into a section
   that does not exist - six sentences that go nowhere, which is worse than
   the bare numbers the ticket set out to fix.

   Both surfaces mount for real: the summary's figure list over a fixed set
   of figures, and the reference screen itself, which is a route component
   with no journal behind it (its whole content is compiled in). The
   fragment is then set on the real location and read back through
   `:target`, so what is asserted is the browser's own answer to "where
   does this link go".

   The second claim is that a Referenced section and an Own-series section
   read differently: pitch carries published ranges with a citation under
   them, spread carries a sentence saying no dependable range exists, and
   the two tier lines are not the same sentence. A screen that draws a band
   on one figure and nothing on five without ever saying why is the thing
   this ticket exists to stop, so "they read differently" is the assertion
   rather than "they both rendered". */

import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/motion/press.css';
import { VOICE_METRICS } from '$lib/data/voice/metrics';
import { readFlagRoles, roleAt } from '$lib/theme/roles';
import VoiceFigures from '$lib/components/VoiceFigures.svelte';
import MetricReference from '../../src/routes/settings/voice/metrics/+page.svelte';
import { publish } from '../probe-handshake.mjs';

const NAME = 'voice-metrics-probe';

/** A take's figures, made up here rather than measured: what is under test
    is what the list says about a figure, not the figure. */
const FIGURES = {
  f0MedianHz: 165,
  f0P10Hz: 128,
  f0P90Hz: 204,
  semitoneSd: 2.4,
  wordsPerMinute: 148
};

try {
  /* The figure list wears the stripe of whichever area it sits in, so it
     is handed one here too: the underlines under its six sentences are
     drawn in it, and a shot of this panel with no role would be reviewed
     in a colour the app never shows (theme/roles.ts reads the palette off
     the document, which this page sets). */
  mount(VoiceFigures, {
    target: document.querySelector('#figures')!,
    props: {
      figures: FIGURES,
      formants: { f1Hz: 620, f2Hz: 1180 },
      snrDb: 24,
      role: roleAt(readFlagRoles(), 0)
    }
  });
  mount(MetricReference, { target: document.querySelector('#reference')! });

  /** Every figure in the list, with the link under it and where that link
      lands once the browser has resolved the fragment. */
  const figures = [...document.querySelectorAll('#figures [data-figure]')].map((row) => {
    const key = row.getAttribute('data-figure');
    const link = row.querySelector<HTMLAnchorElement>('a');
    let landsOn: string | null = null;
    if (link) {
      // The browser's own answer, not a string comparison: the fragment is
      // set on the real location and `:target` is whatever it matched.
      location.hash = new URL(link.href).hash;
      landsOn = document.querySelector(':target')?.id ?? null;
    }
    return {
      key,
      href: link?.getAttribute('href') ?? null,
      sentence: (link?.textContent ?? '').trim(),
      landsOn
    };
  });

  const sections = [...document.querySelectorAll('#reference [data-metric]')].map((panel) => ({
    key: panel.getAttribute('data-metric'),
    tier: panel.getAttribute('data-metric-tier'),
    fields: panel.querySelectorAll('[data-metric-field]').length,
    /* One per language the citation covers, which is the rule ADR-0060
       exists for: a figure with no sourced range for a language draws
       nothing rather than the English one. */
    bandedLanguages: [...panel.querySelectorAll('[data-metric-bands]')].map((band) =>
      band.getAttribute('data-metric-bands')
    ),
    citations: panel.querySelectorAll('[data-metric-bands] .vms-source').length,
    tierText: panel.querySelector('[data-metric-field="tier"] p')?.textContent?.trim() ?? '',
    typicalText: panel.querySelector('[data-metric-field="typical"] p')?.textContent?.trim() ?? ''
  }));

  publish(NAME, {
    registered: VOICE_METRICS.map((metric) => metric.key),
    figures,
    sections,
    reviewed: document.querySelector('[data-metrics-reviewed]')?.textContent?.trim() ?? ''
  });
} catch (error) {
  publish(NAME, { error: String(error) });
}
