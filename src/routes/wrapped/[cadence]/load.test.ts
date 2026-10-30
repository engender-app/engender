/* The wrapped route's only guard: FA 13 removed the share and range views, so
   an old address must land on the unknown-address page rather than render a
   recap for a cadence that no longer exists. */
import { describe, expect, it, vi } from 'vitest';

/* The node tier has no $lib alias; the guard only needs the cadence list. */
vi.mock('$lib/data/wrapped', () => ({ WRAPPED_CADENCES: ['year', 'month', 'week'] }));

const { load } = await import('./+page');

const run = (cadence: string) => (load as unknown as (event: { params: { cadence: string } }) => unknown)({ params: { cadence } });

describe('wrapped load', () => {
  it('guards the same cadences the real module offers', async () => {
    const real = await vi.importActual<typeof import('../../../lib/data/wrapped')>('../../../lib/data/wrapped');
    expect([...real.WRAPPED_CADENCES].sort()).toEqual(['month', 'week', 'year']);
  });

  it.each(['range', 'share'])('answers 404 for the removed %s address', (cadence) => {
    expect(() => run(cadence)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it.each(['week', 'month', 'year'])('lets the %s cadence through', (cadence) => {
    expect(() => run(cadence)).not.toThrow();
  });
});
