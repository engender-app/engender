/* Apply roleAttrs(role) in one spread. data-kit-role must be present
   even without a role so kit.css supplies its accent fallback.

   --role is the stripe. --role-ink-in gives small text 4.5:1 on the
   surfaces, and --role-mark-in gives marks 3:1. Use --role-fill-ink-in
   for text on the stripe itself. It comes from the deepest heat-ramp
   step and is checked against its own fill at 4.5:1.
   Surfaces without their own role inherit these values from the parent. */
import type { Role } from '$lib/theme/roles';

export function roleAttrs(role: Role | undefined): { 'data-kit-role': ''; style?: string } {
  if (!role) return { 'data-kit-role': '' };
  /* The ramp's deepest step is the stripe undiluted, which is what a fill
     paints, so the ink that step carries is the ink a label on a fill takes.
     flagRoles() builds every ramp from the same five steps, so the last one
     is always there. */
  const onFill = role.heat[role.heat.length - 1].ink;
  /* The edge a chart line is drawn with, only where the stripe needs one:
     kit.css makes a missing edge transparent, so a line whose stripe reads
     by itself is drawn exactly as it was. */
  const edge = role.edge ? `; --role-edge-in: ${role.edge}` : '';
  return {
    'data-kit-role': '',
    style: `--role: ${role.stripe}; --role-ink-in: ${role.ink}; --role-mark-in: ${role.mark}; --role-fill-ink-in: ${onFill}${edge}`
  };
}
