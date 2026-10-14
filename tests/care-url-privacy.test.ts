import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { careLaneReturnHref } from '../src/lib/navigation/sourceRecord';

const files = [
  'src/routes/care/+page.svelte',
  'src/routes/care/doses/+page.svelte',
  'src/routes/care/labs/+page.svelte',
  'src/lib/navigation/sourceRecord.ts'
];

function journalTextRoutes(source: string): string[] {
  return source.match(/[?&](?:drug|lane)=|searchParams\.set\(['"](?:drug|lane)['"]|href=\{[^\n}]*\.(?:drug|analyte|note|name|ester|interval|provider|label|description)\b|encodeURIComponent\((?:drug|lane|analyte|note|name|ester|interval|provider|label|description)\)|(?:goto|replaceRoute)\([^\n]*(?:encodeURIComponent\((?:drug|lane|analyte|note|name)\)|\.(?:drug|analyte|note|name)\b)/g) ?? [];
}

test('Care hrefs and navigation carry identity rather than journal text', () => {
  for (const file of files) expect(journalTextRoutes(readFileSync(file, 'utf8')), file).toEqual([]);
});

test('the guard rejects the former log URL and direct journal-field routing', () => {
  expect(journalTextRoutes('const logHref = (drug: string) => `/care/doses?add=1&drug=${encodeURIComponent(drug)}`;')).not.toEqual([]);
  expect(journalTextRoutes('href={lane.drug}')).not.toEqual([]);
  expect(journalTextRoutes('goto(`/care?lane=${lane.drug}`)')).not.toEqual([]);
  expect(journalTextRoutes('url.searchParams.set("drug", drug)')).not.toEqual([]);
  expect(journalTextRoutes('href={`/care?episode=${encodeURIComponent(drug)}`}')).not.toEqual([]);
  expect(journalTextRoutes('href={lane.episode.ester}')).not.toEqual([]);
});

test('Care returns never echo legacy free-text parameters or nonnumeric dates', () => {
  const at = (query: string) => new URL(`https://engender.test/care/doses?${query}`);
  expect(careLaneReturnHref(at('drug=Canarydiol&lane=Canarydiol&date=20000'))).toBe('/care?date=20000');
  expect(careLaneReturnHref(at('drug=Canarydiol&date=Canarydiol'))).toBe('/more');
});
