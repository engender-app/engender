import type { MigrationFileOps } from '../migration-runner';

/** Migration-copy hooks for fixtures that exercise another owner. Kept
    separate from the Node driver so browser and native fixtures share it. */
export function noopFileOps(): MigrationFileOps {
  return {
    preMigrationCopyIsUsable: () => false,
    copyDatabaseFile() {},
    restorePreMigrationCopy() {},
    cleanupPreMigrationCopy() {}
  };
}
