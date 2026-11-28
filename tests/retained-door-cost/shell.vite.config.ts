import { defineConfig, type Plugin, type UserConfig } from 'vite';
import base from '../../vite.config';
import { queryExperiment, buildIdentity } from './retained-door-cost.vite.config';

export default defineConfig(async (environment): Promise<UserConfig> => {
  const config = await base(environment);
  const shell: Plugin = {
      name: 'disposable-retained-shell-observation',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('/src/routes/+layout.svelte')) return;
        const owner = "  let RetainedDoors = $state<typeof import('$lib/navigation/RetainedDoors.svelte').default | null>(null);";
        if (!source.includes(owner)) throw new Error('retained shell module owner changed');
        return source.replace('<script lang="ts">',
          '<script lang="ts">\nimport "/tests/retained-door-cost/shell-bridge";')
          .replace(owner, owner + '\n  if (typeof window !== "undefined" && window.__retainedShell) window.__retainedShell.retainedReady = () => !!RetainedDoors;');
      }
  };
  return { ...config, define: { ...config.define, __RETAINED64_BUILD__: JSON.stringify(buildIdentity) }, plugins: [queryExperiment(), shell, ...(config.plugins ?? [])] };
});
