# Guard scheduling measurements

The guard runner assigns the longest measured guard first, then puts each
remaining guard in the group with the lowest projected duration. A group's
projection includes each required build once. The runner executes the selected
guards in roster order, so the production build cannot replace the demo bundle
until that job's demo guards finish. Separate hosted jobs own their checkout,
build output, fixture files and browser storage.

`guard-durations.json` records the observed attempts, their sum in seconds, and
their source. The estimates include failed attempts and recovered retries. A new
guard needs a duration before it can enter a hosted shard; missing measurements
fail selection instead of silently omitting coverage. The roster test compares
the union of the actual workflow groups with the complete roster, including
multiplicity.

## Before

[Checks run 37188235861](https://github.com/engender-app/engender/actions/runs/37188235861)
checked revision `3dfa9cdfe2922dcdfd9e14d577eb4301ff05d071` on Ubuntu 24.04.
It finished with a failed cold-screen guard, so these timings are not a claim of
passing verification.

| Job | Setup before guards | Guard step, including builds | Whole job |
| --- | ---: | ---: | ---: |
| dev 1/1 | 37s | 968s | 1008s |
| built 1/2 | 83s | 1214s | 1298s |
| built 2/2 | 44s | 1804s | 1851s |

The two demo builds took 70.74s and 67.11s. The production build took 64.63s.
Those values are the first guard's total duration minus its attempt durations.
Scheduling rounds the demo cost up to 71s and production to 65s. Setup includes
checkout, Node, npm install, Chromium, and, for built guards, media fixture tools.

The workflow took 31m36s from creation to the aggregate job's completion, with
110.90 summed runner minutes. The three guard jobs consumed 69.28 runner minutes.
Initial queue time was 2-4s. The walkthrough alone took 18m03s.

## Build reuse decision

Each group builds its own bundle. Sharing a demo artifact could avoid five of
six demo builds, at most 355 runner seconds at the measured rounded cost. It
would not remove the producer's 71s build from the path to the last guard result.
Consumers would also wait for the producer's checkout, npm install, upload and
artifact download. No measured transfer time demonstrates a wall-clock saving,
so this change does not add that dependency. This leaves about six runner
minutes of possible build savings for a separate measured experiment.

The production guards still receive a production build. The walkthrough's
version override is not reused. Every guard job keeps full history and tags;
`scripts/app-version.mjs` remains the version source for its own revision.

## Candidate

CI uses three dev groups and six built groups on the existing runner type.
The additional jobs repeat setup and demo builds; runner minutes can rise even
when the longest guard group gets shorter. Hosted results must be compared with
the baseline above before calling the scheduling change accepted.

The source roster also contains guards absent from the earlier run. The latest
main run, [37221482998](https://github.com/engender-app/engender/actions/runs/37221482998),
checks `90dac6f01321d116424b06f457acdb2737be95e3`. It supplies current dev timings
and the two production guard timings. Its demo build fails because release
metadata scans the former worker asset directory. The prerequisite repair reads
the shared asset directory and still matches the database binary by bytes.

Four built guards use local seed measurements because that hosted run never
executed them: dose save 13.09s, entry editor return 104.07s, calendar month
accessibility 84.11s, and chart accessibility 130.07s. All passed locally. These
numbers do not prove hosted runtime; their provenance is separate in the JSON.
The complete candidate roster has 74 guards, compared with 68 in the older
baseline. The coverage test compares the candidate roster with its own workflow,
so the additional six guards are not lost in a historical comparison.

| Projected group | Guard attempts plus required builds |
| --- | ---: |
| dev 1/3 | 241.78s |
| dev 2/3 | 239.59s |
| dev 3/3 | 240.36s |
| built 1/6 | 621.91s |
| built 2/6 | 626.13s |
| built 3/6 | 626.08s |
| built 4/6 | 624.04s |
| built 5/6 | 624.02s |
| built 6/6 | 627.22s |

These are projections before setup or queue time. They already exceed ten
minutes for built guards; the retained two-attempt cold-screen cost is 539.71s
before its 71s build. More groups cannot split that guard. The earlier
walkthrough's 18m03s also prevents a ten-minute full-workflow claim. Actual hosted
elapsed time, setup costs and summed runner minutes remain required evidence.
