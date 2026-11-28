/* Schema 122 gives progress-photo poses their own table. Reconcile
   seeds the built-in `front`, `side` and `back` keys (ADR-0002).
   An empty name uses catalogue copy. Custom poses have UUIDs and
   deletion records for Archive Merge.

   Keep `progress_photo.pose` as plain text, now holding a built-in
   key or custom UUID. Existing photos need no migration. A missing
   pose still reads as Front. */

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
