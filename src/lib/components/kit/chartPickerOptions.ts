/* ChartPicker's {value,label} option shape, built from vocabulary.metric's
   key/name pairs - the same remap Stats, Home and the calendar each wrote
   out by hand before ticket 07 gave them one `options` list to share. */
export function metricPickerOptions(
  options: { key: string; name: string }[]
): { value: string; label: string }[] {
  return options.map((o) => ({ value: o.key, label: o.name }));
}
