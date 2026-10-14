<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';

  let { user, onsignedout } = $props();

  const POLL_MS = 60_000;

  let rows = $state([]);
  let loaded = $state(false);
  let error = $state('');

  async function load() {
    try {
      rows = await api.leaderboard();
      error = '';
    } catch (e) {
      if (e.status === 401) onsignedout();
      error = e.message;
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    load();
    const poll = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(poll);
  });
</script>

<h1>Leaderboard</h1>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

{#if !loaded}
  <p class="hint">Loading…</p>
{:else if rows.length === 0}
  <p class="hint">No players yet.</p>
{:else}
  <ol>
    {#each rows as r, i (r.userId)}
      <li style="--i: {i}">
        <a href="#/player/{r.userId}" class:me={r.userId === user.id} class:first={r.rank === 1}>
          <span class="rank">{r.rank}</span>
          <span class="who">
            <span class="name">{r.name}{r.userId === user.id ? ' (you)' : ''}</span>
            <span class="sub">{r.exactHits} exact · {r.correctWinners} correct</span>
          </span>
          <span class="pts">{r.totalPoints}</span>
        </a>
      </li>
    {/each}
  </ol>
{/if}

<style>
  h1 {
    margin: 0 0 16px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 40px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    animation: rise 0.4s ease-out both;
    animation-delay: calc(var(--i) * 40ms);
  }
  a {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--line);
    color: var(--text);
    text-decoration: none;
  }
  a.me {
    border-left-color: var(--open);
  }
  a.first .rank,
  a.first .pts {
    color: var(--gold);
  }
  .rank {
    font-family: var(--display);
    font-weight: 900;
    font-size: 34px;
    line-height: 1;
    color: var(--muted);
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
  .pts {
    font-family: var(--display);
    font-weight: 900;
    font-size: 36px;
    line-height: 1;
  }
  .hint {
    color: var(--muted);
    text-align: center;
    margin-top: 48px;
  }
  .error {
    color: var(--live);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
