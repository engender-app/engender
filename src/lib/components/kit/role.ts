/* The two custom properties a surface needs to wear a flag stripe, written
   once rather than in each of the seven components that take a role.

   Both go on: --role is the stripe itself, which the tints and the fallback
   ink in kit.css are derived from, and --role-ink-in is the legible version
   the theme actually writes with. */
import type { Role } from '$lib/theme/roles';

export function roleStyle(role: Role | undefined): string | undefined {
  return role ? `--role: ${role.stripe}; --role-ink-in: ${role.ink}` : undefined;
}
