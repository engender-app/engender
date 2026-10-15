import { flushSync } from 'svelte';
import { fixture, today } from './screen-contracts/fixture';
import { mountScreen } from './mount-screen';
import { mountInto } from './mount';
import Notices from './focus-notices.svelte';
import Access from '../../src/routes/settings/access-mode/+page.svelte';
import Trash from '../../src/routes/settings/trash/+page.svelte';
import Words from '../../src/routes/settings/words/+page.svelte';
import Recovery from '../../src/routes/settings/recovery-key/+page.svelte';
import { bootState } from '$lib/stores/boot.svelte';

const f = await fixture('focus-swaps');
f.preferences!.a11yMotionReduce = new URL(location.href).searchParams.get('motion') !== 'full';
let mounted: { remove: () => Promise<void> } | undefined;
async function show(scene: string) {
  await mounted?.remove();
  mounted = await mountScreen('/', f);
  if (scene === 'home') return;
  await mounted.remove();
  const target = document.querySelector('.app-main') as HTMLElement;
  bootState.accessMode = 'passphrase';
  if (scene === 'trash') {
    for (let i = 0; i < 2; i++) {
      const id = await f.journal.entries.upsertEntry({ epochDay: today - i, mood: 3, note: `Restore ${i}` });
      await f.journal.entries.deleteEntry(id);
    }
  }
  if (scene === 'words') {
    await f.journal.wordIgnore.setWordIgnored('first', true);
    await f.journal.wordIgnore.setWordIgnored('second', true);
  }
  const component = { notices: Notices, access: Access, trash: Trash, words: Words, recovery: Recovery }[scene];
  if (!component) throw new Error(`Unknown scene: ${scene}`);
  mounted = mountInto(component, {}, target);
  flushSync();
}
Object.assign(window, { focusSwaps: { show } });
document.body.dataset.ready = 'true';
