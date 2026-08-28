<script lang="ts">
  /* Streak goals and gentle achievements (phase 4 features ticket 20).
     Both numbers on this screen - the live streak and the all-time best
     streak - come straight off journal.stats, so a backdated entry that
     repairs a gap (CONTEXT: Streak) updates this screen the same instant
     it updates Home's streak line. There is deliberately no red state and
     no "you broke it" copy anywhere below: a gap is framed as just a gap,
     never a failure. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { GOAL_ACHIEVEMENT_DAYS, GOAL_TARGET_PRESETS, goalProgress, reachedAchievements } from '$lib/data/streakGoal';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  /** Offered when a goal is first turned on and nothing was chosen before. */
  const DEFAULT_TARGET_DAYS = 7;

  const today = todayEpochDay();

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let bestStreakEverQuery = liveQuery((j) => j.stats.bestStreakEver(today));
  let currentStreak = $derived(streakQuery.value ?? 0);
  let bestStreakEver = $derived(bestStreakEverQuery.value ?? 0);

  let goalEnabled = $derived(prefs.streakGoalHabit !== null);
  let progress = $derived(
    prefs.streakGoalTargetDays !== null ? goalProgress(currentStreak, prefs.streakGoalTargetDays) : null
  );
  let reached = $derived(new Set(reachedAchievements(bestStreakEver)));

  function toggleGoal(on: boolean) {
    prefs.streakGoalHabit = on ? 'journaling' : null;
    prefs.streakGoalTargetDays = on ? (prefs.streakGoalTargetDays ?? DEFAULT_TARGET_DAYS) : null;
  }

  function pickTarget(days: number) {
    prefs.streakGoalTargetDays = days;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.streak_goal_title()} back="/settings" subtitle={m.streak_goal_intro()} />

  <div class="card">
    <div class="pref-row">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.streak_goal_enable()}</span>
        <span class="kit-row-sub">{m.streak_goal_enable_sub()}</span>
      </span>
      <Switch checked={goalEnabled} label={m.streak_goal_enable()} onChange={toggleGoal} />
    </div>

    {#if goalEnabled && progress}
      <div class="hr"></div>
      <p class="field-label" style="margin-bottom:var(--space-2)">{m.streak_goal_habit_journaling()}</p>

      <p class="field-label" style="margin-bottom:var(--space-2)">{m.streak_goal_target_label()}</p>
      <Segmented
        name={m.streak_goal_target_label()}
        options={GOAL_TARGET_PRESETS.map((days) => ({ value: String(days), label: m.n_days({ n: days }) }))}
        value={String(progress.targetDays)}
        onChange={(v) => pickTarget(Number(v))}
      />

      <div class="goal-track">
        <div class="goal-fill" style="width:{progress.fraction * 100}%"></div>
      </div>
      <p class="muted small">
        {#if progress.met}
          {m.streak_goal_progress_met({ days: m.n_days({ n: progress.targetDays }) })}
        {:else}
          {m.streak_goal_progress_current({ current: String(progress.currentStreak), target: String(progress.targetDays) })}
        {/if}
      </p>
      <p class="muted small">{m.streak_goal_gap_note()}</p>
    {/if}
  </div>

  <SectionTitle text={m.streak_goal_achievements_title()} />
  <p class="muted small" style="margin-bottom:var(--space-3)">{m.streak_goal_achievements_intro()}</p>
  <ListCard>
    {#each GOAL_ACHIEVEMENT_DAYS as days (days)}
      <ListRow
        static
        icon={reached.has(days) ? 'sparkle' : undefined}
        title={m.n_days({ n: days })}
        data-unreached={reached.has(days) ? undefined : 'true'}
      />
    {/each}
  </ListCard>
</div>

<style>
  .goal-track {
    width: 100%;
    height: 10px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .goal-fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius-pill);
  }
  /* Not-yet-reached reads as quieter, never as red or crossed out - an
     achievement ladder has no failing rungs, only ones not climbed yet.
     Targets ListRow's own title span from outside it (ticket 18), the same
     way onboarding/+page.svelte already reaches into `.kit-row` for its
     divider. */
  :global(.kit-row[data-unreached] .kit-row-title) {
    color: var(--text-2);
    font-weight: var(--weight-regular);
  }
</style>
