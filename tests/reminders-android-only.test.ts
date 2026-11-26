/* Pre-release human 18: reminders exist on Android only. A browser neither
   draws the Settings row nor the two screens, finds no reminder in search,
   and names its notices screen for what it holds there. Stored reminders are
   untouched - they ring again once the journal reaches Android. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let android = false;
vi.mock('$lib/platform', () => ({ isAndroid: () => android }));
vi.mock('$lib/paraglide/messages', () => ({
  m: { notif_title: () => 'phone', notif_title_web: () => 'in-app', notice_turned_off_toast: () => 'toast', notice_turned_off_toast_web: () => 'toast-web' }
}));

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

beforeEach(() => {
  android = false;
});

describe('the reminders routes', () => {
  async function load() {
    const layout = await import('../src/routes/settings/reminders/+layout');
    return layout.load({} as never);
  }

  it('send a browser to Settings', async () => {
    await expect(load()).rejects.toMatchObject({ status: 307, location: '/settings' });
  });

  it('let Android through', async () => {
    android = true;
    await expect(load()).resolves.toBeUndefined();
  });
});

describe('search hits', () => {
  const hit = { area: 'reminders', id: 'r-1', context: null, epochDay: null, value: 'Take estradiol' } as never;
  const other = { area: 'eras', id: 'e-1', context: null, epochDay: null, value: 'Take estradiol' } as never;

  it('leave reminders out on the web and keep the rest', async () => {
    const { hitsForPlatform } = await import('../src/lib/data/journal/searchPlatform');
    expect(hitsForPlatform([hit, other], false).map((h) => h.area)).toEqual(['eras']);
  });

  it('keep reminders on Android', async () => {
    const { hitsForPlatform } = await import('../src/lib/data/journal/searchPlatform');
    expect(hitsForPlatform([hit, other], true).map((h) => h.area)).toEqual(['reminders', 'eras']);
  });

  it('are filtered by the rows both search screens draw', () => {
    const rows = read('src/lib/components/searchHitRows.ts');
    expect(rows).toContain('hitsForPlatform(hits, isAndroid())');
  });
});

describe('the Settings row', () => {
  const settings = read('src/routes/settings/+page.svelte');

  it('is drawn on Android only, with no web subtitle or info icon', () => {
    const at = settings.indexOf('key="reminders"');
    expect(at).toBeGreaterThan(0);
    expect(settings.slice(settings.lastIndexOf('{#if', at), at)).toMatch(/\{#if !isWeb\}\s*<ListRow\s*$/);
    expect(settings).not.toContain('reminders_web_sub');
    expect(settings).not.toContain("isWeb ? 'info'");
  });
});

describe('the notices screen on the web', () => {
  const screen = read('src/routes/settings/notifications/+page.svelte');

  it('is titled for in-app notices and keeps no notice repeating it', () => {
    expect(screen).toContain('notificationsTitle()');
    expect(screen).not.toContain('notif_web_title');
    expect(read('src/routes/settings/+page.svelte')).toContain('notificationsTitle()');
  });

  it('names itself by platform', async () => {
    const { notificationsTitle, noticeTurnedOffToast } = await import('../src/lib/notificationsTitle');
    expect([notificationsTitle(), noticeTurnedOffToast()]).toEqual(['in-app', 'toast-web']);
    android = true;
    expect([notificationsTitle(), noticeTurnedOffToast()]).toEqual(['phone', 'toast']);
  });
});
