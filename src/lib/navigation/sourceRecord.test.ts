import { describe, expect, it } from 'vitest';
import { careEpisodeId, careLaneReturnHref, listReturnTo, sourceReturnTo, withListReturn } from './sourceRecord';

const at = (path: string) => new URL(`https://engender.test${path}`);

describe('listReturnTo', () => {
  it('names the list an entry was opened from, whichever it is', () => {
    for (const list of ['/calendar', '/search', '/day/20000', '/day/today', '/on-this-day', '/doubt/evidence', '/']) {
      expect(listReturnTo(at(withListReturn('/entry/7', at(list))))).toBe(list);
    }
  });

  it('keeps a list address with its own query', () => {
    expect(listReturnTo(at(withListReturn('/entry/7', at('/calendar?month=2026-09'))))).toBe('/calendar?month=2026-09');
  });

  it('refuses other origins, other entries and nothing', () => {
    expect(listReturnTo(at('/entry/1?from=%2F%2Fevil.test%2Fa'))).toBeNull();
    expect(listReturnTo(at('/entry/1?from=https%3A%2F%2Fevil.test%2Fa'))).toBeNull();
    expect(listReturnTo(at('/entry/1?from=%2Fentry%2F2'))).toBeNull();
    expect(listReturnTo(at('/entry/1'))).toBeNull();
  });

  it('does not make the editor think a source record sent it', () => {
    expect(sourceReturnTo(at(withListReturn('/entry/7', at('/calendar'))))).toBeNull();
  });
});

const EPISODE = '12345678-1234-1234-1234-123456789abc';

describe('Care return identity', () => {
  it('keeps the episode UUID and day without copying journal text', () => {
    expect(careLaneReturnHref(at(`/care/doses?episode=${EPISODE}&date=20000&drug=private&lane=private`)))
      .toBe(`/care?episode=${EPISODE}&date=20000`);
    expect(careLaneReturnHref(at('/care/labs?date=20000'))).toBe('/care?date=20000');
  });

  it('refuses names disguised as episode IDs and dates', () => {
    expect(careEpisodeId(at('/care?episode=private-drug'))).toBeNull();
    expect(careLaneReturnHref(at('/care/doses?episode=private-drug&date=private-drug'))).toBe('/more');
  });
});
