/* Version 122 (pre-release-human 12): progress photo poses become the
   person's own list.

   Version 120 stored a progress photo's pose as one of three words, with no
   table behind them. Alicja asked for poses of her own beside Front, Side
   and Back, and for the three to be renamed or hidden. So the poses get a
   table shaped like `body_region` (ADR-0002): a built-in row carries its
   `key` ('front', 'side', 'back', seeded by reconcile.ts with an empty name,
   which reads as the catalogue's), a custom row a minted `uuid`. A built-in
   that has been renamed holds the new name in `name`; clearing it gives the
   catalogue's back.

   `progress_photo.pose` is unchanged: it was already plain text with no
   CHECK, and now it holds a pose's domain id - the key for a built-in, the
   uuid for a custom pose - the way `entry_body_region.region` holds a
   region's. Every photo a journal at 120 or 121 holds names a built-in key,
   so nothing moves. A pose the table does not hold still reads as front
   (progressPhotos.ts), so a photo is never out of reach.

   Built-ins are seeded by reconcile.ts rather than here, as every other
   built-in list is, and a custom pose records its deletion for an archive
   Merge the way a custom body region does. */

import { deletionTrigger } from './deletion-migration.ts';

export const PROGRESS_POSE_VERSION = 122;

export const PROGRESS_POSES_TABLE = `
CREATE TABLE progress_pose (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT UNIQUE,
  key        TEXT UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
${deletionTrigger('progress_pose', 'COALESCE(OLD.key, OLD.uuid)')}
`;
