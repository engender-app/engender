# 34 - a11y: Controls reach the 48 px floor, and navigation survives large text

Status: ready-for-agent
Type: bug
Audit findings: A10 (chips and segmented), A11, V13 (accessibility audit, 30 September 2026)
Severity: P2 in the accessibility audit; V13 P3; wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A10.** Entry tag and presentation chips are about 40.5 px high; some segmented options about
38.5 px wide. Passes WCAG 24 px, misses the project floor.

**V13 (moved here from ticket 19).** Letters calendar and delete icons 36 x 36; Milestones era
rail 20 px wide; Settings unit toggles (cm 28 x 48, in 20 x 48) and theme (Light 43 x 48, Dark
41 x 48); Wear chips (7d 39 x 48, femme 77 x 41, androgynous 119 x 41); clinician summary
"4 mg" link 35 x 48.

**A11.** At Android font scale 2.0 the bottom navigation labels truncate to "Jour...", "Loo...",
"Tran..." (`android-native-text-200.png`); names stay in the accessibility tree.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Fix hit areas on the shared kit styles (chip, segmented control, icon button), with
  `::after` extensions where the visual size must stay; check every consumer.
- A large-text navigation layout that keeps full names (stacked labels, icon-only with a visible
  label row, or fewer words); decide on render.

## Acceptance

- [ ] Every listed control meets 48 px/dp at 320 and 390 px, with no overlap and no lost labels
      at 200% text.
- [ ] At Android font scale 2.0 all navigation names are legible in full.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.

## Comments

Stopped at the user's request on 2026-10-04 at 17:35 UTC. Ticket remains
incomplete; do not merge its implementation or mark acceptance complete.

Preserved worktree:
/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-b72ebde47027
Branch: ticket-34-a11y-targets-and-large-text
Source SHA: 6ba77f4c18338b75c6ff6d7baf3270d7e8d0d96c
Source and tests are committed. No uncommitted source changes remained
before this stop note. No source fixes or reviews continued after stop.

Evidence: .claude/review-34/ in that worktree. Production build passed at
47acbe072c4161dc12849385bf78a8edb0901691. Later commits change two tests
only; production-subtree-equivalence.json proves identical src, messages,
static, package and configuration objects at the preserved source SHA.
Final typecheck: 0 errors, 0 warnings. All seven Svelte autofixer analyses
completed. Focused Node motion checks: 50 passed after the recorded
top/bottom allowlist RED. Corrected nested-era baseline: eight completed
captures, real 20px overlapping targets, component bytes verified against
4e83245f6c44d71e5720b9c07e204e3d892030eb.

Earlier evidence covers the original implementation: 153 scoped web
checks, eight after nested-era checks, 6685 Node tests, copy/classes checks,
and 152 native scenes, including 76 after scenes. Actual TalkBack was
bound; native settings were restored. APK hashes verify 703 web assets
per original APK, including the two documented gzip decompressions.
history-repair.json proves the earlier commit-message repair preserved
source trees. These checks do not establish final motion-commit closure.

Independent Standards review covers the preserved source SHA: zero open
manual violations, zero smells, zero open tooling findings. Review stays
open for final full/browser/native evidence. Independent Spec review:
zero production findings, one P2 visual-proof finding still open. Original
era motion captures were blank. Viewport RED reproduced this; the fixed
overlay and legacy baseline selector remedies are committed, but visible
opening/closing recapture has not passed. Blank evidence remains under
iterations/blank-era-frames. The last baseline-motion run timed out on the
old missing data attribute; 6ba77f4c fixes that selector without changing
the pinned component. Resume must verify this fix.

Resource limitation: light-browser.py counted launcher sessions, missing
detached Chromium descendants. Earlier RSS peaks cannot establish the
1 GiB cap. Raw runs and resource-guard-limitation.md are preserved. Light
runs remain paused until ownership counting and cleanup are corrected and
independently validated. Normal heavy runs remain valid. No performance
acceptance relies on the light captures. No owned Chrome/Node/esbuild
process survived the completed or stopped light runs.

Stopped queued heavy helper PID 564946, session 70262, before admission;
final-stack-resume.log records the wait. No owned build, browser or native
job remains. No light reservation remains. emulator-5568 is absent; the
focused final native runner never started. The physical phone and real
application package were untouched. Peer processes were not terminated.

Remaining acceptance: visible four era motion pairs; all eight final
navigation/segment recordings; expanded EN/PL 100/200% compact-consumer
sweep; final 153-case web/keyboard/scoped axe matrix; exact original-audit
before/after attribution, including clinician print occlusion; full final
Node/copy/classes checks; final APK asset proof and focused native matrix;
updated gallery/audit/polish records; both final review closures and human
visual sign-off. Existing gallery/index.html is provisional.

Resume only after the user asks. From the preserved worktree:
python3 /home/alice/_projekty/priv/gender-diary/.claude/orchestration/phase14-no-ui-20261003/heavy.py -- bash .claude/review-34/final-stack.sh
The scratch stack resumes baseline motion onward and includes final
browser, original audit, full Node, copy/classes, APK and owned-emulator
checks. Preserve successful build/typecheck/autofixer/baseline records.
After completion, run assess-final-proof.py and make-review.mjs from the
same evidence directory, inspect frames, then update independent reports:
review-final-standards.md and review-final-spec.md. Reviewer task IDs:
01a107dc-39a3-76b2-bd4f-911d81911f4f (Standards)
01a107dc-3c0c-7930-91f6-76092e941adc (Spec)
Both received STOP. Root owns canonical note copy, integration and merges.
