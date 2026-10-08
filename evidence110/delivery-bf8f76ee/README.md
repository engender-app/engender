# Delivery refresh

Root reported both fresh Luna review axes passed candidate `104f2dd1d0cbdc2e211a24f9b41cd8840a09bb82`. Delivery `bf8f76ee` was then merged into that candidate, preserving the reviewed commit. The combined source is merge commit `f228b1002a4319b1575c7bba52607d59042a7103`. No further product or probe source edits were made.

The demo build completed for both locales and wrote release `0.0.0-dev+gf228b100`, retained in `release.json`. Final checks ran after the complete build:

- `check-final.log`: zero errors and warnings.
- `node-final.log`: 565 files and 7,314 tests passed.
- `focused-final.log` and [focused report](focused-final/report.json): both normal-motion themes retain 13 intermediate heights, with a largest downstream step of 11.296875px. Measurement units and Reminders & prompts agree. Scroll remains 1456 throughout each capture.
- Both reduced-motion controls retain their intentional 29.50px cut. Enter, Space, accessible naming, retained focus and saved explicit choices pass in all four cases.

Full compositor casts, frame indices, milliseconds, geometry samples and layout screenshots remain under `focused-final/`. Painted light frame 005 at 158ms and dark frame 005 at 157ms confirm the explanation is still being covered while the following rows settle.

The initial Node run overlapped the sequential locale builds and failed six module-preload-hold assertions while their manifests and documents were being replaced. That run is retained as `node.log`; its post-build rerun passed. The earlier focused run also passed, but `focused-final/` is the post-build sign-off. Raw terminal streams are archived in `raw-logs.tar.gz`; readable logs normalize trailing whitespace and blank lines at EOF only.

Root filed the independently reproduced 195px Settings clipping as ticket 117. Its paired clean-base and candidate evidence remains in `../narrow-layout/`; this refresh does not change that layout.

Owned browser and server processes were stopped. Issue status, integration and phone state were not changed.
