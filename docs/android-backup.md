# Android automatic backups

## Execution and key availability

The foreground page makes an Archive through the existing snapshot and packing
code. Native code can deliver a complete encrypted Archive from private durable
staging. It does not open the journal, unwrap its data key, or derive an Archive
key during delivery. The saved Archive password stays behind the native KDF
bridge described in ADR-0042.

| Access mode and state | Fresh snapshot | Native delivery |
| --- | --- | --- |
| Unlocked mode, page running | Existing open journal | Eligible encrypted stage |
| Device-bound, PIN or passphrase, authenticated page | Existing open journal | Eligible encrypted stage |
| Any mode, page absent or journal locked | Deferred until foreground unlock | Eligible encrypted stage |
| Any mode, no complete encrypted stage | Deferred until foreground unlock | Deferred, no protected reads |

Even unlocked mode uses the foreground Archive codec. This avoids a second
Archive producer and does not add another key wrap or cache an unlock secret.
Snapshot acquisition time is recorded separately from verified delivery time.
A stage belongs to the current configuration generation and due period. Disabling
backups or changing their destination invalidates it. Foreground catch-up replaces
a deferred snapshot with a current Archive after unlock.

## Scheduling

WorkManager owns persistent unique work. Android chooses when it executes;
weekly means seven days and monthly means thirty days after verified delivery.
Ordinary backgrounding, process death and reboot do not cancel pending work.
Doze, battery restrictions and unavailable destination providers can delay it.
Force-stop prevents execution until the package is started again. No exact-time
or force-stopped execution is promised. Disabling backups cancels pending work.

Only encrypted Archive bytes and delivery metadata enter durable staging. Manual,
foreground and native attempts share the native delivery owner. A destination
file is successful only after its length and SHA-256 match the stage. Retention
keeps five recorded app-owned automatic Archives; manual and unrelated files are
not candidates. Earlier Archives and the journal survive failed delivery.

Foreground staging runs once per due period, with one refresh during the final
24 hours if the page is open then. It does not pack a large journal every fifteen
minutes. The native job may deliver an older snapshot when the page has stayed
closed; the settings screen shows its capture time. New journal entries require
the next unlocked foreground snapshot. Ticket 11 must measure this additional
foreground packing cost.

Cold failures are recorded silently. On the next unlocked foreground check, the
existing failure notice policy applies consent, quiet hours and hidden titles.
No notification content or journal preferences are read by the cold worker.
WorkManager 2.10.1 uses the existing Apache-2.0 AndroidX notice and dependency
policy; its runtime graph must pass the Android dependency check.

Native delivery retries at most three times, then waits at least 24 hours before
a new retry window. A fresh foreground snapshot clears that wait. Missing-stage
deferral also retains a daily native check. WorkManager completion means the
policy step finished; only the separately committed verified delivery timestamp
means an Archive reached its destination. Unique enqueue and cancellation finish
durably before the bridge acknowledges settings or staging. A worker appends its
next check rather than cancelling itself, and reuses an existing pending child
when recovering from process death.
