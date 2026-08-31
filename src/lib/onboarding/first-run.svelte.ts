/* Whether onboarding's own flow has reached (or passed) its access-mode
   step, for +layout.svelte's first-run exception (ticket 54).

   A module-level rune rather than something threaded through props: the
   layout decides whether `/onboarding`'s route even mounts, so nothing
   `+page.svelte` holds locally can reach it. Before the access-mode step
   the layout renders onboarding over the gate; the moment the flow reaches
   it, the gate is what has to render instead - it is the same
   AccessModeSetup module Settings uses, appearing once, in place, rather
   than a second copy built into onboarding's own template.

   Reset only by a real reload, the way module state always is - there is
   no "un-reach" a later step in the same flow could mean. */
export const onboardingProgress = $state({ reachedAccessMode: false });
