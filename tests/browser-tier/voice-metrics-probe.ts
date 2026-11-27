/* Mount the summary and all seven VoiceMetricSection entries with figure: null, as on an
   unread journal. The summary links to the reference sheet and the compare labels link to
   individual sections. Check every query metricHref emits names a mounted section ID. The
   isolated harness has no SvelteKit router to exercise the sheet's opening effect. Check
   pitch and spread explain distinct measurements without population ranges. */

import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/motion/press.css';
import { m } from '$lib/paraglide/messages';
import { epochDayFromDateInputValue } from '$lib/data/epochDay';
import { fmtDay } from '$lib/data/dates';
import { metricHref, VOICE_METRICS, VOICE_METRICS_REVIEWED_ON } from '$lib/data/voice/metrics';
import { roleAttrs } from '$lib/components/kit/role';
import { readFlagRoles, roleAt } from '$lib/theme/roles';
import VoiceFigures from '$lib/components/VoiceFigures.svelte';
import VoiceMetricSection from '$lib/components/VoiceMetricSection.svelte';
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

/** The takes behind it, so the blocks draw the history they are read
    against. Two earlier ones on the same chain, then
    this take, which is what the ring sits on. */
const CHAIN = 'Pixel|Microphone|ec=off ns=off agc=off';
const SERIES = [0, 1, 2].map((at) => ({
  epochDay: 20000 + at * 30,
  passageKey: 'builtin-en',
  captureChain: CHAIN,
  f0P10Hz: 120 + at * 4,
  f0P90Hz: 196 + at * 4,
  semitoneSd: 2.1 + at * 0.1,
  wordsPerMinute: 140 + at * 4,
  f1Hz: 600 + at * 10,
  f2Hz: 1160 + at * 10,
  snrDb: 22 + at,
  resonanceScale: 0.94 + at * 0.01
}));

try {
  /* The figure list wears the stripe of whichever area it sits in, so it
     is handed one here too: the underlines under its seven sentences are
     drawn in it, and a shot of this panel with no role would be reviewed
     in a colour the app never shows (theme/roles.ts reads the palette off
     the document, which this page sets). */
  mount(VoiceFigures, {
    target: document.querySelector('#figures')!,
    props: {
      figures: FIGURES,
      formants: { f1Hz: 620, f2Hz: 1180 },
      snrDb: 24,
      resonanceScale: 0.96,
      series: SERIES,
      role: roleAt(readFlagRoles(), 0)
    }
  });
  /* The seven sections a sheet opened from any of these links would
     render, each in the wrapping `<section id>` the real screen gives it
     (voice/+page.svelte). No benchmarks in this harness, so
     `figure` is null for all seven - the same fallback the real sheet
     falls back to before a journal has landed. */
  const reference = document.querySelector('#reference')!;
  VOICE_METRICS.forEach((metric, i) => {
    const section = document.createElement('section');
    section.id = metric.key;
    const attrs = roleAttrs(roleAt(readFlagRoles(), i));
    section.setAttribute('data-kit-role', attrs['data-kit-role']);
    if (attrs.style) section.setAttribute('style', attrs.style);
    reference.appendChild(section);
    mount(VoiceMetricSection, { target: section, props: { metric, figure: null } });
  });
  const reviewedEpochDay = epochDayFromDateInputValue(VOICE_METRICS_REVIEWED_ON);
  const reviewedOn =
    reviewedEpochDay === null
      ? VOICE_METRICS_REVIEWED_ON
      : fmtDay(reviewedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const reviewedNote = document.createElement('p');
  reviewedNote.setAttribute('data-metrics-reviewed', '');
  reviewedNote.textContent = m.roadmap_reviewed_on({ date: reviewedOn });
  reference.appendChild(reviewedNote);

  /** Every figure the list states, and the one link under it. */
  const figures = [...document.querySelectorAll('#figures [data-figure]')].map((row) => ({
    key: row.getAttribute('data-figure'),
    /* The figure itself, so a bare list is still asserted to be a list of
       figures rather than of empty rows. */
    stated: (row.querySelector('.vf-value, .vf-pitch-value')?.textContent ?? '').trim(),
    /* Whether this figure drew the history it is read against, and whether
       the ring landed on this take. */
    history: row.querySelectorAll('.vf-run').length,
    ring: row.querySelectorAll('.vf-ring').length,
    against: (row.querySelector('.vf-against')?.textContent ?? '').trim()
  }));

  const listLink = document.querySelector<HTMLAnchorElement>('#figures .vf-more a');

  /** Where each figure's own link names: the query key `metricHref` builds
      it from, checked against a real element with that id among the seven
      sections just mounted - the query-string era's version of the old
      fragment-and-`:target` check, now that the sheet itself needs a real
      router this harness does not run. */
  const landings = VOICE_METRICS.map((metric) => {
    const href = metricHref(metric.key);
    const named = new URL(href, location.href).searchParams.get('metric');
    return { key: metric.key, href, landsOn: document.getElementById(named ?? '')?.id ?? null };
  });

  const sections = [...document.querySelectorAll('#reference [data-metric]')].map((panel) => ({
    key: panel.getAttribute('data-metric'),
    tier: panel.getAttribute('data-metric-tier'),
    fields: panel.querySelectorAll('[data-metric-field]').length,
    populationBands: panel.querySelectorAll('[data-metric-bands], .vms-source').length,
    tierText: panel.querySelector('[data-metric-field="tier"] p')?.textContent?.trim() ?? '',
    typicalText: panel.querySelector('[data-metric-field="typical"] p')?.textContent?.trim() ?? ''
  }));

  publish(NAME, {
    registered: VOICE_METRICS.map((metric) => metric.key),
    figures,
    landings,
    listLink: listLink
      ? { href: listLink.getAttribute('href'), text: (listLink.textContent ?? '').trim() }
      : null,
    route: metricHref('pitch'),
    sections,
    reviewed: document.querySelector('[data-metrics-reviewed]')?.textContent?.trim() ?? ''
  });
} catch (error) {
  publish(NAME, { error: String(error) });
}
