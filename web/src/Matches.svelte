<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { t } from './lib/i18n.svelte.js';
  import { isOpen, isUndecided } from './lib/match.js';
  import { createSaveQueue } from './lib/saveQueue.js';
  import { dayKey, dayLabel } from './lib/time.js';
  import MatchCard from './MatchCard.svelte';

  let { onsignedout } = $props();

  const POLL_MS = 30_000;

  let matches = $state([]);
  let loaded = $state(false);
  let loadError = $state('');
  let filter = $state('all'); // 'all' | 'open' | 'finished'
  let showAll = $state(false); // also show matches where no team is known yet
  let now = $state(Date.now());
  let toast = $state('');
  let toastTimer;

  // Save progress per match: 'saving' | 'error'. A card with neither shows exactly
  // what the server has stored.
  let saveState = $state({});
  const confirmed = new Map(); // matchId -> last pick the server confirmed (null = none)

  async function load() {
    // Don't overwrite a pick that is still being saved.
    if (queue.isBusy()) return;
    try {
      matches = await api.matches();
      for (const m of matches) confirmed.set(m.id, m.myPrediction ?? null);
      loadError = '';
    } catch (e) {
      if (e.status === 401) onsignedout();
      loadError = e.message;
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    load();
    const poll = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    const tick = setInterval(() => (now = Date.now()), 1000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  function showToast(message) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 4000);
  }

  const queue = createSaveQueue({
    // team1 === null means "clear the pick".
    send: (id, team1, team2) =>
      team1 === null ? api.clearPick(id) : api.predict(id, team1, team2),
    onSaved(id, response, isLatest) {
      const p = response.prediction; // undefined when the pick was cleared
      confirmed.set(
        id,
        p ? { team1: p.team1, team2: p.team2, points: null, savedAt: p.savedAt } : null,
      );
      if (isLatest) {
        // Show what the server returned, not our guess.
        const m = matches.find((x) => x.id === id);
        if (m) m.myPrediction = confirmed.get(id);
        delete saveState[id];
      }
    },
    onFailed(id, error) {
      // Go back to what the server really has.
      const m = matches.find((x) => x.id === id);
      if (m) m.myPrediction = confirmed.get(id) ?? null;
      saveState[id] = 'error';
      showToast(error.message);
      if (error.status === 401) onsignedout();
    },
    onIdle() {
      if (!queue.isBusy()) load(); // re-sync everything from the server
    },
  });

  // Show the choice at once, marked "saving"; it counts as saved only after the
  // server confirms it.
  function pick(match, team1, team2) {
    const current = match.myPrediction;
    if (current && current.team1 === team1 && current.team2 === team2) {
      return clearPick(match); // tapping the chosen score again deselects it
    }
    match.myPrediction = { team1, team2, points: null, savedAt: null };
    saveState[match.id] = 'saving';
    queue.save(match.id, team1, team2);
  }

  function clearPick(match) {
    match.myPrediction = null;
    saveState[match.id] = 'saving';
    queue.save(match.id, null, null);
  }

  const byTime = (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime);

  const filtered = $derived.by(() => {
    if (filter === 'open') return matches.filter((m) => isOpen(m, now));
    if (filter === 'finished') return matches.filter((m) => m.state === 'completed');
    return matches;
  });

  const undecided = $derived(filtered.filter(isUndecided).length);

  const visible = $derived.by(() => {
    const list = showAll ? filtered : filtered.filter((m) => !isUndecided(m));
    // Upcoming first (soonest on top), then finished (latest on top).
    const upcoming = list.filter((m) => m.state !== 'completed').sort(byTime);
    const finished = list.filter((m) => m.state === 'completed').sort((a, b) => byTime(b, a));
    return [...upcoming, ...finished];
  });

  const groups = $derived.by(() => {
    const out = [];
    for (const m of visible) {
      const key = dayKey(m.startTime);
      const last = out.at(-1);
      if (last?.key === key) last.items.push(m);
      else out.push({ key, label: dayLabel(m.startTime), items: [m] });
    }
    return out;
  });

  const toPick = $derived(matches.filter((m) => isOpen(m, now) && !m.myPrediction).length);
</script>

<nav class="filters" aria-label={t('matches.aria')}>
  {#each [['all', 'filter.all'], ['open', 'filter.open'], ['finished', 'filter.finished']] as [value, label]}
    <button class:on={filter === value} aria-pressed={filter === value} onclick={() => (filter = value)}>
      {t(label)}{#if value === 'open' && toPick > 0}<span class="badge">{toPick}</span>{/if}
    </button>
  {/each}
</nav>

{#if loadError}
  <div class="errorbox" role="alert">
    <span>{loadError}</span>
    <button onclick={load}>{t('retry')}</button>
  </div>
{/if}

{#if loaded && undecided > 0}
  <div class="tbdbar">
    <span>{t(showAll ? 'matches.shownInfo' : 'matches.hiddenInfo', { n: undecided })}</span>
    <button onclick={() => (showAll = !showAll)}>
      {showAll ? t('matches.hideTbd') : t('matches.showAll')}
    </button>
  </div>
{/if}

{#if !loaded}
  <div class="skeletons" role="status" aria-label={t('matches.loading')}>
    {#each [0, 1, 2] as i}
      <div class="skeleton" style="--i: {i}"></div>
    {/each}
  </div>
{:else if groups.length === 0}
  <p class="hint">
    {#if matches.length === 0}
      {t('matches.none')}
    {:else if undecided > 0 && !showAll}
      {t('matches.allUndecided')}
    {:else}
      {t('matches.emptyView')}
    {/if}
  </p>
{:else}
  {#each groups as group (group.key)}
    <section class="day">
      <h2>{group.label}</h2>
      {#each group.items as match, i (match.id)}
        <MatchCard
          {match}
          {now}
          index={i}
          status={saveState[match.id]}
          onpick={(t1, t2) => pick(match, t1, t2)}
          onclear={() => clearPick(match)}
        />
      {/each}
    </section>
  {/each}
{/if}

{#if toast}
  <div class="toast" role="status">{toast}</div>
{/if}

<style>
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  .filters button {
    flex: 1;
    padding: 11px 8px;
    background: none;
    border: 1px solid var(--line);
    font-family: var(--display);
    font-weight: 800;
    font-size: 17px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .filters button.on {
    background: var(--text);
    border-color: var(--text);
    color: var(--ink);
  }
  .tbdbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    padding: 10px 12px;
    border: 1px dashed var(--line);
    font-size: 13px;
    color: var(--muted);
  }
  .tbdbar button {
    flex: none;
    background: none;
    border: 1px solid var(--line);
    padding: 6px 10px;
    color: var(--text);
    font-size: 13px;
  }
  .badge {
    display: inline-block;
    min-width: 20px;
    margin-left: 8px;
    padding: 0 6px;
    background: var(--open);
    color: var(--ink);
    font-size: 14px;
    line-height: 20px;
  }
  .day h2 {
    margin: 28px 0 12px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .day h2::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .hint {
    color: var(--muted);
    text-align: center;
    margin-top: 48px;
  }
  .errorbox {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-left: 3px solid var(--live);
    background: var(--panel);
    color: var(--live);
    font-size: 14px;
  }
  .errorbox button {
    flex: none;
    min-height: 40px;
    padding: 0 12px;
    background: none;
    border: 1px solid var(--live);
    color: var(--live);
  }
  .skeleton {
    height: 158px;
    margin-bottom: 12px;
    border: 1px solid var(--line);
    background: linear-gradient(100deg, var(--panel) 30%, var(--panel-2) 50%, var(--panel) 70%);
    background-size: 220% 100%;
    animation: shimmer 1.4s linear infinite;
    animation-delay: calc(var(--i) * 120ms);
  }
  @keyframes shimmer {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }
  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 20px;
    max-width: 608px;
    margin: 0 auto;
    padding: 14px 16px;
    background: var(--live);
    color: var(--ink);
    font-weight: 600;
    animation: slide 0.25s ease-out both;
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
