/* The settings-side half of after-release ticket 09, held at the level the
   source can be held to. The gate-side half renders in the browser tier
   (tests/gates-say-what-happened.mjs); these screens need an open journal,
   which the gates fixture does not have. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const en = JSON.parse(read('messages/en.json')) as Record<string, string>;

describe('the recovery-key confirm sheets', () => {
  const page = read('src/routes/settings/recovery-key/+page.svelte');
  /* The confirm sheet: from its opening tag to the next sheet. */
  const sheet = page.slice(page.indexOf('open={confirming !== null}'), page.indexOf('open={guard.pendingDeparture'));

  it('draws both confirms as the danger they are', () => {
    expect(sheet).toMatch(/class="btn btn-danger"[^>]*data-confirm-revoke/);
    expect(sheet).toMatch(/class="btn btn-danger"[^>]*data-confirm-replace/);
    expect(sheet).not.toContain('btn-primary');
  });

  it('offers a way back out that changes nothing', () => {
    expect(sheet).toMatch(/data-cancel-recovery-key[^>]*onclick=\{\(\) => \(confirming = null\)\}/);
  });
});

describe('changing the passphrase', () => {
  const page = read('src/routes/settings/passphrase/+page.svelte');

  it('blames the current passphrase only when it was the current passphrase', () => {
    expect(page).toMatch(/e instanceof DecryptionFailedError \? m\.pp_change_wrong_current\(\) : m\.pp_change_failed\(\)/);
    expect(en.pp_change_failed).toBeTruthy();
    expect(en.pp_change_failed).not.toMatch(/current passphrase/i);
  });
});

describe('the access-mode screen', () => {
  it('draws the change-the-secret card only for a mode that has one to change', () => {
    const page = read('src/routes/settings/access-mode/+page.svelte');
    expect(page).toMatch(/\{#if current === 'passphrase' \|\| current === 'pin'\}\s*<div[^>]*transition:disclose[^>]*>\s*<ListCard>/);
  });
});

describe('the lost-key notes on a cold gate', () => {
  it('never sends somebody to reopen the app for a recovery key the gate already offers', () => {
    for (const path of ['src/lib/components/AndroidKeyGate.svelte', 'src/lib/components/JournalGate.svelte']) {
      expect(read(path), path).not.toMatch(/_forgot_key_note\(\)/);
    }
    for (const key of ['ak_forgot_gate_note', 'bm_forgot_gate_note', 'pin_forgot_gate_note', 'pp_forgot_gate_note']) {
      expect(en[key], key).toBeTruthy();
      expect(en[key], key).not.toMatch(/recovery key|reopen/i);
    }
  });
});
