import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { createWebSqlite, openPlaintextEraJournal } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { runMigrations } from '../../src/lib/data/sqlite/migration-runner.ts';
import { migrations } from '../../src/lib/data/sqlite/migrations.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'foreign-keys-probe';

async function run() {
  await freshOrigin('foreign-keys-probe-cleared');
  const web = createWebSqlite('foreign-keys-plain.sqlite3');
  const sqlocalOpen = (await web.driver.query('PRAGMA foreign_keys'))[0].foreign_keys;
  await web.driver.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY)');
  await web.fileOps.copyDatabaseFile();
  await web.driver.exec('PRAGMA foreign_keys = OFF');
  await web.fileOps.restorePreMigrationCopy();
  const sqlocalRestoredOpen = (await web.driver.query('PRAGMA foreign_keys'))[0].foreign_keys;
  await web.driver.close();
  const plain = openPlaintextEraJournal('foreign-keys-plain.sqlite3');
  const plaintextOpen = (await plain.query('PRAGMA foreign_keys'))[0].foreign_keys;
  await plain.close();

  const { driver, fileOps } = createEncryptedWebSqlite('foreign-keys.sqlite3', PROBE_DATA_KEY);
  // Read before the migration runner can enable enforcement itself.
  const encryptedOpen = (await driver.query('PRAGMA foreign_keys'))[0].foreign_keys;
  await runMigrations(driver, fileOps, migrations);
  const encryptedAfterMigration = (await driver.query('PRAGMA foreign_keys'))[0].foreign_keys;
  const files = fakeFileStore();
  const journal = openJournal(driver, files);
  await journal.reconcileBuiltIns();
  const shot = { full: new Uint8Array([1]), thumb: new Uint8Array([2]) };
  const session = await journal.hairRemoval.upsertSession({ epochDay: 20003, area: 'chin', method: 'laser', painRating: 2 });
  await journal.hairRemoval.addPhoto(session, shot);
  const procedure = await journal.procedures.upsertProcedure({ name: 'FFS' });
  await journal.procedures.addPhoto(procedure, 20005, shot);
  await journal.appointments.upsertAppointment({ procedureId: procedure, epochDay: 20010, kind: 'consult', place: '', note: '' });
  const checklist = await journal.checklists.createChecklist();
  await journal.checklists.addItem(checklist.id, 'ask about recovery');
  await journal.hairRemoval.deleteSession(session);
  await journal.procedures.deleteProcedure(procedure);
  await journal.checklists.deleteChecklist(checklist.id);
  const children = await driver.query(`SELECT
    (SELECT COUNT(*) FROM hair_removal_photo) AS sessionPhotos,
    (SELECT COUNT(*) FROM procedure_photo) AS procedurePhotos,
    (SELECT COUNT(*) FROM appointment) AS appointments,
    (SELECT COUNT(*) FROM checklist_item) AS checklistItems`);
  const snapshot = await journal.archive.snapshot();
  const violations = await driver.query('PRAGMA foreign_key_check');
  await driver.close();
  publish(NAME, {
    encryptedOpen, encryptedAfterMigration, sqlocalOpen, sqlocalRestoredOpen, plaintextOpen,
    children: children[0], manifest: snapshot.files.map((file) => file.name), violations
  });
}

run().catch((err) => publish(NAME, { error: String(err?.stack ?? err) }));
