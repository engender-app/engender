import { mount, unmount, tick } from 'svelte';
import AndroidKeyGate from '../../src/lib/components/AndroidKeyGate.svelte';
import SessionUnlock from '../../src/lib/components/SessionUnlock.svelte';
import { bootState } from '../../src/lib/stores/boot.svelte';
import { prefs } from '../../src/lib/data/prefs/store.svelte';
import { setLocale } from '../../src/lib/paraglide/runtime';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte';
import '../../src/lib/theme/fonts.css';
import '../../src/lib/theme/base.css';
import '../../src/lib/theme/palettes.css';
import '../../src/lib/styles/app.css';
import '../../src/lib/styles/components.css';
import '../../src/lib/styles/screens.css';
import '../../src/lib/styles/kit.css';
import '../../src/lib/motion/materials.css';

let instance: ReturnType<typeof mount> | undefined;
Object.assign(window, {
  wordmarkProbe: {
    async show(scene: 'cold' | 'session', locale: 'en' | 'pl', disguise: boolean, theme: string) {
      if (instance) await unmount(instance);
      setLocale(locale, { reload: false });
      prefs.disguise = disguise;
      document.documentElement.dataset.theme = theme;
      refreshActiveFlag(document);
      bootState.androidKey = { kind: 'refused', authentication: { outcome: 'unavailable', unlocksJournal: false, wayForward: 'deviceCredential' } };
      const target = document.getElementById('gate')!;
      instance = scene === 'cold' ? mount(AndroidKeyGate, { target }) : mount(SessionUnlock, { target, props: { mode: 'device-bound' } });
      await tick();
      if (scene === 'session') document.querySelector<HTMLButtonElement>('[data-session-device-lock]')!.click();
    }
  }
});
