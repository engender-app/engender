// A pool directory name derived from the database's own path: stable
// across reloads for a given database and distinct across databases, but
// hashed rather than embedding the path itself - this driver exists to
// keep the journal's contents unreadable at rest (ADR-0018), and a
// directory literally named after "engender.sqlite3" would defeat the
// same closed-app OPFS scan that proves nothing plaintext survives there.
export function poolDirectory(path: string): string {
  let hash = 2166136261; // FNV-1a, just for a short stable non-identifying tag.
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mc-pool-${(hash >>> 0).toString(36)}`;
}

