# Android runner

`npm run test:android` builds and syncs the app, then runs instrumentation on
fresh disposable copies of the AVDs named by `ANDROID_TIER_AVDS` (default
`gd26,tracker35`). Existing AVD data and other connected devices are untouched.
Startup checks the port, watches the launched process, and verifies the unique
disposable AVD name before device operations. Shutdown checks the same identity
and waits for the owned process to exit. Every adb operation selects the owned
serial, and Gradle receives that serial
through `ANDROID_SERIAL`. Choose an unused even port with `ANDROID_TIER_PORT`
(default 5580). `ANDROID_TIER_HEADLESS=1` uses software graphics without Vulkan.

Each run retains invocation logs, stage logs and disposable AVD files in a new
directory under `.claude/android-tier/`. `ANDROID_TIER_LOG_DIR` overrides that
parent directory. XML results are cleared before each invocation. Missing,
malformed or incomplete results fail. A nonzero exit, signal, startup error or
timeout still fails when partial passing XML exists. Optional skips print SKIP.

Gradle removes the packages after the bulk run, so the runner reinstalls both
built APKs before the PIN-wait exercise. The exercise runs on each emulator:
seed, force-stop, confirm
that the app process is absent, restore, then cleanup. No reinstall or state
reset occurs between seed and restore. Restore requires a different process
ID and process token, the same boot, and the exact persisted elapsed deadline.
Raw stage success requires one started and completed test plus the terminal
instrumentation result. Stage skips and failures fail the command. Process logs preserve the IDs,
tokens and remaining delay.

Parser and invocation regressions run in the Node tier through
`tests/android-tier/instrumentation.test.ts`.
