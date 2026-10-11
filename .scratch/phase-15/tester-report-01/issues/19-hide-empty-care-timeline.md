# 19 - Omit the Care timeline until it can draw

Status: ready-for-agent
Size: S
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

An empty Care journal currently shows a notice saying the line will start after a dose, lab result or stock count. The tester wants no axis warning when no axis exists. Leave that timeline area absent until there is content to draw, while other Care content remains usable.

## Acceptance

- [ ] With no dose, lab result or stock count, the timeline and its empty notice are absent. Other Care sections and their entry points remain visible.
- [ ] Adding the first qualifying record reveals the timeline without a one-frame jump. Removing the last record returns to the empty state cleanly.
- [ ] The change does not hide a running regimen or another Care reading that exists without a timeline mark.

Source: 11 October recording at 18:51.
