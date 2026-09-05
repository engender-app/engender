/* The documents area (phase 8 features ticket 52, ADR-0065). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { UUID_PATTERN } from './test-support.ts';

const bytes = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

const page = () => ({ full: bytes('a scanned page'), thumb: bytes('its thumbnail') });

async function device() {
  const files = fakeFileStore();
  const journal = openJournal(await migratedDb(), files);
  await journal.reconcileBuiltIns();
  return { journal, files };
}

test('a document round-trips its title and its day, newest first', async () => {
  const { journal } = await device();
  const older = await journal.documents.addDocument({ epochDay: 8900, title: 'Opinia psychiatryczna' }, page());
  const newer = await journal.documents.addDocument({ epochDay: 20000, title: 'Court ruling' }, page());

  assert.match(newer, UUID_PATTERN);
  const documents = await journal.documents.getDocuments();
  assert.deepEqual(
    documents.map((d) => [d.id, d.epochDay, d.title]),
    [
      [newer, 20000, 'Court ruling'],
      [older, 8900, 'Opinia psychiatryczna']
    ]
  );
});

test('one document, by id, and null for an id the journal does not hold', async () => {
  const { journal } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Referral' }, page());

  const found = await journal.documents.getDocument(id);
  assert.equal(found?.title, 'Referral');
  assert.equal(await journal.documents.getDocument('7ac0ffee-0000-4000-8000-000000000000'), null);
});

test('the file and its thumbnail land before the row that names them', async () => {
  const { journal, files } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Diagnosis' }, page());
  const document = (await journal.documents.getDocument(id))!;

  assert.deepEqual(files.names(), [document.fileName, document.fileName.replace('.jpg', '-thumb.jpg')].sort());
  assert.deepEqual(await files.read(document.fileName), bytes('a scanned page'));
});

/* ADR-0065: search finds a document by the title the person wrote and by
   nothing else, so a row with no title is a row with no handle at all. */
test('a title that is empty or only spaces is refused before anything is written', async () => {
  const { journal, files } = await device();
  await assert.rejects(journal.documents.addDocument({ epochDay: 20000, title: '   ' }, page()));

  assert.deepEqual(files.names(), []);
  assert.deepEqual(await journal.documents.getDocuments(), []);
});

test('a title keeps its own spacing trimmed at the edges, on the way in and on a correction', async () => {
  const { journal } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: '  Carry letter  ' }, page());
  assert.equal((await journal.documents.getDocument(id))!.title, 'Carry letter');

  const stored = (await journal.documents.getDocument(id))!;
  await journal.documents.updateDocument({ ...stored, title: '  Carry letter, second  ' });
  assert.equal((await journal.documents.getDocument(id))!.title, 'Carry letter, second');
});

/* Both writers, because both can produce one: an import with a blank title
   and a correction that empties one are the same unfindable row. */
test('a correction cannot blank a title either', async () => {
  const { journal } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Referral' }, page());
  const stored = (await journal.documents.getDocument(id))!;

  await assert.rejects(journal.documents.updateDocument({ ...stored, title: '  ' }));
  assert.equal((await journal.documents.getDocument(id))!.title, 'Referral');
});

test('a document dated years before the journal started shows on that day', async () => {
  const { journal } = await device();
  await journal.documents.addDocument({ epochDay: 8766, title: 'A print from 1994' }, page());
  await journal.documents.addDocument({ epochDay: 20000, title: 'Something recent' }, page());

  const onDay = await journal.documents.getDocumentsOnDay(8766);
  assert.deepEqual(
    onDay.map((d) => d.title),
    ['A print from 1994']
  );
});

test('the last write, at or before today', async () => {
  const { journal } = await device();
  assert.equal(await journal.documents.lastWriteEpochDay(20000), null);

  await journal.documents.addDocument({ epochDay: 19000, title: 'One' }, page());
  await journal.documents.addDocument({ epochDay: 19500, title: 'Two' }, page());
  // Dated ahead of the day being asked about, so it is not the last write.
  await journal.documents.addDocument({ epochDay: 20500, title: 'Three' }, page());

  assert.equal(await journal.documents.lastWriteEpochDay(20000), 19500);
});

test('a title and a day can be corrected, and the file stays where it was', async () => {
  const { journal, files } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Opnion' }, page());
  const stored = (await journal.documents.getDocument(id))!;

  await journal.documents.updateDocument({ ...stored, title: 'Opinion', epochDay: 19999 });

  const corrected = (await journal.documents.getDocument(id))!;
  assert.equal(corrected.title, 'Opinion');
  assert.equal(corrected.epochDay, 19999);
  assert.equal(corrected.fileName, stored.fileName);
  assert.equal(files.names().length, 2);
});

/* ADR-0053, both halves. */
test('an update naming an id the journal does not hold throws', async () => {
  const { journal } = await device();
  await assert.rejects(
    journal.documents.updateDocument({
      id: '7ac0ffee-0000-4000-8000-000000000000',
      epochDay: 20000,
      title: 'Nothing',
      fileName: 'nothing.jpg',
      targetKind: null,
      targetId: null
    })
  );
});

test('deleting takes the file and its thumbnail with it, and an unknown id changes nothing', async () => {
  const { journal, files } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Diagnosis' }, page());

  await journal.documents.deleteDocument(id);
  assert.deepEqual(await journal.documents.getDocuments(), []);
  assert.deepEqual(files.names(), []);

  await journal.documents.deleteDocument(id);
  await journal.documents.deleteDocument('7ac0ffee-0000-4000-8000-000000000000');
});

/* Ticket 56, ADR-0065: at most one link, cleared as cheaply as set. */
test('a document starts with no link, and one can be set and cleared', async () => {
  const { journal } = await device();
  const id = await journal.documents.addDocument({ epochDay: 20000, title: 'Referral' }, page());

  const fresh = (await journal.documents.getDocument(id))!;
  assert.equal(fresh.targetKind, null);
  assert.equal(fresh.targetId, null);

  await journal.documents.setDocumentTarget(id, { kind: 'milestone', id: 'm-1' });
  const linked = (await journal.documents.getDocument(id))!;
  assert.equal(linked.targetKind, 'milestone');
  assert.equal(linked.targetId, 'm-1');

  await journal.documents.setDocumentTarget(id, null);
  const cleared = (await journal.documents.getDocument(id))!;
  assert.equal(cleared.targetKind, null);
  assert.equal(cleared.targetId, null);
});

test('setting a target on an unknown document id throws', async () => {
  const { journal } = await device();
  await assert.rejects(
    journal.documents.setDocumentTarget('7ac0ffee-0000-4000-8000-000000000000', { kind: 'procedure', id: 'p-1' })
  );
});

test('documents linked to one target, newest first, and not the others', async () => {
  const { journal } = await device();
  const older = await journal.documents.addDocument({ epochDay: 8900, title: 'Older opinion' }, page());
  const newer = await journal.documents.addDocument({ epochDay: 20000, title: 'Newer opinion' }, page());
  const elsewhere = await journal.documents.addDocument({ epochDay: 19000, title: 'Unrelated' }, page());

  await journal.documents.setDocumentTarget(older, { kind: 'goal', id: 'pl-medical-keep-opinions' });
  await journal.documents.setDocumentTarget(newer, { kind: 'goal', id: 'pl-medical-keep-opinions' });
  await journal.documents.setDocumentTarget(elsewhere, { kind: 'milestone', id: 'm-1' });

  const linked = await journal.documents.getDocumentsLinkedTo('goal', 'pl-medical-keep-opinions');
  assert.deepEqual(
    linked.map((d) => d.id),
    [newer, older]
  );
});
