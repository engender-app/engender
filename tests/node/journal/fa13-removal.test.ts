import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const exists = (path: string) => existsSync(new URL(`../../../${path}`, import.meta.url));

describe('FA13 removed surfaces', () => {
  it('leaves old share and range addresses to unknown-address handling while retaining launch cadences and book card', () => {
    expect(exists('src/routes/wrapped/[cadence]/share/+page.svelte')).toBe(false);
    expect(read('src/routes/wrapped/[cadence]/+page.svelte')).not.toContain("view === 'range'");
    expect(read('src/routes/wrapped/[cadence]/+page.svelte')).toContain('WRAPPED_CADENCES');
    expect(read('src/routes/settings/journal-book/+page.svelte')).toContain('<WrappedCard content={opening} />');
  });

  it('removes nudge sheet and retrospective notification wiring', () => {
    expect(read('src/routes/+page.svelte')).not.toContain('quickLogDims');
    expect(read('src/lib/components/EntryEditor.svelte')).not.toContain('entryNudges');
    expect(exists('src/lib/data/retrospective-notifications-scheduler.ts')).toBe(false);
    expect(exists('android/app/src/main/java/dev/engender/app/retrospective/RetrospectiveNotificationsPlugin.java')).toBe(false);
  });
});
