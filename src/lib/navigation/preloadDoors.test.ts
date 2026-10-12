import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ path: '/', idle: [] as Array<(deadline: IdleDeadline) => Promise<void> | void> }));
const preloadCode = vi.fn<(path: string) => Promise<void>>();
vi.mock('$app/navigation', () => ({ preloadCode: (path: string) => preloadCode(path) }));
vi.mock('$app/state', () => ({ page: { get url() { return new URL(state.path, 'https://localhost'); } } }));

let doc: EventTarget & { visibilityState: string; documentElement: { dataset: Record<string, string> } };
let changed: () => void;
let disconnected: ReturnType<typeof vi.fn>;
let preloadDoors: (signal: AbortSignal) => Promise<void>;
let controllers: AbortController[];

beforeEach(async () => {
  vi.resetModules();
  state.path = '/';
  state.idle = [];
  vi.stubGlobal('requestIdleCallback', (run: (deadline: IdleDeadline) => Promise<void> | void) => state.idle.push(run));
  preloadCode.mockReset().mockResolvedValue(undefined);
  controllers = [];
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: { dataset: {} } });
  vi.stubGlobal('document', doc);
  disconnected = vi.fn();
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { changed = callback; }
    observe() {}
    disconnect = disconnected;
  });
  ({ preloadDoors } = await import('./preloadDoors'));
});
afterEach(() => {
  controllers.forEach((controller) => controller.abort());
  vi.unstubAllGlobals();
});

function start() {
  const controller = new AbortController();
  controllers.push(controller);
  preloadDoors(controller.signal);
  return controller;
}
async function idle(remaining = 50, didTimeout = false) { await state.idle.shift()?.({ didTimeout, timeRemaining: () => remaining }); }
function input(type: string, id: number | string) {
  doc.dispatchEvent(Object.assign(new Event(type), typeof id === 'number' ? { pointerId: id } : { code: id }));
}

it('waits for a fresh idle slot when no idle budget remains', async () => {
  start();
  await idle(0);
  expect(preloadCode).not.toHaveBeenCalled();
  await idle();
  expect(preloadCode).toHaveBeenCalledWith('/calendar');
});

it('starts eligible code after the idle deadline expires without a frame budget', async () => {
  start();
  await idle(0, true);
  expect(preloadCode).toHaveBeenCalledWith('/calendar');
});

it('prepares remaining door code once, with a fresh idle callback between imports', async () => {
  start();
  expect(preloadCode).not.toHaveBeenCalled();
  await idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar']]);
  await idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar'], ['/stats']]);
  await idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar'], ['/stats'], ['/more']]);
  await idle();
  expect(disconnected).toHaveBeenCalledOnce();
  start();
  await idle();
  expect(preloadCode).toHaveBeenCalledTimes(3);
  expect(state.path).toBe('/');
});

it('waits for the first splash handover to finish', async () => {
  doc.documentElement.dataset.splash = 'leaving';
  start();
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  delete doc.documentElement.dataset.splash;
  changed();
  await idle();
  expect(preloadCode).toHaveBeenCalledWith('/calendar');
});

it.each([['pointerdown', 'pointerup', 1], ['keydown', 'keyup', 'Enter']] as const)('yields while %s is held, then resumes at idle', async (down, up, id) => {
  start();
  input(down, id);
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  input(up, id);
  await idle();
  expect(preloadCode).toHaveBeenCalledOnce();
});

it.each([
  ['pointerdown', 'pointerup', 2],
  ['keydown', 'keyup', 'Enter']
] as const)('waits for overlapping pointer and %s input to end', async (down, up, id) => {
  start();
  input('pointerdown', 1);
  input(down, id);
  await idle();
  input('pointerup', 1);
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  input(up, id);
  await idle();
  expect(preloadCode).toHaveBeenCalledWith('/calendar');
});

it('tracks held keys once across repeated keydown events', async () => {
  start();
  input('keydown', 'ShiftLeft');
  input('keydown', 'Enter');
  input('keydown', 'Enter');
  await idle();
  input('keyup', 'Enter');
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  input('keyup', 'ShiftLeft');
  await idle();
  expect(preloadCode).toHaveBeenCalledWith('/calendar');
});

it('invalidates pending idle work during scrolling', async () => {
  start();
  doc.dispatchEvent(new Event('scroll'));
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  await idle();
  expect(preloadCode).toHaveBeenCalledOnce();
});

it('stops in the background and resumes after visibility returns', async () => {
  start();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await idle();
  expect(preloadCode).not.toHaveBeenCalled();
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await idle();
  expect(preloadCode).toHaveBeenCalledOnce();
});

it('does not start queued work after its owner is stopped', async () => {
  const controller = start();
  controller.abort();
  await idle();
  doc.dispatchEvent(new Event('pointerup'));
  expect(preloadCode).not.toHaveBeenCalled();
  expect(state.idle).toHaveLength(0);
  expect(disconnected).toHaveBeenCalledOnce();
});

it('keeps imports sequential across cancellation and skips the newly visited door', async () => {
  let finish!: () => void;
  preloadCode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const controller = start();
  const first = idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar']]);
  controller.abort();
  state.path = '/more';
  start();
  const resumed = idle();
  expect(preloadCode).toHaveBeenCalledOnce();
  finish();
  await Promise.all([first, resumed]);
  expect(preloadCode).toHaveBeenCalledOnce();
  await idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar'], ['/stats']]);
});

it('lets a failed optional preload leave later doors available', async () => {
  preloadCode.mockRejectedValueOnce(new Error('asset unavailable'));
  start();
  await idle();
  await idle();
  expect(preloadCode.mock.calls).toEqual([['/calendar'], ['/stats']]);
});

it('ignores a stop that arrives before the lazy module starts', async () => {
  const controller = new AbortController();
  controller.abort();
  preloadDoors(controller.signal);
  expect(state.idle).toHaveLength(0);
});

it('settles completion only after the last optional import has finished', async () => {
  const controller = new AbortController();
  controllers.push(controller);
  const done = vi.fn();
  const completion = preloadDoors(controller.signal).then(done);
  await idle();
  await idle();
  expect(done).not.toHaveBeenCalled();
  await idle();
  await idle();
  await completion;
  expect(done).toHaveBeenCalledOnce();
});

it('settles an aborted owner even while its import is still running', async () => {
  let finish!: () => void;
  preloadCode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const controller = new AbortController();
  controllers.push(controller);
  const done = vi.fn();
  const completion = preloadDoors(controller.signal).then(done);
  const importing = idle();
  controller.abort();
  await completion;
  expect(done).toHaveBeenCalledOnce();
  finish();
  await importing;
  expect(preloadCode).toHaveBeenCalledOnce();
});

it('keeps a replacement owner pending through held input and an aborted final import', async () => {
  let finish!: () => void;
  preloadCode.mockImplementation((path) => path === '/more'
    ? new Promise((resolve) => { finish = resolve; })
    : Promise.resolve());
  const controller = start();
  await idle();
  await idle();
  const importing = idle();
  controller.abort();

  const replacement = new AbortController();
  controllers.push(replacement);
  const done = vi.fn();
  const completion = preloadDoors(replacement.signal).then(done);
  input('pointerdown', 1);
  await idle();
  expect(done).not.toHaveBeenCalled();
  input('pointerup', 1);
  const waiting = idle();
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();

  finish();
  await Promise.all([importing, waiting]);
  expect(done).not.toHaveBeenCalled();
  await idle();
  await completion;
  expect(done).toHaveBeenCalledOnce();
  expect(preloadCode.mock.calls).toEqual([['/calendar'], ['/stats'], ['/more']]);
});
