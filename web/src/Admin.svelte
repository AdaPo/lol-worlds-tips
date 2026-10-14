<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { stage, t } from './lib/i18n.svelte.js';
  import { isUndecided, validScores } from './lib/match.js';
  import { dayLabel, timeLabel } from './lib/time.js';

  let { user, onsignedout } = $props();

  let matches = $state([]);
  let users = $state([]);
  let notice = $state('');
  let error = $state('');

  // "Add match" form
  let stageName = $state('');
  let team1 = $state('');
  let team2 = $state('');
  let bestOf = $state(3);
  let startLocal = $state('');

  async function load() {
    try {
      [matches, users] = await Promise.all([api.matches(), api.adminUsers()]);
    } catch (e) {
      fail(e);
    }
  }

  onMount(load);

  function fail(e) {
    if (e.status === 401) onsignedout();
    error = e.message;
    notice = '';
  }

  // Runs an admin action, shows the result, and reloads the lists.
  async function run(action, doneMessage) {
    error = '';
    notice = '';
    try {
      await action();
      notice = doneMessage;
      await load();
    } catch (e) {
      fail(e);
    }
  }

  function addMatch(event) {
    event.preventDefault();
    const body = {
      bestOf: Number(bestOf),
      startTime: new Date(startLocal).toISOString(),
      ...(stageName.trim() && { stage: stageName.trim() }),
      ...(team1.trim() && { team1: team1.trim() }),
      ...(team2.trim() && { team2: team2.trim() }),
    };
    run(async () => {
      await api.addMatch(body);
      stageName = team1 = team2 = startLocal = '';
    }, t('admin.added'));
  }

  const teamName = (name) => name ?? t('tbd');

  function setResult(m, t1, t2) {
    const label = `${teamName(m.team1)} ${t1}–${t2} ${teamName(m.team2)}`;
    if (!confirm(t('admin.confirmResult', { label }))) return;
    run(() => api.setResult(m.id, t1, t2), t('admin.resultSaved', { label }));
  }

  function remove(m) {
    const names = { a: teamName(m.team1), b: teamName(m.team2) };
    if (!confirm(t('admin.confirmDelete', names))) return;
    run(() => api.deleteMatch(m.id), t('admin.deleted'));
  }

  function rescore() {
    run(async () => {
      const { matches: n } = await api.rescore();
      notice = t('admin.rescored', { n });
    }, '');
  }

  function syncNow() {
    run(async () => {
      notice = t('admin.synced', await api.sync());
    }, '');
  }

  function toggleAdmin(u) {
    run(
      () => api.setAdmin(u.id, !u.isAdmin),
      t(u.isAdmin ? 'admin.noLongerAdmin' : 'admin.nowAdmin', { name: u.name }),
    );
  }

  function toggleHidden(u) {
    run(
      () => api.setHidden(u.id, !u.hidden),
      t(u.hidden ? 'admin.nowVisible' : 'admin.nowHidden', { name: u.name }),
    );
  }

  function removeUser(u) {
    if (!confirm(t('admin.confirmRemove', { name: u.name }))) return;
    run(() => api.deleteUser(u.id), t('admin.removed', { name: u.name }));
  }

  let hideUndecided = $state(false); // leave out matches where no team is known yet

  const sorted = $derived(
    [...matches].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)),
  );
  const undecided = $derived(sorted.filter(isUndecided).length);
  const shown = $derived(hideUndecided ? sorted.filter((m) => !isUndecided(m)) : sorted);
</script>

<h1>{t('admin.title')}</h1>

{#if notice}<p class="notice" role="status">{notice}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<section>
  <h2>{t('admin.addMatch')}</h2>
  <form onsubmit={addMatch}>
    <label>{t('admin.stage')} <input bind:value={stageName} placeholder={t('admin.stagePh')} /></label>
    <div class="two">
      <label>{t('admin.team1')} <input bind:value={team1} placeholder={t('tbd')} /></label>
      <label>{t('admin.team2')} <input bind:value={team2} placeholder={t('tbd')} /></label>
    </div>
    <div class="two">
      <label>
        {t('admin.bestOf')}
        <select bind:value={bestOf}>
          <option value={1}>1</option>
          <option value={3}>3</option>
          <option value={5}>5</option>
        </select>
      </label>
      <label>
        {t('admin.start')}
        <input type="datetime-local" bind:value={startLocal} required />
      </label>
    </div>
    <button class="primary">{t('admin.addMatch')}</button>
  </form>
</section>

<section>
  <h2>{t('admin.matches')}</h2>
  {#if undecided > 0}
    <div class="tbdbar">
      <span>{t(hideUndecided ? 'matches.hiddenInfo' : 'matches.shownInfo', { n: undecided })}</span>
      <button onclick={() => (hideUndecided = !hideUndecided)}>
        {hideUndecided ? t('matches.showAll') : t('matches.hideTbd')}
      </button>
    </div>
  {/if}
  {#if sorted.length === 0}
    <p class="hint">{t('admin.noMatches')}</p>
  {/if}
  {#each shown as m (m.id)}
    {@const scores = validScores(m.bestOf)}
    <div class="match">
      <div class="head">
        <b>{teamName(m.team1)} vs {teamName(m.team2)}</b>
        <span class="meta">
          {stage(m.stage)} · BO{m.bestOf} · {dayLabel(m.startTime)} {timeLabel(m.startTime)}
        </span>
      </div>
      <div class="state">
        {#if m.state === 'completed'}
          {t('admin.state.completed', { a: m.team1Wins, b: m.team2Wins })}
        {:else}
          {t(`admin.state.${m.state}`)}
        {/if}
      </div>
      <div class="scores" role="group" aria-label={t('admin.setResult')}>
        {#each [...scores.left, ...scores.right] as [t1, t2]}
          <button onclick={() => setResult(m, t1, t2)}>{t1}–{t2}</button>
        {/each}
      </div>
      {#if m.id.startsWith('manual-')}
        <button class="danger" onclick={() => remove(m)}>{t('admin.delete')}</button>
      {/if}
    </div>
  {/each}
</section>

<section>
  <h2>{t('admin.sync')}</h2>
  <p class="hint">{t('admin.syncHint')}</p>
  <button class="primary" onclick={syncNow}>{t('admin.syncNow')}</button>
</section>

<section>
  <h2>{t('admin.scoring')}</h2>
  <p class="hint">{t('admin.scoringHint')}</p>
  <button class="primary" onclick={rescore}>{t('admin.rescore')}</button>
</section>

<section>
  <h2>{t('admin.players')}</h2>
  <div class="pheader" aria-hidden="true">
    <span>{t('admin.col.name')}</span>
    <span>{t('admin.col.role')}</span>
    <span>{t('admin.col.hidden')}</span>
  </div>
  {#each users as u (u.id)}
    <div class="player">
      <span class="pname">{u.name}</span>
      <span class="pcell" class:on={u.isAdmin}>
        {u.isAdmin ? t('admin.role.admin') : t('admin.role.player')}
      </span>
      <span class="pcell" class:on={u.hidden}>{u.hidden ? t('admin.yes') : t('admin.no')}</span>
      <div class="pbtns">
        <button
          title={u.hidden ? t('admin.show') : t('admin.hide')}
          onclick={() => toggleHidden(u)}
        >
          {u.hidden ? t('admin.short.show') : t('admin.short.hide')}
        </button>
        <button
          disabled={u.id === user.id}
          title={u.isAdmin ? t('admin.removeAdmin') : t('admin.makeAdmin')}
          onclick={() => toggleAdmin(u)}
        >
          {u.isAdmin ? t('admin.short.removeAdmin') : t('admin.short.makeAdmin')}
        </button>
        <button
          class="danger"
          disabled={u.isAdmin}
          title={u.isAdmin ? t('admin.removeFirst') : ''}
          onclick={() => removeUser(u)}
        >
          {t('admin.remove')}
        </button>
      </div>
    </div>
  {/each}
</section>

<style>
  h1 {
    margin: 0 0 16px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 40px;
    text-transform: uppercase;
  }
  h2 {
    margin: 0 0 12px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  section {
    margin-bottom: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  form {
    display: grid;
    gap: 12px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  input,
  select {
    min-width: 0;
    background: var(--ink);
    border: 1px solid var(--line);
    border-radius: 0;
    padding: 12px;
    font-size: 16px;
    color: var(--text);
    text-transform: none;
    letter-spacing: normal;
  }
  input:focus,
  select:focus {
    border-color: var(--open);
    outline: none;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    padding: 10px 14px;
    color: var(--text);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .primary {
    background: var(--open);
    border-color: var(--open);
    color: var(--ink);
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 12px;
  }
  .danger {
    color: var(--live);
    border-color: var(--live);
    background: none;
    margin-top: 10px;
  }
  .tbdbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px dashed var(--line);
    font-size: 13px;
    color: var(--muted);
  }
  .tbdbar button {
    flex: none;
    padding: 6px 10px;
    font-size: 13px;
  }
  .match {
    padding: 12px 14px;
    margin-bottom: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .head {
    display: grid;
    gap: 2px;
  }
  .meta,
  .state {
    font-size: 13px;
    color: var(--muted);
  }
  .state {
    margin: 6px 0 10px;
    font-family: var(--mono);
    font-size: 12px;
  }
  .scores {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .scores button {
    font-family: var(--display);
    font-weight: 800;
    font-size: 18px;
    min-width: 56px;
    min-height: 44px;
  }
  .pheader,
  .player {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 76px 76px;
    align-items: center;
    column-gap: 12px;
  }
  /* Wide screens: the buttons sit at the end of the same row. */
  @media (min-width: 640px) {
    .pheader,
    .player {
      grid-template-columns: minmax(0, 1fr) 76px 76px 252px;
    }
    .player {
      row-gap: 0;
    }
    .pbtns {
      grid-column: auto;
    }
  }
  .pheader {
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .player {
    row-gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pcell {
    font-size: 14px;
    color: var(--muted);
  }
  .pcell.on {
    color: var(--text);
    font-weight: 600;
  }
  .pbtns {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pbtns button {
    min-height: 40px;
    padding: 0 6px;
    font-size: 14px;
  }
  .pbtns .danger {
    margin-top: 0;
  }
  .hint {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 12px;
  }
  .notice {
    padding: 10px 12px;
    border-left: 3px solid var(--open);
    background: var(--panel);
  }
  .error {
    color: var(--live);
  }
</style>
