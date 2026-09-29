import type { OnNavigate } from '@sveltejs/kit';

import { blindSettle } from '$lib/motion/blindSettle';
import { EASE_OUT_CSS, motionDuration } from '$lib/motion/tokens';
import { dropOutgoingScreens } from '$lib/motion/outgoingScreen';
import { restoreScroll } from './scroll-region';

const FIELD = '[data-screen-field], [data-home-field]';
const SCREEN = '[data-app-scroll-region] .screen';

function bodyOf(screen: HTMLElement, field: HTMLElement | null): HTMLElement[] {
  return [...screen.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(field)
  );
}

function animateIn(fromHeight: number, toPath: string): void {
  dropOutgoingScreens();
  restoreScroll(toPath);

  const field = document.querySelector<HTMLElement>(FIELD);
  const screen = field?.closest<HTMLElement>('.screen') ?? document.querySelector<HTMLElement>(SCREEN);
  if (!screen) return;

  const duration = motionDuration('--dur-slow');
  const toHeight = field?.getBoundingClientRect().height ?? 0;
  const delta = fromHeight - toHeight;
  const fade = motionDuration('--dur-med');
  for (const child of bodyOf(screen, field ?? null)) {
    child.animate(
      [{ opacity: 0.35, translate: `0 ${delta}px` }, { opacity: 1, translate: '0 0' }],
      { duration: fade, easing: EASE_OUT_CSS }
    );
  }

  if (!field) return;
  const blind = field.querySelector<HTMLElement>('[data-field-blind]');
  if (!blind) return;

  const settle = blindSettle({ from: fromHeight, to: toHeight });
  const height = Math.max(fromHeight, toHeight) + settle.overshoot;
  const shell = document.createElement('div');
  shell.className = 'tab-field-bridge';
  shell.style.height = `${height}px`;
  const face = document.createElement('div');
  face.className = 'tab-field-bridge-face';
  face.style.height = `${height}px`;
  shell.append(face);
  field.prepend(shell);
  field.classList.add('is-tab-bridging');

  const easing = settle.easing.startsWith('linear(')
    ? settle.easing
    : getComputedStyle(document.documentElement).getPropertyValue(
        settle.easing.includes('soft') ? '--ease-out-soft' : '--ease-out'
      ).trim();
  const edge = face.animate(
    [
      { transform: `translateY(${fromHeight - height}px)` },
      { transform: `translateY(${toHeight - height}px)` }
    ],
    { duration, easing, fill: 'forwards' }
  );

  for (const part of field.querySelectorAll<HTMLElement>('[data-field-part]')) {
    part.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: motionDuration('--dur-fast'),
      delay: motionDuration('--dur-fast'),
      fill: 'backwards'
    });
  }
  field.querySelectorAll<HTMLElement>('[data-flag-sun] > i').forEach((ring, index) => {
    ring.animate([{ scale: 0 }, { scale: 1 }], {
      duration: motionDuration('--dur-sun-open'),
      delay: index * 30,
      easing: EASE_OUT_CSS,
      fill: 'backwards'
    });
  });

  void edge.finished.catch(() => {}).finally(() => {
    field.classList.remove('is-tab-bridging');
    shell.remove();
  });
}

export function animateAndroidTab(navigation: OnNavigate): Promise<void> {
  const fromField = document.querySelector<HTMLElement>(FIELD);
  const fromHeight = fromField?.getBoundingClientRect().height ?? 0;
  return new Promise((resolve) => {
    resolve();
    void navigation.complete.then(() => {
      if (navigation.to) animateIn(fromHeight, navigation.to.url.pathname);
    }).catch(() => {});
  });
}
