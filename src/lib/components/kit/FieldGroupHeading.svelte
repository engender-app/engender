<script lang="ts">
  /* Not a Field (ticket 10): the schedule, amounts and pauses legends in
     regimen and doses each name the group of controls below them - a
     ListCard, a set of fields, a disclosed block - rather than a control
     of their own, so there is no id to mint and no association to make.
     Four call sites hand-wrote the same three lines with the same
     reasoning in the comment; this is that shape, owning the reasoning
     once. */
  let { legend, hint }: { legend: string; hint: string } = $props();
</script>

<div class="field">
  <span class="field-label">{legend}</span>
  <p class="muted small">{hint}</p>
</div>
