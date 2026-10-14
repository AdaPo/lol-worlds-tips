<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { stage, t } from './lib/i18n.svelte.js';
  import { dayLabel } from './lib/time.js';

  let { id, onsignedout } = $props();

  let data = $state(null);
  let error = $state('');
  let retryable = $state(false);

  async function load() {
    error = '';
    try {
      data = await api.userPredictions(id);
    } catch (e) {
      if (e.status === 401) onsignedout();
      retryable = e.status !== 404;
      error = e.status === 404 ? t('player.notFound') : e.message;
    }
  }

  onMount(load);

  const total = $derived((data?.predictions ?? []).reduce((sum, p) => sum + (p.points ?? 0), 0));
</script>

<a class="back" href="#/leaderboard">{t('player.back')}</a>

{#if error}
  <div class="errorbox" role="alert">
    <span>{error}</span>
    {#if retryable}<button onclick={load}>{t('retry')}</button>{/if}
  </div>
{:else if !data}
  <p class="hint">{t('loading')}</p>
{:else}
  <header>
    <h1>{data.user.name}</h1>
    <span class="total">{total} {t('pts')}</span>
  </header>

  {#if data.predictions.length === 0}
    <p class="hint">{t('player.none')}</p>
  {:else}
    <ul>
      {#each data.predictions as p, i (p.matchId)}
        <li style="--i: {i}">
          <div class="top">
            <span>{stage(p.stage)} · {dayLabel(p.startTime)}</span>
            <span class="best">BO{p.bestOf}</span>
          </div>
          <div class="teams">
            {#if p.team1Image}<img class="logo" src={p.team1Image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => (e.currentTarget.style.display = 'none')} />{/if}
            {p.team1 ?? t('tbd')} <span>vs</span> {p.team2 ?? t('tbd')}
            {#if p.team2Image}<img class="logo" src={p.team2Image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => (e.currentTarget.style.display = 'none')} />{/if}
          </div>
          <div class="line">
            <span>{t('player.pick')} <b>{p.prediction.team1}–{p.prediction.team2}</b></span>
            <span>
              {t('player.result')}
              <b>{p.result ? `${p.result.team1}–${p.result.team2}` : '—'}</b>
            </span>
            {#if p.points !== null}
              <span class="pts" class:zero={p.points === 0}>+{p.points}</span>
            {:else}
              <span class="pts zero">…</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .back {
    display: inline-block;
    margin-bottom: 12px;
    color: var(--muted);
    text-decoration: none;
    font-size: 14px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    font-family: var(--display);
    font-weight: 900;
    font-size: 40px;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .total {
    font-family: var(--display);
    font-weight: 900;
    font-size: 30px;
    color: var(--gold);
    white-space: nowrap;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  li {
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    animation: rise 0.4s ease-out both;
    animation-delay: calc(var(--i) * 40ms);
  }
  .top {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .teams {
    margin: 6px 0 8px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 24px;
    text-transform: uppercase;
  }
  .logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
    vertical-align: middle;
    margin: 0 4px;
  }
  .teams span {
    color: var(--muted);
    font-size: 16px;
    margin: 0 4px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 14px;
    color: var(--muted);
  }
  .line b {
    color: var(--text);
    font-family: var(--mono);
    margin-left: 4px;
  }
  .pts {
    margin-left: auto;
    font-family: var(--mono);
    font-weight: 600;
    color: var(--ink);
    background: var(--gold);
    padding: 2px 8px;
  }
  .pts.zero {
    background: var(--line);
    color: var(--muted);
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
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
