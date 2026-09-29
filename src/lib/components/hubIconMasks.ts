const masks = import.meta.glob<string>('./hub-icon-masks/*.png', {
  eager: true,
  query: '?inline',
  import: 'default'
});

export function hubIconMaskImage(name: string): string {
  const image = masks[`./hub-icon-masks/${name}.png`];
  if (!image) throw new Error(`Missing hub icon mask: ${name}`);
  return `url("${image}")`;
}
