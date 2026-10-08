# 05 - Apply quiet hours to Android reminders

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit AND-01
Owner: Backend
Size: S
Model: sonnet
UI: no
Blocked by: None

## What to build

Enabled quiet hours must reach Android's reminder scheduler and delay both
ordinary reminders and daily check-ins according to the existing quiet-hours
rules.

## Problem and evidence

The web payload contains quiet hours, but the native plugin reconstructs and
stores that payload without the field. The scheduler therefore receives no
quiet-hours policy and preserves the original alarm time.

The audit passed an enabled 22:00 to 07:00 interval through the native payload
assembly and production time calculation. A 23:00 alarm stayed at 23:00;
the expected result was 07:00 the next morning. This was a JVM boundary proof,
not an on-device notification run.

## Acceptance

- [ ] A regression passes an enabled policy through the actual native plugin
      boundary and catches its omission before the fix. Testing only the web
      payload builder or only time arithmetic is insufficient.
- [ ] A reminder and a daily check-in at 23:00 with quiet hours from 22:00 to
      07:00 are scheduled for 07:00 the next day.
- [ ] Disabled quiet hours and times outside the interval preserve existing
      behavior. Boundary times follow the existing quiet-hours contract.
- [ ] The persisted native payload retains the policy so later rescheduling
      uses it too. Missing or invalid input follows the existing validation
      contract without creating a second interpretation of quiet hours.
- [ ] Relevant native and JavaScript checks pass with the new boundary test
      in the maintained suite. Verify scheduling on an isolated Android test
      runtime and record the actual result and required final checks.

## Comments

2026-10-08: The feature spec links the payload/time proof and its output.
This ticket does not change quiet-hours semantics or notification copy.
