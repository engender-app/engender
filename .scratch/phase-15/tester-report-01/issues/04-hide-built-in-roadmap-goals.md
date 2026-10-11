# 04 - Hide and restore individual built-in roadmap goals

Status: resolved
Size: L
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Let someone remove one bundled roadmap goal from their normal list and bring it back later. Hiding is a visibility choice, distinct from marking a goal not part of one's path. Custom goals keep their existing edit and delete behavior. A hidden built-in goal still exists in its country pack.

## Acceptance

- [ ] Hide and restore work for one built-in goal without changing other goals or dismissing its track. A discoverable control shows hidden goals for restoration.
- [ ] Checked or not-part-of-path status, linked milestone and filed documents survive hide, restore, archive export and import.
- [ ] A document linked to a hidden goal still opens the correct goal context. No document or milestone is deleted by hiding.
- [ ] Clarify the distinct terms in the domain glossary and amend the roadmap decision record where the new visibility state changes its stated invariant.

Source: 11 October recording at 18:11:59.

## Comments

Orchestration report 2026-10-11T18:54:57.416035+00:00

Issue: phase-15/tester-report-01/04. Model: gpt-6.1-sol. Result: success.
Started: 2026-10-11T18:35:40.302976+00:00. Finished: 2026-10-11T18:53:02.901034+00:00.
Merge: merged.  Merge commit: 97afd6ea25f19bc88afdbf50b45660f4fb9de77b.
Tests: ["npm test: 579 files, 7520 tests passed", "Gated demo build: passed", "Gated npm run check: 0 errors, 0 warnings", "Browser hide/reload/source-link/restore: passed", "Polish 195px check: passed", "Gallery: 33 captures across 16 palettes and two themes", "Copy, screen-class and diff checks: passed", "Standards review: pass, 0 findings", "Spec review: pass, 0 findings"]. Integration checks: [["npm", "ci", "--prefer-offline", "--no-audit", "--no-fund"], ["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test"], ["python3", "-c", "import shutil; shutil.rmtree('node_modules')"]].
Branch: orchestrate-agent/d7375c03e466/04. Shipped tip: 94cd7fe7003bfcfb270d2594f6c6f4f2c606ad13. Commits: 50d8a76ad2033d3ad277b971c8bec1f096b64828, be0e0887b7b7118b9988999555c9360b708dbc59, 94cd7fe7003bfcfb270d2594f6c6f4f2c606ad13.
Unblocked: none. Proposals: [].
Copied inputs: ["AGENTS.md", "SCREENS.md", "CONTEXT.md", "PRODUCT.md", "docs/agents/platform.md", "docs/agents/issue-tracker.md"].
Heavy commands: [{"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 2.0078631329997734, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/roadmap-goal-visibility.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/roadmap-goal-visibility.mjs", "--gallery"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["node", "tests/roadmap-goal-visibility.mjs", "--polish", "--zoom"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-0abe7d2a7efe", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["env", "VITE_DEMO=1", "npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-0abe7d2a7efe", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/roadmap-goal-visibility.mjs", "--gallery"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 4.007572352998977, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d7375c03e466", "wait_seconds": 10.012535816997115, "gate_off": null, "exit_code": 1}].
