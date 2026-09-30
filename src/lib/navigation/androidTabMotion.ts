import type { OnNavigate } from '@sveltejs/kit';

import { blindSettle } from '$lib/motion/blindSettle';
import { EASE_OUT_CSS, motionDuration } from '$lib/motion/tokens';
import { dropOutgoingScreens } from '$lib/motion/outgoingScreen';
import { restoreScroll } from './scroll-region';
import { ui } from '$lib/stores/ui.svelte';
import { beginTabArrival, endTabArrival, playAfterPaint } from '$lib/motion/screenArrival';

const FIELD = '[data-screen-field], [data-home-field]';
const SCREEN = '[data-app-scroll-region] .screen';
let finishCurrent = () => {};

export function finishAndroidTab(): void {
  finishCurrent();
}

function bodyOf(screen: HTMLElement, field: HTMLElement | null): HTMLElement[] {
  return [...screen.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(field)
  );
}

function animateIn(fromHeight: number, toPath: string): Promise<void> | void {
  dropOutgoingScreens();
  restoreScroll(toPath);

  const field = document.querySelector<HTMLElement>(FIELD);
  const screen = field?.closest<HTMLElement>('.screen') ?? document.querySelector<HTMLElement>(SCREEN);
  if (!screen) return;

  const animations: Animation[] = [];
  function animate(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = element.animate(frames, options);
    animations.push(animation);
    return animation;
  }

  const duration = motionDuration('--dur-slow');
  beginTabArrival();
  const toHeight = field?.getBoundingClientRect().height ?? 0;
  const delta = fromHeight - toHeight;
  const fade = motionDuration('--dur-med');
  for (const child of bodyOf(screen, field ?? null)) {
    animate(child,
      [{ opacity: 0.35, translate: `0 ${delta}px` }, { opacity: 1, translate: '0 0' }],
      { duration: fade, easing: EASE_OUT_CSS }
    );
  }

  if (!field || !field.querySelector('[data-field-blind]')) {
    playAfterPaint(screen, animations);
    return;
  }

  const settle = blindSettle({ from: fromHeight, to: toHeight });
  const height = Math.max(fromHeight, toHeight) + settle.overshoot;
  field.style.setProperty('--tab-bridge-height', `${height}px`);
  field.classList.add('is-tab-bridging');

  const easing = settle.easing.startsWith('linear(')
    ? settle.easing
    : getComputedStyle(document.documentElement).getPropertyValue(
        settle.easing.includes('soft') ? '--ease-out-soft' : '--ease-out'
      ).trim();
  const edge = animate(field,
    [{ translate: `0 ${delta}px` }, { translate: '0 0' }],
    { duration, easing }
  );

  for (const part of field.querySelectorAll<HTMLElement>('[data-field-part]')) {
    animate(part, [{ opacity: 0 }, { opacity: 1 }], {
      duration: motionDuration('--dur-fast'),
      delay: motionDuration('--dur-fast'),
      fill: 'backwards'
    });
  }
  field.querySelectorAll<HTMLElement>('[data-flag-sun] > i').forEach((ring, index) => {
    animate(ring, [{ scale: 0 }, { scale: 1 }], {
      duration: motionDuration('--dur-sun-open'),
      delay: index * 30,
      easing: EASE_OUT_CSS,
      fill: 'backwards'
    });
  });
  playAfterPaint(screen, animations);

  return edge.finished.then(() => {}, () => {}).finally(() => {
    field.classList.remove('is-tab-bridging');
    field.style.removeProperty('--tab-bridge-height');
  });
}

export function animateAndroidTab(navigation: OnNavigate): Promise<void> {
  finishCurrent();
  ui.tabMoving = true;
  const finish = () => {
    if (finishCurrent === finish) {
      endTabArrival();
      ui.tabMoving = false;
      finishCurrent = () => {};
    }
  };
  finishCurrent = finish;
  const fromField = document.querySelector<HTMLElement>(FIELD);
  const fromHeight = fromField
    ? fromField.getBoundingClientRect().height + parseFloat(getComputedStyle(fromField).translate.split(' ')[1] ?? '0')
    : 0;
  return new Promise((resolve) => {
    resolve();
    void navigation.complete.then(() => {
      if (finishCurrent === finish && navigation.to) return animateIn(fromHeight, navigation.to.url.pathname);
    }).then(finish, finish);
  });
}
