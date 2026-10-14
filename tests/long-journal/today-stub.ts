import { currentDay as realCurrentDay } from '../../src/lib/stores/today.svelte';

let fixtureDay: number | null = null;
export function setLookBackDay(day: number | null): void {
  fixtureDay = day;
}
export function currentDay(): number {
  return fixtureDay ?? realCurrentDay();
}
