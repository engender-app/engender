# 17 - Keep procedure content inside its collapse

Status: resolved
Size: M
Model: gpt-6.1-sol
Type: bug
Blocked by: None
UI: yes

## What to build

When a procedure closes, part of its content stays visible outside the closing panel and disappears later. Make the whole procedure withdraw together, with no delayed pop after the fold has finished.

## Acceptance

- [ ] Consecutive painted frames show every child content block moving or fading with its procedure during collapse. Nothing remains visible outside the closing bounds.
- [ ] Reopening, rapid repeated toggles and multiple procedures leave the correct one open and preserve its data.
- [ ] Check web and Android, reduced motion and screen reader state after the panel closes.

Source: 11 October recording at 18:47.

## Comments

Orchestration report 2026-10-11T21:52:43.118796+00:00

Issue: phase-15/tester-report-01/17. Model: gpt-6.1-sol. Result: success.
Started: 2026-10-11T21:34:29.280471+00:00. Finished: 2026-10-11T21:50:20.508469+00:00.
Merge: merged.  Merge commit: f5fa34434c8c5220671fbd05e52c1df82bb61c83.
Tests: ["Web four-mode matrix passes; two logs966.66/1404.94px reach0whileconnected, no escaped child paint", "Normal modes17travel/9fade samples with17/18paintedframes; reducedmodes0travel/2frames", "Rapid switches, reopening, saveddata, unsavedguard and ariaexpanded/controls pass", "Demo build and sveltecheck0errors/0warnings;16focusedNodepass", "Final productionbuild/check/fullNodepending integration refresh", "Androidunverified:shareddeviceoccupied", "Luna Standards:zero findings", "Luna Spec:no code findings;Android acceptance evidence still missing", "Final refreshed source productionbuildPASS, check0errors/0warnings, Node580files/7539testsPASS"]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test"]].
Branch: orchestrate-agent/81eb06530f83/17. Shipped tip: facc3c3108e2fc4ce18c28c43d156e21c7653b66. Commits: 93eb07bcd9c930cb4cd7b84ed5c648f149ef1d9a, 1f38644c120fbfeed55bfa057de88e692943ae86, b0cdeee3853d6dcd9170c2be23aa0ac2b98313ef, 3985e1270955bb079b7a18118e40656314241e92, f8747f2642efd925015c41f2026cc8cc237673d3, 88112d2abfdeff770a8326e1893aaaa1fefc7628, 1eaa0dc917b1bbbdcecaa5b3d05a6131f3b1265f, b2160b0a8b70e56e52bbf7c06a2241a992a96b08, 2dcc0ac220d132d8ea84129ef86a01b60d1f7e5d, 651f2feb6b9fd0bb3060b699cc631e96c12eadd4, facc3c3108e2fc4ce18c28c43d156e21c7653b66.
Unblocked: none. Proposals: [].
Copied inputs: ["AGENTS.md", "SCREENS.md", "CONTEXT.md", "PRODUCT.md", "docs/agents/platform.md", "docs/agents/issue-tracker.md"].
Heavy commands: [{"command": ["env", "VITE_DEMO=1", "npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/procedure-collapse-motion.mjs", ".claude/ticket17/disclose"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/procedure-collapse-motion.mjs", ".claude/ticket17/after"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-9bb7d41d7a4a", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["env", "VITE_DEMO=1", "npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/procedure-collapse-motion.mjs", ".claude/ticket17/before", "--baseline"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "test"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["env", "VITE_DEMO=1", "npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-81eb06530f83", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-9bb7d41d7a4a", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
