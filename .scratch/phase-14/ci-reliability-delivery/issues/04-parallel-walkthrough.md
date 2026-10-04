# 04 - Run walkthrough groups with isolated journal state

Status: ready-for-agent
Size: L
Model: gpt-6-astra
Blocked by: None
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** The walkthrough runs in independently initialized parallel groups, so the current 18-minute passing job can become shorter without losing user-flow assertions or depending on another group's journal mutations.

Identify each group's required starting state before splitting the continuous walkthrough. Keep intentional sequences together and establish prerequisite state explicitly for other groups. Use the existing flow selection and reporting mechanisms where they fit. Include actual CI scheduling and aggregate reporting in this slice, rather than landing fixture infrastructure with no usable parallel execution.

- [ ] Every existing flow and assertion remains covered, and intended behavior across a sequence of flows remains exercised.
- [ ] Each group starts from explicit synthetic journal state and passes when run independently; another group cannot supply hidden prerequisite mutations.
- [ ] Concurrent groups isolate storage and mutable outputs, and use the correct walkthrough build and version identity.
- [ ] All groups execute in hosted CI and contribute to the required aggregate result. One failed group does not cancel independent groups.
- [ ] Hosted before-and-after evidence includes group durations, elapsed time and summed runner minutes. No assertions, data scale or required cases are removed for speed.
- [ ] Keep changes limited to walkthrough initialization, grouping and execution. Do not refactor unrelated flows or application behavior.
- [ ] Merge independently under current rules; preserve already merged workflow changes and leave gate activation for the final ticket.
