# The reminder payload is wrapped under its own Keystore key

Status: Accepted
Decided: 2026-08-31
Last reviewed: 2026-11-02
Supersedes: none

On Android the reminder payload is stored as AES-GCM ciphertext in the `engender-reminders` preferences, under a Keystore key with the alias `engender-reminders-payload`. `ReminderPayloadStore` owns the wrap, the alias and the migration off the old plaintext value; `ReminderScheduler` and `ReminderAlarmReceiver` still see a `loadPayload` that hands them a `JSONObject`.

## Why

The payload is every reminder's title, rule and pending occurrence, the check-in settings, the hide-titles preference and the epoch day of the latest entry. Reminder titles are whatever the person typed. Until this decision it was a JSON string in the clear, so anything that reached the app's directory read it: a forensic image, a rooted device, a copy of the data partition. That is the adversary the app is built against first, someone holding the device's files with no unlock, and against them the encrypted database held while this file did not.

The payload cannot go under the journal's data key. The alarm receiver has to name the person's own reminder while the journal is locked, which is the point of keeping the payload apart from the database, and a receiver that needed the data key could not fire until somebody unlocked the app.

It can go under a key that asks for no authentication. `AutoExportPlugin`'s `PasswordStore` already keeps the backup password that way: an AES-GCM key generated in Keystore with `setUserAuthenticationRequired(false)`, usable by app code in this process with no prompt and gone when the alias is deleted. The receiver runs in the app's own process, so it can use the same kind of key. This is not secrecy from the running app, which needs the titles. It means a copy of the files is no longer enough: the ciphertext opens only on the device whose keystore holds the alias, and the alias cannot be copied out.

The two stores keep separate aliases rather than a shared helper. That keeps `DeviceStores` a list of owners instead of a list of key names, and neither reset can take the other's key with it.

## Consequences

- `ReminderScheduler.saveAndSchedule` writes the wrapped payload before it cancels the old alarms, so a wrap that fails leaves the phone on the rules it had. `RemindersPlugin.sync` rejects, `platform-sync.ts` logs it, and the next sync on the next focus recovers.
- Nothing is left outside the wrap. The receiver decrypts before it needs any field, so no next-fire-time shortcut sits in the clear. The launch route beside the payload stays plaintext, because it is a route and a reminder id, never a title.
- A payload written by an older build is read once, rewrapped, and its plaintext removed. If the rewrap throws, the plaintext stays and the payload is still returned: a device whose keystore will not mint a key should be the last to lose somebody's reminders. A payload that will not parse is removed either way.
- A ciphertext whose key has gone reads as no payload: no alarms, no notification, no exception out of `onReceive`. Reading never mints a key, so a read after the alias has gone does not leave a fresh one behind that opens nothing.
- `ReminderScheduler.wipe` deletes the alias after clearing the file, so a reset takes both (the reset steps are in ADR-0041 and `data/reset.ts`).
- `DeviceStores.wipe` runs every store even when one throws and raises the first failure with later ones attached. The reminder store can now fail, and without this a throw there would have left the backup destination, the wrapped backup password and the lock-timing preference on a phone the person had just wiped.
- Reminder titles are unchanged on screen. `VISIBILITY_PRIVATE` still governs the lock screen and `hideNotificationTitles` the shade.

History: alias and preference names changed with the app rename (they were `gender-diary-reminders-payload`); trimmed 2026-11-02.