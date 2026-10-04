# 12 - sec: Small hardening

Status: done
Type: build
Audit findings: S-05, S-07, S-08, S-11
Severity: P3
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no (copy only: one clipboard sentence). No `/impeccable` pass.

## Problems and fixes

- **S-05, archive header limits.** `archive/container.ts:244-253` caps
  `memorySize` (512 MiB) and `iterations` (24) but only requires `hashLength`
  and `parallelism` to be positive, and key derivation runs before any password
  check. A hostile `.ttbackup` can hang or crash the tab. Require
  `hashLength === 32` and `parallelism <= 4`; refuse anything else as a corrupt
  archive. Test with a forged header.
- **S-07, PIN throttle and the clock.** `lock/throttle.ts:61-63` computes the
  wait from `Date.now()`; moving the device clock forward clears it. Track
  elapsed time on a monotonic clock within the session as well
  (`performance.now()` on web; `SystemClock.elapsedRealtime()` mirrored from
  native on Android). Test with a faked wall clock jump.
- **S-08, web recovery key on the clipboard.** `recovery-key-clipboard.ts`
  never clears it, and its header comment says only the browser can read the
  browser clipboard, which is false on desktop (clipboard history, cloud
  clipboard, managers). Best-effort clear after 60 s if the clipboard still
  holds the key; correct the comment; change the copy (`en.json:2197` and
  Polish) to say "system clipboard".
- **S-11, Android supply chain.** Add `distributionSha256Sum` to
  `gradle-wrapper.properties`; pin `deploy/self-host/Dockerfile`'s nginx image
  by digest. Gradle dependency verification is optional; note it if skipped.

## Acceptance

- [ ] Forged header with a large `hashLength` or `parallelism` is refused
      before key derivation.
- [ ] A forward clock jump does not shorten the PIN wait.
- [ ] Web recovery key clears from the clipboard after 60 s when unchanged;
      copy says system clipboard in both languages.
- [ ] Wrapper sha256 and image digest pinned; the Android build and the
      hosting check still pass.
