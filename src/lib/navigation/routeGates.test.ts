import { describe, expect, it } from 'vitest';

import { routeGate, type RouteGateFacts } from './routeGates';

/* A returning, unlocked, onboarded journal on some screen other than Home:
   the state in which no gate has anything to say. */
const facts = (over: Partial<RouteGateFacts> = {}): RouteGateFacts => ({
  path: '/calendar',
  firstRunSetup: false,
  owesAccessMode: false,
  ready: true,
  locked: false,
  onboarded: true,
  ...over
});

describe('route gates', () => {
  it('says nothing on an ordinary screen of an open journal', () => {
    expect(routeGate(facts())).toBeNull();
  });

  it('sends a brand new install to onboarding before any database exists', () => {
    expect(routeGate(facts({ firstRunSetup: true, ready: false, onboarded: false, path: '/' }))).toBe(
      'onboarding'
    );
  });

  it('leaves a brand new install alone once it is on onboarding', () => {
    expect(
      routeGate(facts({ firstRunSetup: true, ready: false, onboarded: false, path: '/onboarding' }))
    ).toBeNull();
  });

  it('closes quick add while a recovery unlock owes an access mode', () => {
    expect(routeGate(facts({ owesAccessMode: true }))).toBe('close-chooser');
  });

  it('asks for the access mode ahead of the return moment, which waits for it', () => {
    expect(routeGate(facts({ owesAccessMode: true, path: '/' }))).toBe('close-chooser');
  });

  it('holds the returning-user gates until the journal is open', () => {
    expect(routeGate(facts({ ready: false, onboarded: false }))).toBeNull();
    expect(routeGate(facts({ ready: false, path: '/' }))).toBeNull();
  });

  it('holds the returning-user gates while the app is locked', () => {
    expect(routeGate(facts({ locked: true, onboarded: false }))).toBeNull();
    expect(routeGate(facts({ locked: true, path: '/' }))).toBeNull();
  });

  it('sends an open journal that never finished onboarding back to it', () => {
    expect(routeGate(facts({ onboarded: false }))).toBe('onboarding');
    expect(routeGate(facts({ onboarded: false, path: '/' }))).toBe('onboarding');
    expect(routeGate(facts({ onboarded: false, path: '/onboarding' }))).toBeNull();
  });

  it('asks about the return moment on arrival at Home, and only there', () => {
    expect(routeGate(facts({ path: '/' }))).toBe('coming-back');
    expect(routeGate(facts({ path: '/coming-back' }))).toBeNull();
    expect(routeGate(facts({ path: '/entry/new/20690' }))).toBeNull();
  });
});
