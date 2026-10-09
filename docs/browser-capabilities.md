# Browser capability verification

Run the browser matrix against the emitted application. The runner uses
Chromium, Firefox and automated WebKit through Playwright. WebKit results
are engine evidence. Actual desktop Safari and an installed iOS PWA remain
unverified; Apple hardware is not a prerequisite for this matrix.

## Run

Install the browser binaries matching `playwright-core` first. Keep the
existing `CHROMIUM_PATH` override for Chromium. `FIREFOX_PATH` and
`WEBKIT_PATH` optionally select an executable for their respective engines.
A missing executable produces `not-run` results and a nonzero exit code.

```sh
npm run build
npm run verify:capabilities
npm run verify:capabilities:lifecycle
```

The production tier reuses release verification and adds storage failure,
competing-tab, biometric, media and manual Archive checks. It also runs the
existing unlock and update probes against real encrypted drivers. Their
individual results state whether execution used a production build, a demo
build or a development probe. The schema-recovery probe observes controller
takeover and the automatic navigation request while offline, then verifies
the recovered page and unchanged encrypted fixture after connectivity
returns. Production cold offline startup is
verified separately. The lifecycle tier reuses the actual BFCache
restoration guard with a journal created and saved through production UI.
The standalone guard keeps its existing demo default. Both tiers are required.
During orchestration, run each build and matrix through the existing heavy
command gate with the corresponding `build` or `guards-built` loop.

`CAPABILITY_ENGINES=firefox` limits a rerun to Firefox. The default is
`chromium,firefox,webkit`. Set `CAPABILITY_OUTPUT` to select an evidence
directory; otherwise each run creates a timestamped directory under
`.claude/browser-capabilities/`. Keep earlier failed runs when rerunning.

Each directory contains `matrix.json`, raw process logs and detailed
production case results. The matrix records the source revision, tracked
changes, emitted release metadata, OS and browser versions, execution mode
and evidence for each capability. `pass`, `unsupported`, `fail` and
`not-run` stay distinct. A process that stops early leaves the unexecuted
cases as `not-run` rather than counting them as passes. Timeout, signal,
startup and exit-code failures remain invocation failures even when earlier
cases wrote passing results. Reusing an output directory is refused.

## Evidence boundaries

The encrypted reopen case writes through the app, reloads, authenticates
again and reads the saved note. The release-shell case additionally closes
and restarts a persistent browser profile offline, with the HTTP server
stopped. WebKit normal flows use independent persistent profiles: the
Linux runtime rejects OPFS in ephemeral contexts. The matrix checks that
private-context refusal produces a handled startup failure and records that
context as `unsupported`, without treating the whole engine as unsupported.
WebKit cold restart does not use Playwright offline emulation because its
offline flag rejects navigation before service-worker dispatch. The origin
server is still stopped, the navigation URL was never served online, and
worker-delivery evidence must pass. Chromium and Firefox additionally use
Playwright offline emulation. Production documents use `serveBuild`,
including the isolation headers and emitted CSP. Optional OCR assets are checked through the
existing release-cache policy.

Persistence denial and an unanswered persistence request are injected to
check that startup and saving still finish. The quota case injects a failed
write at the real database worker boundary and verifies the failure notice,
retained draft and unchanged earlier record after reopening. These faults
prove handling; they do not measure the engine's actual quota or eviction
policy. Removing OPFS from the real worker checks that failed journal
creation never appears as a ready journal. That fault removes the method
from `StorageManager`'s prototype so each runtime wrapper observes it;
service workers are blocked in that context to keep the fault response
out of the shell cache.

Competing tabs share one browser context and storage origin. The second
owner must show a handled startup failure. The first owner remains readable,
and the second can reopen after the first closes. Seamless editing across
tabs is not claimed.

Biometric availability is read from the runtime's PRF and platform
authenticator capabilities and compared with the app's offered controls.
Chromium additionally uses its virtual authenticator to refuse PRF
negotiation and verify that the existing passphrase still opens the journal.
Firefox and WebKit have no equivalent authenticator fixture in this runner;
their successful biometric unlock is not verified.

Media checks import real photo, Opus audio, VP9 video and PDF fixtures through
the app. Playback must advance, images must decode and the PDF must draw
visible ink. Chromium and Firefox use browser synthetic camera/microphone
devices for capture checks. Automated WebKit capture remains `not-run` when
no device fixture exists. Physical camera and microphone hardware are not
verified by these checks.

Manual Archive verification exports the current journal through the UI,
refuses a wrong password without losing the earlier record, then replaces
from that Archive. It reads restored records and opens restored media and
documents. Historical Archive compatibility and recovery into an independent
installation have separate recovery checks; this matrix does not replace
them.

Chromium's CDP manifest/installability audit is recorded separately from
service-worker offline execution. Firefox and WebKit do not expose that
CDP audit and receive `unsupported` for it. That label does not mean their
offline engine checks passed, and neither check proves an OS-installed app.
Actual BFCache evidence requires retained document identity and persisted
`pagehide`/`pageshow` events. A normal history reload cannot satisfy it.
The measured Linux Firefox 155 automation runtime explicitly disables
BFCache in Juggler. Automated WebKit 26.6 also reloads an empty control
document on Back, with a new token and `pageshow.persisted === false`.
Those runtime results leave actual restoration unverified; they do not
establish how stock Firefox or Safari handles the application. Failed
application probes and control logs remain in the evidence.

The BFCache probe keeps raw OPFS conflict messages. A conflict counts as a
handled retry only when its real failed worker response is followed by a
successful open, ready state and a saved record read back after reload from
the same journal. Unmatched console errors and all uncaught page errors fail.
