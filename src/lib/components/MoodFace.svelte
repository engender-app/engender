<script lang="ts">
  /* One mood's face, drawn once (phase 5 ticket 18).

     It came out of MoodPicker when quick add needed the same five faces in
     its fan. The alternative was a flat coloured dot there, which is the
     thing DIRECTION.md warns about under "the mood ramp is built to be sat
     on, not to be a dot": the ramp's steps are chosen so --text clears
     4.5:1 on top of them, and on the dark theme they are all dark, so as
     small dots on a dark panel they have almost no separation from each
     other. The face carries the value; the fill only tints it. */
  let { value, size = 44 }: { value: number; size?: number } = $props();

  const MOUTHS: Record<number, string> = {
    1: 'M8 16.5c1.2-1.6 2.6-2.4 4-2.4s2.8.8 4 2.4',
    2: 'M8.5 16c1-.9 2.2-1.4 3.5-1.4s2.5.5 3.5 1.4',
    3: 'M8.5 15.5h7',
    4: 'M8.5 14.6c1 .9 2.2 1.4 3.5 1.4s2.5-.5 3.5-1.4',
    5: 'M8 14c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4'
  };
</script>

<svg
  viewBox="0 0 24 24"
  class="mood-face"
  style={`width:${size}px;height:${size}px`}
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="10" class="mood-face-bg" style="fill:var(--mood-{value})" />
  <circle cx="8.6" cy="9.5" r="1.25" class="mood-face-ink" />
  <circle cx="15.4" cy="9.5" r="1.25" class="mood-face-ink" />
  <path d={MOUTHS[value]} class="mood-face-mouth" />
</svg>
