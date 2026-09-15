<script lang="ts">
  /* Weighted words, drawn so that size carries the weight (phase 10
     redesign ticket 62).

     Not a ranked list, and that is the whole reason this exists rather than
     `BarRows` or a `ListCard`. A numbered list invites reading down it, and
     the thing being read here is not an order - it is which words a stretch
     kept coming back to. So there is no number on the drawing at all; the
     count sits behind a tap, with the one action a word has.

     Five sizes, and they are the type scale's own steps (DIRECTION.md rule
     2): 28, 21, 19, 17, 15. A continuous ramp would have put a font size on
     every word that answers to nothing, and the scale already has five
     steps between a section heading and secondary text. Weight maps to a
     step through its square root, so the step carries roughly the word's
     area rather than its height - the reason a cloud is read by mass.

     The body face throughout, never the display face: rule 2 keeps the
     display face for a screen's own structure, and these are the person's
     own words rather than the app's. The two heaviest steps take the card's
     stripe through `--role-ink`, which is the role's version held to 4.5:1
     on this surface; the rest are ink, so the colour reads as weight and
     not as category.

     Heaviest in the middle. The order is centre-out - the top word takes
     the middle of the first line and the lighter ones fall away to either
     side - which is what makes the block read as a cloud with a heart
     rather than as a list that happens to wrap. It is also the arrangement
     `spread` opens from, so the entrance grows off the same centre the
     drawing is built around. Deterministic either way: the same weights
     produce the same arrangement, with no shuffle to disagree between two
     runs over one journal.

     Every word is a real button at `--touch-target`, so the small end of
     the scale is still something a thumb can hit. Its own text is its
     accessible name and there is no label over the top of it: the word is
     what the button is, and an aria-label would only replace the word with
     a sentence about it. That is what makes the
     block airier than a tag cloud usually is, and it is the right trade:
     the smallest word here is 15px, which is nobody's tap target. */
  import type { WordWeight } from '$lib/data/wordFrequency';

  let {
    words,
    onPick
  }: {
    /** Heaviest first, as `distinctiveWords` returns them. */
    words: readonly WordWeight[];
    /** What one word opens. The reading itself does nothing on a tap. */
    onPick: (word: WordWeight) => void;
  } = $props();

  /** How many steps of the type scale the cloud spends. */
  const STEPS = 5;

  /* Heaviest at index 0 lands in the middle; each next one takes the far
     side of it, so the two halves grow outward at the same rate. */
  function centreOut<T>(items: readonly T[]): T[] {
    const before: T[] = [];
    const after: T[] = [];
    items.forEach((item, i) => (i % 2 === 1 ? before.unshift(item) : after.push(item)));
    return [...before, ...after];
  }

  let laid = $derived.by(() => {
    const heaviest = words[0]?.weight ?? 0;
    if (heaviest <= 0) return [];
    return centreOut(
      words.map((word) => ({
        ...word,
        /* Square root of the share of the heaviest weight, so the steps
           read as area. Step 1 is the top; anything at or below a
           twenty-fifth of the heaviest sits on the last step rather than
           falling off the drawing. */
        step: Math.min(STEPS, 1 + Math.floor((1 - Math.sqrt(word.weight / heaviest)) * STEPS))
      }))
    );
  });
</script>

<ul class="kit-cloud" data-kit-cloud>
  {#each laid as word (word.word)}
    <li>
      <button type="button" data-cloud-word={word.word} data-cloud-step={word.step} onclick={() => onPick(word)}>
        {word.word}
      </button>
    </li>
  {/each}
</ul>

<style>
  .kit-cloud {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 0 var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kit-cloud li {
    display: contents;
  }

  .kit-cloud button {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--r-block);
    background: none;
    font-family: var(--font-body);
    color: var(--text-2);
    cursor: pointer;
  }

  .kit-cloud button[data-cloud-step='1'] {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
  }

  .kit-cloud button[data-cloud-step='2'] {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
  }

  .kit-cloud button[data-cloud-step='3'] {
    font-size: var(--text-block);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .kit-cloud button[data-cloud-step='4'] {
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
  }

  .kit-cloud button[data-cloud-step='5'] {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
</style>
