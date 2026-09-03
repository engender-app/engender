/** Where photo files live. The journal owns the rows; whoever owns the
    bytes implements this, so the rules about files - a delete takes them
    along, the boot sweep reclaims what no row references - are testable
    against a fake in the Node tier (ADR-0017).

    Every argument is an opaque file name, never a path: OPFS on web and
    the app-private directory on Android are different roots, and an
    archive written on one has to import on the other (names.ts). */
export interface PhotoFileStore {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  /** Optional batched read. Results align with `names`; null means missing. */
  readMany?(names: string[]): Promise<(Uint8Array | null)[]>;
  /** How many bytes the file holds, or null if it is not there. An
      archive's chunk count has to be settled before its first chunk is
      encrypted (ADR-0007), so packing needs every photo's length up front
      - and reading each photo twice to find out is the thing the format
      exists to avoid. */
  size(name: string): Promise<number | null>;
  /** Optional batched size. Results align with `names`; null means missing. */
  sizeMany?(names: string[]): Promise<(number | null)[]>;
  remove(name: string): Promise<void>;
  /** Every file in the store, for the orphan sweep. */
  list(): Promise<string[]>;
}
