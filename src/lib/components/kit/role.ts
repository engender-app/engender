/* The two custom properties a surface needs to wear a flag stripe, written
   once rather than in each of the seven components that take a role.

   Three go on: --role is the stripe itself, which the tints and the
   fallback ink in kit.css are derived from; --role-ink-in is the version
   small text is written in; and --role-mark-in is the version a chart line,
   a bar, an icon or a display number is drawn in, which stays closer to the
   flag because those answer to 3:1 rather than 4.5:1. */
import type { Role } from '$lib/theme/roles';

export function roleStyle(role: Role | undefined): string | undefined {
  return role
    ? `--role: ${role.stripe}; --role-ink-in: ${role.ink}; --role-mark-in: ${role.mark}`
    : undefined;
}
