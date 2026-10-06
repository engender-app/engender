import { flushSync } from 'svelte';
import { mountInto } from './mount';
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, node, style, type Result } from './screen-contracts/fixture';
import KitGallery from './kit-gallery.svelte';
import ControlsGallery from './controls-gallery.svelte';
import TileBlockGallery from './tile-block-gallery.svelte';
import DirectionSamples from './screen-contracts/DirectionSamples.svelte';

function resolved(root: HTMLElement, value: string, property = 'color') {
  const sample = document.createElement('span');
  sample.style.setProperty(property, value);
  (root instanceof HTMLInputElement ? root.parentElement! : root).append(sample);
  const answer = getComputedStyle(sample).getPropertyValue(property);
  sample.remove();
  return answer;
}

export async function directionContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const target = document.createElement('div');
  target.style.cssText = 'width:390px;container:app / inline-size';
  document.querySelector('#screens')!.replaceChildren(target);
  const kit = mountInto(KitGallery, {}, target);
  flushSync();
  await until(() => target.querySelector('.kit-tile'), 'kit gallery');
  const css = (selector: string, pseudo?: string) => style(target, selector, pseudo);
  const token = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  for (const [name, expected] of Object.entries({
    '--r-block': '6px',
    '--radius-pill': '999px',
    '--text-4xl': '3rem',
    '--text-3xl': '2.5rem',
    '--text-2xl': '1.75rem',
    '--text-lg': '1.0625rem',
    '--text-sm': '0.9375rem',
    '--weight-display': '800',
    '--display-track': '-0.04em',
    '--space-3': '12px',
    '--space-5': '20px',
    '--space-8': '40px'
  }))
    await check(`Rendered token ${name} retains ${expected}`, () => token(name) === expected);
  await check('Retired radius, line and elevation tokens no longer resolve', () =>
    [
      '--radius-xs',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--r-card',
      '--r-add',
      '--border',
      '--outline-strong',
      '--shadow-1',
      '--shadow-2',
      '--shadow-3'
    ].every((name) => !token(name))
  );
  await check('Legibility boost strengthens both remaining line tokens', () => {
    const outline = resolved(target, 'var(--outline)');
    const hairline = resolved(target, 'var(--hairline)');
    document.documentElement.dataset.a11yLegibility = 'boost';
    const stronger =
      outline !== resolved(target, 'var(--outline)') &&
      hairline !== resolved(target, 'var(--hairline)');
    delete document.documentElement.dataset.a11yLegibility;
    return stronger;
  });
  await check('Kit surfaces cast no elevation shadow', () =>
    ['.kit-list', '.kit-notice', '.kit-moods', '.kit-tile', '.kit-chart', '.kit-day'].every(
      (selector) => css(selector).boxShadow === 'none'
    )
  );
  await check('Kit corners resolve to blocks, discs, chart ends or mood geometry', () => {
    const allowed = new Set([
      '0px',
      '1px',
      '2px',
      '4px',
      '6px',
      '8px',
      '50%',
      '100%',
      '26.7%',
      '53.4%'
    ]);
    return [...target.querySelectorAll('*')].every((element) => {
      if (element.closest('.gallery-controls')) return true;
      const s = getComputedStyle(element);
      return [
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius'
      ].every(
        (prop) =>
          allowed.has(s[prop as keyof CSSStyleDeclaration] as string) ||
          (s[prop as keyof CSSStyleDeclaration] === '999px' &&
            element.matches('.kit-pill,.tag-chip,.photo-year'))
      );
    });
  });
  await check('Lists, notices and mood rows stay flush between hairlines', () =>
    ['.kit-list', '.kit-notice', '.kit-moods'].every((selector) => {
      const s = css(selector);
      return (
        s.borderTopWidth === '1px' &&
        s.borderBottomWidth === '1px' &&
        s.borderTopColor === resolved(node(target, selector), 'var(--hairline)') &&
        s.borderRadius === '0px'
      );
    })
  );
  await check('Chart and day surfaces stay unboxed', () =>
    ['.kit-chart', '.kit-day'].every(
      (selector) =>
        css(selector).borderRadius === '0px' && css(selector).backgroundColor === 'rgba(0, 0, 0, 0)'
    )
  );
  await check(
    'Section heading keeps 40 above, 12 below and three-pixel ink rule',
    () =>
      css('.kit-heading:not(:first-child)').marginTop === '40px' &&
      css('.kit-heading').marginBottom === '12px' &&
      css('.kit-heading').borderTopWidth === '3px' &&
      css('.kit-heading').paddingTop === '12px'
  );
  await check(
    'Section heading uses 28px display type with 800 weight',
    () =>
      css('.kit-heading h2').fontSize === '28px' &&
      css('.kit-heading h2').fontWeight === '800' &&
      Math.abs(parseFloat(css('.kit-heading h2').lineHeight) - 29.4) < 0.1
  );
  await check(
    'Content title uses 17px body type',
    () =>
      css('.kit-chart-head h3').fontSize === '17px' &&
      css('.kit-chart-head h3').fontFamily === resolved(target, 'var(--font-body)', 'font-family')
  );
  await check('Secondary text keeps 15px and 600 weight', () =>
    ['.kit-row-sub', '.kit-tile-note', '.kit-notice-text'].every(
      (selector) => css(selector).fontSize === '15px' && css(selector).fontWeight === '600'
    )
  );
  await check('Display type stays within door title size', () =>
    [...target.querySelectorAll('*')].every(
      (element) => parseFloat(getComputedStyle(element).fontSize) <= 48
    )
  );
  await check('Row icon is 36px stripe block with proven ink and flush row', () => {
    const icon = node(target, '.kit-row-ico');
    const s = getComputedStyle(icon);
    return (
      s.width === '36px' &&
      s.borderRadius === '6px' &&
      s.backgroundColor === resolved(icon, 'var(--role-draw)') &&
      s.color === resolved(icon, 'var(--role-fill-ink)') &&
      css('.kit-row').paddingLeft === '0px' &&
      css('.kit-row').paddingRight === '0px'
    );
  });
  await check('Day date bar uses page-on-ink with no edge', () => {
    const bar = node(target, '.kit-day-bar');
    const s = getComputedStyle(bar);
    return (
      s.backgroundColor === resolved(bar, 'var(--text)') &&
      s.color === resolved(bar, 'var(--bg)') &&
      s.borderTopWidth === '0px'
    );
  });
  await check('Notice mark is 40px ink square with six-pixel corners', () => {
    const mark = node(target, '.kit-notice-ico');
    const s = getComputedStyle(mark);
    return (
      s.width === '40px' &&
      s.borderRadius === '6px' &&
      s.backgroundColor === resolved(mark, 'var(--text)') &&
      s.color === resolved(mark, 'var(--bg)')
    );
  });
  await check('Tiles use undiluted stripe, one outline and six-pixel corners', () =>
    [...target.querySelectorAll<HTMLElement>('.kit-tile')].every((tile) => {
      const s = getComputedStyle(tile);
      return (
        s.backgroundColor === resolved(tile, 'var(--role-draw)') &&
        s.borderTopWidth === '1px' &&
        s.borderTopColor === resolved(tile, 'var(--outline)') &&
        s.borderRadius === '6px'
      );
    })
  );
  await check('Tile title and value use proven fill ink at large sizes', () =>
    ['.kit-tile-title', '.kit-tile-value'].every((selector) => {
      const n = node(target, selector);
      const s = getComputedStyle(n);
      return s.color === resolved(n, 'var(--role-fill-ink)') && parseFloat(s.fontSize) >= 18.66;
    })
  );
  await check('Tile note sits on page ground with secondary ink', () => {
    const n = node(target, '.kit-tile-note');
    return (
      css('.kit-tile-note').backgroundColor === resolved(n, 'var(--bg)') &&
      css('.kit-tile-note').color === resolved(n, 'var(--text-2)')
    );
  });
  await check('Tile foot reaches both edges and clamps inner text at two lines', () => {
    const tile = node(target, '.kit-tile').getBoundingClientRect();
    const foot = node(target, '.kit-tile-note').getBoundingClientRect();
    return (
      Math.abs(foot.left - tile.left - 1) < 1 &&
      Math.abs(foot.right - tile.right + 1) < 1 &&
      css('.kit-tile-note-text').webkitLineClamp === '2'
    );
  });
  await check(
    'Series draws two-pixel square caps and miter joins',
    () =>
      css('.kit-area-line').strokeWidth === '2px' &&
      css('.kit-area-line').strokeLinecap === 'square' &&
      css('.kit-area-line').strokeLinejoin === 'miter'
  );
  await check('Kit chart strokes use one, two or twelve pixels', () => {
    const strokes = [...target.querySelectorAll('svg *')].filter(
      (n) => getComputedStyle(n).stroke !== 'none'
    );
    return (
      strokes.length > 5 &&
      strokes.every(
        (n) =>
          [1, 2, 12].includes(parseFloat(getComputedStyle(n).strokeWidth)) ||
          n.closest('.mood-face,.icon')
      )
    );
  });
  await check(
    'Bar is 14px with two-pixel ends',
    () =>
      css('.kit-bar-track').height === '14px' &&
      css('.kit-bar-mark').height === '14px' &&
      css('.kit-bar-mark').borderRadius === '2px'
  );
  await check(
    'Chart picker face keeps six-pixel box and two-pixel edge',
    () =>
      css('.kit-chart-pick-face').height === '28px' &&
      css('.kit-chart-pick-face').borderRadius === '6px' &&
      css('.kit-chart-pick-face').borderTopWidth === '2px'
  );
  await kit.remove();
  const tiles = mountInto(TileBlockGallery, {}, target);
  flushSync();
  await until(() => target.querySelector('[data-shape="both"]'), 'tile shape gallery');
  await check('Plain, action, dismiss, combined and row tiles keep stripe and outline', () =>
    ['plain', 'action', 'dismiss', 'both', 'row'].every((shape) => {
      const n = node(target, `[data-shape="${shape}"] .kit-tile`);
      const s = getComputedStyle(n);
      return (
        s.borderTopWidth === '1px' &&
        s.borderRadius === '6px' &&
        s.backgroundColor === resolved(n, 'var(--role-draw)')
      );
    })
  );
  await check(
    'Value-free tile gets one display title at forty pixels',
    () => css('[data-shape="dismiss"] .kit-tile-title').fontSize === '40px'
  );
  await check(
    'Row tile value uses twenty-eight pixels',
    () => css('[data-shape="row"] .kit-tile-value').fontSize === '28px'
  );
  await check(
    'Tight tile keeps note on stripe without page foot',
    () =>
      css('[data-tight] .kit-tile-note').backgroundColor === 'rgba(0, 0, 0, 0)' &&
      css('[data-tight] .kit-tile-note').fontSize === '19px' &&
      css('[data-tight] .kit-tile-note').marginLeft === '0px'
  );
  await check(
    'Tight tile draws flag band with two-pixel ends',
    () =>
      css('[data-tight] .kit-tile-value', '::after').borderRadius === '2px' &&
      css('[data-tight] .kit-tile-value', '::after').backgroundColor !== 'rgba(0, 0, 0, 0)'
  );
  await check('Tile action uses page ground and page ink; dismiss uses fill ink', () => {
    const action = node(target, '[data-shape="both"] .kit-tile-act');
    const dismiss = node(target, '[data-shape="both"] .kit-tile-dismiss');
    return (
      getComputedStyle(action).backgroundColor === resolved(action, 'var(--bg)') &&
      getComputedStyle(action).color === resolved(action, 'var(--text)') &&
      getComputedStyle(dismiss).color === resolved(dismiss, 'var(--role-fill-ink)')
    );
  });
  await tiles.remove();
  const samples = mountInto(DirectionSamples, {}, target);
  flushSync();
  await until(() => target.querySelector('.cn-trail line'), 'constellation trail');
  await check('Constellation trail and curve marker draw one-pixel secondary ink', () =>
    ['.cn-trail line', '.curve-marker'].every((selector) => {
      const n = node(target, selector);
      return (
        css(selector).strokeWidth === '1px' && css(selector).stroke === resolved(n, 'var(--text-2)')
      );
    })
  );
  await check(
    'Breathing exercise renders without old card container',
    () => !target.querySelector('.card,.breathing-card')
  );
  await check('Skeleton and wrapped surfaces retain outline edges', () =>
    ['.skeleton-card', '.wrapped-card', '.wrapped-stat'].every((selector) => {
      const n = node(target, selector);
      return (
        css(selector).borderTopWidth === '1px' &&
        css(selector).borderTopColor === resolved(n, 'var(--outline)')
      );
    })
  );
  await samples.remove();
  const controls = mountInto(ControlsGallery, {}, target);
  flushSync();
  await until(() => target.querySelector('.segmented'), 'controls gallery');
  await check(
    'Segmented track keeps eight-pixel corners and ink pill six',
    () =>
      css('.segmented').borderRadius === '8px' &&
      css('.segment-pill').borderRadius === '6px' &&
      css('.segment-pill').backgroundColor ===
        resolved(node(target, '.segment-pill'), 'var(--text)')
  );
  await check('Button variants use ink or transparent page grounds', () =>
    ['.btn-primary', '.btn-soft', '.btn-ghost', '.btn-danger'].every((selector) => {
      const n = node(target, selector);
      const s = getComputedStyle(n);
      return ['rgba(0, 0, 0, 0)', resolved(n, 'var(--text)')].includes(s.backgroundColor);
    })
  );
  await check('Secondary and destructive buttons retain outlined page blocks', () =>
    ['.btn-soft', '.btn-danger'].every(
      (selector) =>
        css(selector).borderTopWidth === '1px' &&
        css(selector).backgroundColor === 'rgba(0, 0, 0, 0)'
    )
  );
  await controls.remove();
  const f = await fixture('direction', 6);
  let screen = await mountScreen('/', f);
  await until(() => screen.target.querySelector('[data-home-count]'), 'Home count');
  await check('Home count and greeting remain off field with gear', () => {
    const foot = node(screen.target, '[data-home-foot]');
    return (
      foot.querySelector('[data-home-count]') &&
      foot.querySelector('[data-home-hello]') &&
      foot.querySelector('[data-home-gear]') &&
      !node(screen.target, '[data-home-field]').querySelector('[data-home-count]')
    );
  });
  await check('Home field paints shell field with proven field ink', () => {
    const field = node(screen.target, '[data-home-field]');
    return (
      getComputedStyle(field).color === resolved(field, 'var(--field-ink)') &&
      screen.target.querySelector('[data-field-blind]')
    );
  });
  await check('Sun bands touch through three-pixel black seams', () =>
    [...screen.target.querySelectorAll('[data-flag-sun] i')].every(
      (n) =>
        getComputedStyle(n).borderTopWidth === '3px' &&
        getComputedStyle(n).borderTopColor === 'rgb(0, 0, 0)' &&
        getComputedStyle(n).boxSizing === 'border-box'
    )
  );
  for (const [width, scale] of [
    [350, '0.82'],
    [230, '0.6']
  ] as const)
    await check(`Sun scales to ${scale} at ${width}px container`, async () => {
      screen.target.style.width = `${width}px`;
      await until(
        () => Math.abs(screen.target.getBoundingClientRect().width - width) < 1,
        'resized Home container'
      );
      return (
        style(screen.target, '[data-home-field]').getPropertyValue('--sun-scale').trim() === scale
      );
    });
  await screen.remove();
  screen = await mountScreen('/settings', f);
  await until(() => screen.target.querySelector('[data-screen-title]'), 'Settings screen');
  await check(
    'Settings mounts seeded journal and keeps sixteen palette choices',
    () => screen.target.querySelectorAll('[data-palette-pick]').length === 16
  );
  await check('Screen title uses 48px display size, 800 weight and 0.95 line height', () => {
    const s = style(screen.target, '[data-screen-title]');
    return (
      s.fontSize === '48px' &&
      s.fontWeight === '800' &&
      Math.abs(parseFloat(s.lineHeight) - 45.6) < 0.1
    );
  });
  await check('Screen field holds title and back and keeps subtitle outside', () => {
    const field = node(screen.target, '[data-screen-field]');
    return (
      field.querySelector('[data-screen-title]') &&
      field.querySelector('[data-screen-back]') &&
      !field.querySelector('[data-screen-subtitle]')
    );
  });
  await check('Chrome back remains on phone and disappears at desktop container', async () => {
    const back = node(screen.target, '[data-screen-back]');
    const shown = getComputedStyle(back).display !== 'none';
    screen.target.style.width = '1100px';
    await until(
      () => Math.abs(screen.target.getBoundingClientRect().width - 1100) < 1,
      'desktop Settings container'
    );
    return shown && getComputedStyle(back).display === 'none';
  });
  await check('Desktop field banner has six-pixel corners and no full inset bleed', async () => {
    await until(
      () => style(screen.target, '[data-screen-field]').borderTopLeftRadius === '6px',
      'desktop field corners'
    );
    return node(screen.target, '[data-screen-field]').getBoundingClientRect().top >= 0;
  });
  await screen.remove();
  screen = await mountScreen('/more', f);
  await until(() => screen.target.querySelector('.search-input'), 'More search');
  await check('Transition search sits in field on page ground with page ink', () => {
    const input = node(screen.target, '.search-input');
    const box = node(screen.target, '.search-box');
    return (
      input.closest('[data-screen-field]') &&
      getComputedStyle(box).backgroundColor === resolved(box, 'var(--bg)') &&
      getComputedStyle(input).color === resolved(input, 'var(--text)')
    );
  });
  await screen.remove();
  return results;
}

export async function directionNarrowContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const target = document.createElement('div');
  document.querySelector('#screens')!.replaceChildren(target);
  const kit = mountInto(KitGallery, {}, target);
  flushSync();
  await check(
    'Below 240px viewport notice drops mark and keeps text column',
    () =>
      innerWidth <= 240 &&
      style(target, '.kit-notice-ico').display === 'none' &&
      style(target, '.kit-notice').gridTemplateColumns.split(' ').length === 2
  );
  await kit.remove();
  const controls = mountInto(DirectionSamples, {}, target);
  flushSync();
  await check('Below 240px viewport compact segments become scrollable', async () => {
    const display = style(target, '.segmented.is-compact').display;
    if (!['flex', 'inline-flex'].includes(display))
      throw new Error(`compact segment display: ${display}`);
    const shrink = style(target, '.segmented.is-compact .segment').flexShrink;
    if (shrink !== '0') throw new Error(`compact segment flex-shrink: ${shrink}`);
    return true;
  });
  await controls.remove();
  return results;
}
