/** The centred part of a `width` x `height` frame that a box of `aspect`
    (width over height) shows under `object-fit: cover`, in whole pixels.
    The progress-photo camera stores exactly this part, so the shot is what
    the preview showed against its ghost (ProgressCamera.svelte). */
export function coverCrop(
  width: number,
  height: number,
  aspect: number
): { x: number; y: number; width: number; height: number } {
  if (width / height > aspect) {
    const cropWidth = Math.round(height * aspect);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / aspect);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}
