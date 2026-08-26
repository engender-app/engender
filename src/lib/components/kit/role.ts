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

   A surface that only inherits a role rather than taking one of its own -
   ListRow inside ListCard, Tile inside TileGrid - needs none of this: the
   values kit.css derives are custom properties too, so they inherit down
   from whichever ancestor called roleAttrs() the same way the raw inputs
   do. */
import type { Role } from '$lib/theme/roles';

export function roleAttrs(role: Role | undefined): { 'data-kit-role': ''; style?: string } {
  return {
    'data-kit-role': '',
    style: role ? `--role: ${role.stripe}; --role-ink-in: ${role.ink}; --role-mark-in: ${role.mark}` : undefined
  };
}
