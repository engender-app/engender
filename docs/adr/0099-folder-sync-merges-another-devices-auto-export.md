# Folder sync merges another device's auto-export, on Android only

Status: Accepted
Decided: 2026-10-31
Last reviewed: 2026-11-02
Supersedes: none

Archive Merge (ADR-0098) is manual: export on one device, carry the file,
merge on the other. Android's auto-export already writes an encrypted archive
to a folder the person chose. Folder sync is the other half: when that folder
holds an archive another device wrote, the app merges it the next time the
person opens it. Something outside the app moves the file (Syncthing, a cable,
a cloud provider's folder). The app still makes no network request (ADR-0100).

## Decisions

- **One merge path.** `src/lib/data/archive/folder-sync.ts` opens the archive
  and hands it to the same `journal.archive.merge` the import screen uses.
  Everything ADR-0098 says about which copy wins, deletions and idempotence
  holds, and so does its known exposure.
- **On open, after unlock.** It runs on the auto-export scheduler's tick
  (`auto-export-scheduler.ts`): once when the scheduler starts, which is only
  on a ready, unlocked journal, and again each time the app returns to the
  front, before that tick's backup check so a merge and a backup never overlap.
  A lock that arrives before Merge begins stops it and the archive is retried.
  Once Merge has begun it finishes: it has no rollback part way through.
- **Never an archive this device wrote.** The plugin records the URI of every
  backup it wrote and verified, and folder sync skips those. The list is per
  installation, so after a reset the app's own older archives count as another
  device's. Merging them only adds what is missing, and folder sync is off
  until the person switches it on.
- **The newest one, once.** Among other devices' archives, the newest one
  modified after the last one tried is merged. An auto-export is the whole
  journal, so the newest says what the older ones did. The folder's position
  moves past an archive whether it merged or not, so a backup locked with
  another password, damaged, or written by a newer app is reported once. The
  same file written again later is newer and is tried again. The position also
  names the archives already tried at the same modification time, so a twin
  written in the same millisecond is still merged next open. Picking another
  folder or switching auto-export off forgets the position.
- **The saved backup password opens it**, derived behind the bridge as packing
  an auto-export does, so it never reaches the WebView. Devices that sync need
  the same backup password; the switch's note says so.
- **It says what happened.** A merge shows a toast; an archive that would not
  open shows one saying whether the password differed or the file could not be
  merged. Nothing new says nothing. The export screen keeps one line under the
  switch with the last outcome.
- **Per device.** The switch, the folder's position and the last outcome live
  with the auto-export settings in the plugin's own storage, not among the
  journal's preferences, so no archive carries them to another phone.
- **The web build has no folder sync.** Only Chromium can open a folder, and a
  kept handle needs a permission prompt each session. That is a manual import
  with extra steps; the web build keeps the import screen's Merge.
  `runFolderSync` returns without a bridge call off Android.

## Known exposure

- **Clocks, twice.** ADR-0098's clock exposure applies to every row. The
  folder's position is also the file's modification time, which the sync tool
  copies from the writing device. With three or more devices whose clocks
  disagree, an archive from a device running behind can be skipped until that
  device writes a newer one.
- **Three or more devices.** Only the newest archive is merged per open, so the
  third device's changes can arrive one round later.
- **A file still being copied** fails to open and is reported once; the
  finished file is newer and tried on the next open.

History: decided 2026-10-31. The parked LAN sync (ADR-0090) was superseded by ADR-0100 on 2026-11-02.