<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { t } from './lib/i18n.svelte.js';
  import { isOpen, isUndecided } from './lib/match.js';
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
  let saving = 0;
  let toastTimer;

  async function load() {
    // Don't overwrite an optimistic update that is still being saved.
    if (saving > 0) return;
    try {
      matches = await api.matches();
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

  // Optimistic: show the pick immediately, roll back if the server rejects it.
  async function pick(match, team1, team2) {
    const previous = match.myPrediction;
    match.myPrediction = { team1, team2, points: null };
    saving++;
    try {
      await api.predict(match.id, team1, team2);
    } catch (e) {
      match.myPrediction = previous;
      showToast(e.message);
      if (e.status === 401) onsignedout();
    } finally {
      saving--;
      if (saving === 0) load();
    }
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
        <MatchCard {match} {now} index={i} onpick={(t1, t2) => pick(match, t1, t2)} />
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
