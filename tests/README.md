# Running tests

Run commands from the repository root.

| Test | Where to look | Command |
| --- | --- | --- |
| Node | [Cross-module suites by area](node/) and `*.test.ts` beside the source | `npm test` |
| Browser | [Browser tier](browser-tier/) and [probe index](PROBES.md) | `npm run test:browser` |
| Browser guards | [Guard scripts](guards/) and [CI roster](guards.json) | `npm run test:guards` or `npm run test:guards:built` |
| Full app walkthrough | [Walkthrough groups](PROBES.md#walkthrough-groups) | `npm run test:walkthrough` |
| Android | [Android tier](android-tier/) | `npm run test:android` |
| Hosting and offline build | [Hosting checks](hosting/) and [browser tier](browser-tier/) | `npm run verify:hosting` or `npm run verify:build` |
| Manual probes | [Galleries, measurements and sweeps](tools/README.md) | Use the command listed for the probe |

On a fresh checkout, install dependencies, build the app, and generate the full message catalogue. The Android signing tests also need JDK 21 and `ANDROID_HOME` set to the Android SDK.

```sh
npm ci
npm run build
npx paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
npm test
```

To run one Node suite, pass its path to Vitest with `npm test -- tests/node/security/csp.test.ts`.
