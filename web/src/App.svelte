<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { i18n, t } from './lib/i18n.svelte.js';
  import { route } from './lib/router.svelte.js';
  import Admin from './Admin.svelte';
  import Leaderboard from './Leaderboard.svelte';
  import Login from './Login.svelte';
  import Matches from './Matches.svelte';
  import Player from './Player.svelte';
  import ScoringInfo from './ScoringInfo.svelte';

  // undefined = still checking the session, null = logged out
  let user = $state(undefined);

  const playerMatch = $derived(route.path.match(/^\/player\/(\d+)$/));
  const inLeaderboard = $derived(route.path === '/leaderboard' || playerMatch !== null);
  const inAdmin = $derived(route.path === '/admin' && user?.isAdmin === true);

  onMount(async () => {
    try {
      user = (await api.me()).user;
    } catch {
      user = null;
    }
  });

  async function logout() {
    try {
      await api.logout();
    } finally {
      user = null;
    }
  }
</script>

<header class="bar">
  <div class="brand">{t('brand.1')}<span>{t('brand.2')}</span></div>
  <div class="right">
    <ScoringInfo />
    <div class="lang" role="group" aria-label="Language">
      {#each ['cs', 'en'] as code}
        <button class:on={i18n.lang === code} aria-pressed={i18n.lang === code} onclick={() => i18n.setLang(code)}>
          {code}
        </button>
      {/each}
    </div>
    {#if user}
      <div class="who">
        <span class="name">{user.name}</span>
        <button class="link" onclick={logout}>{t('nav.logout')}</button>
      </div>
    {/if}
  </div>
</header>

{#if user}
  <nav class="tabs" class:three={user.isAdmin} aria-label={t('nav.sections')}>
    <a href="#/" class:on={!inLeaderboard && !inAdmin}>{t('nav.matches')}</a>
    <a href="#/leaderboard" class:on={inLeaderboard}>{t('nav.leaderboard')}</a>
    {#if user.isAdmin}
      <a href="#/admin" class:on={inAdmin}>{t('nav.admin')}</a>
    {/if}
  </nav>
{/if}

<main>
  {#if user === undefined}
    <p class="hint">{t('loading')}</p>
  {:else if user === null}
    <Login onauthed={(u) => (user = u)} />
  {:else if playerMatch}
    {#key playerMatch[1]}
      <Player id={playerMatch[1]} onsignedout={() => (user = null)} />
    {/key}
  {:else if inAdmin}
    <Admin {user} onsignedout={() => (user = null)} />
  {:else if route.path === '/leaderboard'}
    <Leaderboard {user} onsignedout={() => (user = null)} />
  {:else}
    <Matches onsignedout={() => (user = null)} />
  {/if}
</main>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 5;
    background: rgb(11 13 18 / 0.88);
    backdrop-filter: blur(8px);
  }
  .brand {
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    letter-spacing: 0.04em;
    line-height: 1;
  }
  .brand span {
    color: var(--open);
    margin-left: 0.18em;
  }
  .right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .lang {
    display: flex;
    border: 1px solid var(--line);
  }
  .lang button {
    background: none;
    border: 0;
    min-height: 36px;
    padding: 0 10px;
    font-family: var(--mono);
    font-size: 12px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lang button.on {
    background: var(--text);
    color: var(--ink);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }
  .name {
    color: var(--muted);
  }
  .link {
    background: none;
    border: 0;
    min-height: 36px;
    padding: 0 2px;
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    max-width: 640px;
    margin: 0 auto;
    border-bottom: 1px solid var(--line);
  }
  .tabs.three {
    grid-template-columns: repeat(3, 1fr);
  }
  .tabs a {
    padding: 12px 8px;
    text-align: center;
    font-family: var(--display);
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--muted);
    border-bottom: 3px solid transparent;
    margin-bottom: -1px;
  }
  .tabs a.on {
    color: var(--text);
    border-bottom-color: var(--open);
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 20px 16px 64px;
  }
  .hint {
    color: var(--muted);
    text-align: center;
    margin-top: 48px;
  }
</style>
