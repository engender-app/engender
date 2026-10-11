# 16 - Show progress while adding a document

Status: resolved
Size: M
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Adding a document takes about a second with no visible response. Show a busy state from the first tap until the document is ready or the operation fails, so someone knows the tap worked.

## Acceptance

- [ ] The add control gives immediate feedback during a slow document save and prevents duplicate submissions.
- [ ] Success clears the busy state and shows the new document. Failure clears it and leaves a usable retry path without a partial duplicate.
- [ ] Check screen reader announcement, cancel or back behavior and a fast save that must not flash an obsolete indicator.

Source: 11 October recording at 18:46.

## Comments

Orchestration report 2026-10-11T22:44:52.393882+00:00

Issue: phase-15/tester-report-01/16. Model: gpt-6.1-sol. Result: success.
Started: 2026-10-11T22:31:29.909369+00:00. Finished: 2026-10-11T22:43:13.816158+00:00.
Merge: merged.  Merge commit: d224a8eeaf7dc963eb6dc3f66f790aad41da7e1b.
Tests: ["build: PASS npm run build through heavy build gate", "check: PASS npm run check through heavy check gate: 0 errors, 0 warnings", "test: PASS npm test through heavy check gate: 580 files, 7538 tests, 27.25 seconds; full suite run once", "copy: PASS npm run check:copy: no new literals, no gendered Polish copy, no unused keys", "guard: PASS node tests/document-import-check.mjs through guards gate: 9 PASS groups", "gallery: PASS node tests/document-import-check.mjs --gallery through gallery gate: 186 captures, including 32 saving palette/theme captures", "svelte-autofixer: PASS both edited Svelte components: no issues; suggestions concern existing rowsSettled/guard effects", "diff-check: PASS git diff --check", "worktree: clean", "Luna Standards: zero findings", "Luna Spec: zero findings"]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-tester-report-01-delivery/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration", "--feature", "phase-15/tester-report-01", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test"]].
Branch: orchestrate-agent/d956a2264d3c/16. Shipped tip: a981b1bb4692946a6182e4b5de619bf1942ba9f4. Commits: a981b1bb4692946a6182e4b5de619bf1942ba9f4.
Unblocked: none. Proposals: [].
Copied inputs: ["AGENTS.md", "SCREENS.md", "CONTEXT.md", "PRODUCT.md", "docs/agents/platform.md", "docs/agents/issue-tracker.md"].
Heavy commands: [{"command": ["node", "tests/document-import-check.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["npm", "test"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/document-import-check.mjs", "--gallery"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 14.013275632998557, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-5f783b51f088", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/m-5f783b51f088", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "tests/document-import-check.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/final-audit-integration/.claude/worktrees/o-d956a2264d3c", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
