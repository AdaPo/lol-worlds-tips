<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import Login from './Login.svelte';
  import Matches from './Matches.svelte';

  // undefined = still checking the session, null = logged out
  let user = $state(undefined);

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
  <div class="brand">WORLDS<span>TIPS</span></div>
  {#if user}
    <div class="who">
      <span class="name">{user.name}</span>
      <button class="link" onclick={logout}>Log out</button>
    </div>
  {/if}
</header>

<main>
  {#if user === undefined}
    <p class="hint">Loading…</p>
  {:else if user === null}
    <Login onauthed={(u) => (user = u)} />
  {:else}
    <Matches onsignedout={() => (user = null)} />
  {/if}
</main>

<style>
  .bar {
    display: flex;
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
    padding: 6px 0;
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
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
