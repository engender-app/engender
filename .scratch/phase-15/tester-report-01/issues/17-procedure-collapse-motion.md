# 17 - Keep procedure content inside its collapse

Status: ready-for-agent
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
