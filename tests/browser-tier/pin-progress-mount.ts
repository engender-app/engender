import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import Probe from './pin-progress.svelte';

publishFixture('pin-progress', () => mountInto(Probe, {}, document.querySelector('#probe')!));
