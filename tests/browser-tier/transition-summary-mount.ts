import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import Probe from './transition-summary-fixture.svelte';
document.documentElement.dataset.a11yMotion = new URLSearchParams(location.search).get('motion') ?? 'full';
mount(Probe, { target: document.querySelector('#probe')! });
