/* Audit item A3: MOVED_ADDRESSES (src/lib/navigation/movedAddresses.ts) is
   the one table of old-to-new addresses; this test just walks it, plus
   checks the table and the stub files on disk agree which routes exist -
   catching a row with no stub and a stub with no row. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import { MOVED_ADDRESSES } from '../src/lib/navigation/movedAddresses.ts';

const ROUTES_DIR = join(import.meta.dirname, '..', 'src', 'routes');

function findStubs(dir: string, routeId = ''): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...findStubs(path, `${routeId}/${entry.name}`));
		else if (entry.name === '+page.ts' && readFileSync(path, 'utf8').includes('movedAddresses')) {
			found.push(routeId || '/');
		}
	}
	return found;
}

const tableRouteIds = Object.keys(MOVED_ADDRESSES).sort();

it('has a stub for every row and a row for every stub', () => {
	expect(findStubs(ROUTES_DIR).sort()).toEqual(tableRouteIds);
});

async function redirectFrom(routeId: string, event: { params?: Record<string, string>; url: URL }) {
	const path = `../src/routes${routeId === '/' ? '' : routeId}/+page.ts`;
	const mod = (await import(/* @vite-ignore */ path)) as { load: (e: unknown) => unknown };
	try {
		mod.load({ params: {}, route: { id: routeId }, ...event });
		expect.fail('load() did not redirect');
	} catch (e) {
		if (!isRedirect(e)) throw e;
		expect(e.status).toBe(307);
		return e.location as string;
	}
}

describe('every moved route keeps a 307 redirect at its old address', () => {
	const fixedRows = tableRouteIds.filter((routeId) => typeof MOVED_ADDRESSES[routeId] === 'string');

	it.each(fixedRows)('%s redirects to its table target', async (routeId) => {
		const target = await redirectFrom(routeId, { url: new URL(`https://example.test${routeId}`) });
		expect(target).toBe(MOVED_ADDRESSES[routeId]);
	});

	it('a letter deep link keeps its id', async () => {
		const target = await redirectFrom('/settings/letters/[id]', {
			params: { id: 'abc-123' },
			url: new URL('https://example.test/settings/letters/abc-123')
		});
		expect(target).toBe('/transition/letters/abc-123');
	});

	it('a tryout deep link keeps its id', async () => {
		const target = await redirectFrom('/settings/tryouts/[id]', {
			params: { id: 't-9' },
			url: new URL('https://example.test/settings/tryouts/t-9')
		});
		expect(target).toBe('/transition/tryouts/t-9');
	});

	it('the old voice address forwards whatever query it was given', async () => {
		const at = (search: string) =>
			redirectFrom('/practice/voice', { url: new URL(`https://example.test/practice/voice${search}`) });
		expect(await at('')).toBe('/voice');
		expect(await at('?tab=record')).toBe('/voice?tab=record');
		expect(await at('?metric=pitch')).toBe('/voice?metric=pitch');
	});
});
