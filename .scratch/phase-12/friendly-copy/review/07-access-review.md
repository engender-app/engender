# Access and recovery copy review

Reviewed against main at `1a828acc` and the author’s working EN/PL catalogues.
The ticket covers opening modes, lock timing, PIN/passphrase entry and changes,
Android authentication, conversion and inaccessible-journal gates, recovery-key
creation, use, replacement, removal and departure. Shared permission and archive
boundaries were also read, including errors, progress, empty and populated states.
Human Polish sign-off remains open.

## Paired decisions

[07-access-pairs.json](07-access-pairs.json) records all 381 paired strings in
this scope, their exact authored baseline and final values, keep/shorten decisions,
reasons and current callers. It includes all shared accessible names, controls,
permission states and archive plural branches. There are 370 keep and 11 shorten
decisions. Keep can include clarifying a subject while retaining the message’s
purpose; `changedFromAuthor` identifies every wording edit. No key was removed.

24 pairs change. Every audited candidate has an explicit decision. Authored Polish
lock terminology stays verbatim; onboarding’s question now uses the same vocabulary.
The recovery-key explanation keeps the 25 characters, storage elsewhere, one-time
display and immediate replacement consequence. The active-key Polish sentence names
the saved key instead of switching between the key and its characters. English’s
fallback sentence explicitly names the passphrase and PIN.

The setup explanation keeps encryption and changing the opening mode later in
Settings, without narrating the choice. Onboarding already hides the shared module’s
intro and renders it in the outer setup line. That structure stays unchanged, with
exactly one visible explanation. No rendered container became unused.

Security consequences remain direct. No joke was added to key loss, reset or removal.
Existing greetings keep their warmth. No selected copy contains paper citations;
there were none to remove here. Authored short explanations and omissions remain,
including Android key store, conversion wording, archive-reset advice and the
passphrase-change warning. Their working values remain outside this commit and
are preserved in the main checkout.

### Changed paired wording

| Key | Final English | Final Polish | Decision |
| --- | --- | --- | --- |
| ak_cancelled | Cancelled. | Anulowane. | shorten |
| ak_invalidated_body | Removing the screen lock destroys your journal's Android key. It cannot be recovered. Your entries are still on this phone, but nothing can open them. If you have a saved archive, you can start over and restore its contents. | Po usunięciu blokady ekranu Android niszczy klucz dziennika. Nie da się go odzyskać. Wpisy nadal są na telefonie, ale nie można ich już otworzyć. Jeśli masz archiwum z wcześniejszego eksportu, możesz zacząć od nowa i przywrócić zawarte w nim dane. | shorten |
| ak_invalidated_body_recoverable | Removing the screen lock destroys your journal's Android key. It cannot be recovered. Your entries are still on this phone, and your recovery key can open them. | Po usunięciu blokady ekranu Android niszczy klucz dziennika. Nie da się go odzyskać. Wpisy nadal są na telefonie i można je otworzyć kluczem odzyskiwania. | shorten |
| ak_no_lock_body | Android's key store needs a screen lock to hold your journal key. Set a PIN, pattern or password in the device settings, then come back here. | Klucz dziennika jest przechowywany w Android key store. Android nie przechowuje go bez blokady ekranu. Ustaw PIN, wzór lub hasło w ustawieniach urządzenia i wróć tutaj. | shorten |
| am_biometric_detail | Your fingerprint or face opens the journal. Losing the device, removing the enrolled fingerprint or face, or clearing this browser profile can remove access. A saved recovery key helps only if the journal data remains. | Odcisk palca lub skan twarzy pozwala otworzyć dziennik. Utrata urządzenia, usunięcie zapisanego odcisku lub twarzy albo wyczyszczenie profilu przeglądarki może odciąć dostęp. Klucz odzyskiwania pomoże tylko wtedy, gdy dane dziennika nadal są na urządzeniu. | shorten |
| am_recovery_active | Your recovery key keeps working whichever opening mode you choose. | Ten dziennik ma też klucz odzyskiwania, który otwiera go niezależnie od tego ustawienia. | shorten |
| am_setup_body | Everything you write is encrypted. You can change how your journal opens later in Settings. | Wszystko, co zapisujesz, jest zaszyfrowane. Sposób otwierania dziennika możesz później zmienić w Ustawieniach. | shorten |
| dbr_body | This journal opened without a passphrase. This browser or device has lost its local key. engender cannot recover that key, so this copy cannot be reopened. | Ten dziennik otwierał się bez hasła. Przeglądarka lub urządzenie utraciły jego lokalny klucz. engender nie może go odzyskać, więc tej kopii dziennika nie da się już otworzyć. | shorten |
| dbr_body_recoverable | This journal opened without a passphrase. This browser or device has lost its local key. engender cannot recover that key. Your recovery key can still open this journal. | Ten dziennik otwierał się bez hasła. Przeglądarka lub urządzenie utraciły jego lokalny klucz. engender nie może go odzyskać. Klucz odzyskiwania nadal może otworzyć ten dziennik. | shorten |
| lock_after_no_secret | Your journal opens without a lock. Pick another way above to change that. | Otwieranie dziennika bez blokady. Żeby to zmienić, wybierz wyżej inny sposób. | keep |
| lock_after_no_secret_setup | Your journal opens without a lock. You can change that later in Settings. | Otwieranie dziennika bez blokady. Możesz to zmienić później w Ustawieniach. | keep |
| lock_after_no_secret_setup_title | Lock off | Blokada wyłączona | keep |
| lock_after_note_five_minutes | Your journal locks after 5 minutes away from the app. | Blokada po 5 minutach poza aplikacją. | keep |
| lock_after_note_immediately | Your journal locks as soon as you leave the app. | Blokada gdy tylko wyjdziesz z aplikacji. | keep |
| lock_after_note_one_minute | Your journal locks after a minute away from the app. | Blokada po minucie poza aplikacją. | keep |
| lock_after_sub_five_minutes | locks after 5 minutes away | Blokada po 5 minutach | keep |
| lock_after_sub_immediately | locks as soon as you leave | Blokada gdy tylko wyjdziesz | keep |
| lock_after_sub_one_minute | locks after 1 minute away | Blokada po 1 minucie | keep |
| lock_after_sub_restart | locks only when the app restarts | Blokada dopiero po ponownym uruchomieniu | keep |
| lock_after_title | When your journal locks | Kiedy dziennik się zablokuje | keep |
| ob_lock_title | When should your journal lock? | Kiedy dziennik ma się zablokować? | keep |
| rk_active_body | Your recovery key can't be shown again. If you're not sure you still have it, replace it. | Klucza odzyskiwania nie da się pokazać ponownie. Jeśli nie masz pewności, czy nadal masz zapisany klucz, wymień go. | shorten |
| rke_mistyped | Check the recovery key for missing or mistyped characters. | Sprawdź, czy w kluczu odzyskiwania nie brakuje znaków albo nie ma literówki. | shorten |
| rkn_offer | This journal has no recovery key. A recovery key is 25 characters you keep somewhere else. It opens the journal if you cannot use your passphrase or PIN. | Ten dziennik nie ma klucza odzyskiwania. To 25 znaków, które przechowujesz osobno. Pozwalają otworzyć dziennik, gdy nie możesz użyć hasła ani PIN-u. | keep |

## Behaviour trace

`accessModeHasSecret` enables timing for passphrase, PIN, web biometrics and
Android’s device-bound screen-lock check. Web device-bound and Android unlocked
modes have no second prompt and no timing choices. `watchLeave` measures time hidden
or native Recents departure, not desktop blur. Immediate locks on departure; minute
and five-minute timings lock on return after the chosen absence; restart adds no
mid-session lock. Copy changes no availability, duration, selection or prompt rule.

The recovery key wraps the same data key, so changing the opening mode does not
invalidate it. It cannot restore missing journal data or open an archive. Archives
have their own passwords and restore only their saved contents. PIN platform risks,
10,000 candidates and about five seconds on a fast graphics card remain explicit.
Android screen-lock removal destroys the device key. Recovery can still open data
that remains when a recovery wrap exists. No wording promises restoration of a lost
phone or cleared browser/app storage.

Recovery creation shows the secret once. Departure drops its displayed characters
but leaves the key active. Replace overwrites the recovery wrap immediately; remove
revokes it immediately. The already open session retains its data key. Copying on
Android asks the keyboard to avoid clipboard history and clears the still-matching
clipboard after a minute or on return. Web copy makes no such promise. All controls,
alerts, accessible digit counts and interpolation contracts stay intact.

## Rendered evidence

[07-rendered.json](07-rendered.json) records actual Chromium captures, laid-out text,
controls, radio-group names and live feedback. Screenshots remain in
`.claude/access-copy07-shots/` in the main checkout after worktree removal.

The app’s real demo journal supplies Settings, all timing summaries, lock-off,
passphrase change, its recovery offer, key creation, one-time display, departure,
active-key state, replacement/removal confirmations, permissions and onboarding.
Passphrase change and key creation use the real writes. A presentation-only access
mode override selects the unlocked and new-install timing branches; it does not
claim that those overrides test encryption. The onboarding check counts visible
intro text, not hidden duplicates.

Existing gate fixtures mount the real components with boot states, platform/PRF
availability stubs and real recovery wraps. They cover the biometric consequence,
Android no-lock, cancellation and invalidated-key states with/without recovery,
device-key loss with/without recovery, mistyped recovery-key alert and all three
mid-session timing notes. Invalid recovery entry goes through the real checksum
validation. The fixture does not emulate Android’s authentication dialog.

Both locales run at a 390px viewport and CSS zoom 1 and 2. Zoom is reapplied after
each navigation. Final screenshots scroll changed explanations into view; transient
toasts are recorded separately before being hidden for screenshots. Long screens
remain scrollable; viewport screenshots do not contain every line at once. JSON
retains the whole laid-out text and control state.

Limits: CSS zoom checks layout reflow, not OS font scaling or pinch zoom. No physical
Android authentication, clipboard-history inspection, screen-reader session or
human Polish review was performed. Palette/theme combinations were not exhausted;
this patch changes no styling or theme tokens. Unchanged permission rows report
narrow label containers at 200% zoom. That layout needs a separate UI fix; permission
wording and controls were retained. The screenshot and measured overflow remain in
the evidence, without calling the whole permissions screen a fit pass.

## Verification

Browser servers were closed before the final build, type, full-test and copy checks.
Build passed; typecheck found zero errors and zero warnings. Targeted security tests
passed 59 tests. Copy checks passed serializer order, paired keys, literal ratchet,
gender-neutral address and caller coverage. [07-contracts.json](07-contracts.json)
records 762 locale checks and 50 generated plural calls across counts 0, 1, 2, 5 and
1.5. No parameter, declaration, selector or plural branch changed.

The first full suite included the preserved author working values: 6,628 tests
passed and one failed. `safe_space_counterevidence_sub` in Polish is the unchanged
local author edit `Dni oznaczone jako dobre lub ulubione`, without terminal
punctuation, which `screen-subtitles.test.ts` requires. It belongs to another flow
and stays untouched. Ticket-only catalogue changes were then checked separately.
A sandbox run rejected nested Git fixture processes with EPERM; the rerun uses the
same network-enabled environment as the first full suite. The ticket-only rerun
passed 6,629 tests in 497 files.

Initial sandbox generation could not fetch the configured Inlang plugin and wrote
empty messages. Its private cache was moved aside and regeneration succeeded with
network access. The Svelte analyzer’s existing route/effect findings concern caller
code unchanged by this catalogue-only patch.

Main advanced to `99c2e4be` during work. Its diff changes three browser/hosting test
scripts and no reviewed caller or catalogue. Latest CI run `37130163278` has passing
Node/catalogue/licence and Android jobs; walkthrough and built-guard jobs failed.
This ticket’s recorded local checks provide its proof. Human Polish sign-off stays
open.
