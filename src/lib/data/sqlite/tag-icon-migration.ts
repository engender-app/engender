/* Version 125 adds an icon name to a tag.

   The name of a Lucide icon from the curated set in tagIcons.ts, never its
   path data, so a later release can redraw an icon without rewriting a
   journal. Only a person's own tags write it: a built-in's icon comes from
   the map in tagIcons.ts, so it can change in a release too. NULL is "no
   icon", what every tag already in a journal starts with. */

export const TAG_ICON_VERSION = 125;

export const TAG_ICON = `
ALTER TABLE tag ADD COLUMN icon TEXT;
`;
