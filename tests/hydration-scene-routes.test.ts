import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hydrationScreensFor } from './yank-sweep-core.mjs';

const routesDirectory = join(process.cwd(), 'src/routes');

/* Redirect stubs render no screen, so a hydration scene would only time out.
   Keep each exception here with its reason. The stub check below makes this
   list expire when its route grows a surface of its own. */
const HYDRATION_ROUTE_EXEMPTIONS: ReadonlyArray<{ route: string; reason: string }> = [];

async function pageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === '+page.svelte' || entry.name === '+page.ts' ? [path] : [];
  }));
  return files.flat();
}

function normaliseRoute(route: string): string {
  return decodeURIComponent(route).replace(/\[[^\]]+\]|\{[^}]+\}/g, '{param}');
}

function routeForPage(pageFile: string): string {
  const path = relative(routesDirectory, dirname(pageFile)).split(sep).join('/');
  return normaliseRoute(path === '' ? '/' : `/${path}`);
}

function routeForScene(at: string): string {
  return normaliseRoute(new URL(at, 'https://gender-diary.test').pathname);
}

function matchesRoute(sceneRoute: string, route: string): boolean {
  const sceneSegments = sceneRoute.split('/');
  const routeSegments = route.split('/');
  return sceneSegments.length === routeSegments.length && routeSegments.every(
    (segment, index) => segment === '{param}' || segment === sceneSegments[index]
  );
}

describe('hydration scene routes', () => {
  it('covers every rendered route and no dead route', async () => {
    const routeFiles = await pageFiles(routesDirectory);
    const renderedRoutes = new Set(
      routeFiles.filter((file) => file.endsWith('+page.svelte')).map(routeForPage)
    );
    const routes = new Set(routeFiles.map(routeForPage));
    const scenes = hydrationScreensFor().map((scene) => routeForScene(scene.at));
    const exemptions = new Set(HYDRATION_ROUTE_EXEMPTIONS.map((exemption) => exemption.route));

    for (const route of renderedRoutes) {
      expect(
        scenes.some((scene) => matchesRoute(scene, route)) || exemptions.has(route),
        `${route} has no hydration scene. Add one to HYDRATION_SCENES or add a redirect-stub exemption with a reason.`
      ).toBe(true);
    }

    for (const route of scenes) {
      expect(
        [...routes].some((existingRoute) => matchesRoute(route, existingRoute)),
        `${route} has no route. Remove or update its HYDRATION_SCENES entry.`
      ).toBe(true);
    }
  });

  it('keeps exemptions limited to empty redirect stubs', async () => {
    const routeFiles = await pageFiles(routesDirectory);

    for (const { route, reason } of HYDRATION_ROUTE_EXEMPTIONS) {
      expect(reason.trim(), `${route} needs an exemption reason.`).not.toBe('');

      const pageFile = routeFiles.find((file) => routeForPage(file) === normaliseRoute(route));
      if (pageFile === undefined) throw new Error(`${route} exemption has no route.`);
      const source = await readFile(pageFile, 'utf8');

      if (pageFile.endsWith('+page.svelte')) {
        const markup = source.slice(source.lastIndexOf('</script>') + '</script>'.length).trim();
        expect(markup, `${route} exemption no longer renders nothing. Add a hydration scene.`).toBe('');
        expect(
          /\b(?:goto|replaceRoute)\s*\(/.test(source),
          `${route} exemption no longer redirects. Add a hydration scene.`
        ).toBe(true);
      } else {
        expect(
          /\bredirect\s*\(/.test(source),
          `${route} exemption no longer redirects. Add a hydration scene.`
        ).toBe(true);
      }
    }
  });
});
