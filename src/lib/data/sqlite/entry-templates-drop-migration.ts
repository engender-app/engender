/* Version 123 (pre-release-human 18, bug-session item 34): entry templates
   are removed as a feature.

   The three tables go with every template a person saved: nothing else
   reads them. Entries written from a template stay as they are, because an
   entry never held a link back to the template it started from. The tables'
   deletion triggers die with them; the rows the log kept for an archive
   Merge go too, since no archive section names them any more. */

export const ENTRY_TEMPLATES_DROP_VERSION = 123;

export const ENTRY_TEMPLATES_DROP = `
DROP TABLE entry_template_dimension_value;
DROP TABLE entry_template_tag;
DROP TABLE entry_template;
DELETE FROM deletion WHERE tbl = 'entry_template';
`;
