/* Small cross-screen UI state. */

export const ui = $state({
  /** The today/another-day chooser (F1), openable from FAB, rail and Home. */
  chooserOpen: false,
  /** Dev demo bar: 'responsive' uses the real viewport; 'phone' constrains to a 390px frame. */
  frame: 'responsive' as 'responsive' | 'phone',
});
