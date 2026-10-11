# 12 - Restore the support link above About

Status: ready-for-agent
Size: S
Model: gpt-6.1-sol
Type: bug
Blocked by: None
UI: yes

## What to build

Settings currently omits its support row because its old Ko-fi destination is empty. Show a row immediately above About that opens `https://buymeacoffee.com/engender`. The visible label and accessible name must describe Buy Me a Coffee, not Ko-fi.

## Acceptance

- [ ] Support row appears above About in English and Polish and opens the supplied URL through an external link.
- [ ] No Ko-fi label, empty destination or misleading coming-soon state remains. The row works at 390px and with keyboard and screen reader navigation.
- [ ] Update existing assertions that intentionally expected the absent Ko-fi row.

Source: 11 October recording at 18:30; destination supplied during intake.
