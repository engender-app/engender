/* The one icon reader searchHitRows.ts and dayRows.ts share (ticket 30):
   each file draws rows for a registry of its own (textSearch.ts, day.ts)
   and neither registry names a screen, so neither file can call `hubRow()`
   with a key its own registry handed it. What both files do share is the
   rule this pair states once: a row's icon comes out of a function, read
   off the hub row that owns its screen where one does, so nothing here
   declares a hub row's icon a second time by hand. */

import { hubRow, type HubRow, type HubRowKey } from '$lib/data/hubRows';

/** A row's icon, read off the hub row that owns its screen. */
export function iconOf(key: HubRowKey): Pick<HubRow, 'icon'> {
  const { icon } = hubRow(key);
  return { icon };
}

/** A row's icon where no hub row owns its screen - a Settings reference
    list, or content with no route beyond the record it annotates. Kept as
    one call rather than naming the property inline, so every icon these
    two files' rows carry, hub-owned or not, comes out of a function rather
    than being declared by hand. */
export function literalIcon(value: string): Pick<HubRow, 'icon'> {
  return { icon: value };
}
