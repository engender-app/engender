/* The attributes a surface needs to wear a flag stripe, written once
   rather than in each of the seven components that take a role.

   Two things go on, together, always - `{...roleAttrs(role)}` is the whole
   of opting a surface in, on purpose (phase 5 ticket 32.8): kit.css derives
   what a role actually paints with from `[data-kit-role]`, so a surface that
   sets the inputs but not the attribute got them and nothing else, which
   looked like a colour bug and was a custom property nobody defined
   (ticket 23's `/timeline`). `data-kit-role` is unconditional - present even
   with no role, so kit.css's own accent fallback still runs for an
   uncoloured area - and the three custom properties are the style, present
   only when a role is.

   --role is the stripe itself, which the tints and the fallback ink in
   kit.css are derived from; --role-ink-in is the version small text is
   written in; and --role-mark-in is the version a chart line, a bar, an
   icon or a display number is drawn in, which stays closer to the flag
   because those answer to 3:1 rather than 4.5:1.

   --role-fill-ink-in is the fourth, and it is the one a label written on
   top of a fill takes. --role-ink-in will not do there: it is proven
   against the surfaces and the two tints a role paints, never against the
   stripe itself, and 59 of the 66 stripe/theme pairs the eight flags hold
   put it below 4.5:1 on their own stripe. On trans's dark theme the ink for
   the blue band is the blue band, so a label in it is not dim, it is gone. Rather than compute a second ink here, it is the one
   the role's heat ramp already carries for its deepest step - that step's
   fill is the stripe itself, and every step of that ramp is held to 4.5:1
   by tests/kit-roles.test.ts. A calendar cell and a bar are the same
   problem: a number written on the flag's own colour.

   A surface that only inherits a role rather than taking one of its own -
   ListRow inside ListCard, Tile inside TileGrid - needs none of this: the
   values kit.css derives are custom properties too, so they inherit down
   from whichever ancestor called roleAttrs() the same way the raw inputs
   do. */
import type { Role } from '$lib/theme/roles';

export function roleAttrs(role: Role | undefined): { 'data-kit-role': ''; style?: string } {
  if (!role) return { 'data-kit-role': '' };
  /* The ramp's deepest step is the stripe undiluted, which is what a fill
     paints, so the ink that step carries is the ink a label on a fill takes.
     flagRoles() builds every ramp from the same five steps, so the last one
     is always there. */
  const onFill = role.heat[role.heat.length - 1].ink;
  return {
    'data-kit-role': '',
    style: `--role: ${role.stripe}; --role-ink-in: ${role.ink}; --role-mark-in: ${role.mark}; --role-fill-ink-in: ${onFill}`
  };
}
