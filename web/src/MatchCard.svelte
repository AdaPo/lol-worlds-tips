<script>
  import { stage, t } from './lib/i18n.svelte.js';
  import { hasStarted, isTbd, validScores } from './lib/match.js';
  import { countdown, timeLabel } from './lib/time.js';

  // status: 'saving' | 'error' | undefined (undefined = shows what the server stored)
  let { match, now, index = 0, status = undefined, onpick } = $props();

  const tbd = $derived(isTbd(match.team1) || isTbd(match.team2));
  const completed = $derived(match.state === 'completed');
  const live = $derived(match.state === 'inProgress');
  const started = $derived(hasStarted(match, now));
  const open = $derived(!tbd && !started);
  const scores = $derived(validScores(match.bestOf));
  const left = $derived(completed && match.team1Wins > match.team2Wins);
  const right = $derived(completed && match.team2Wins > match.team1Wins);
  const mine = $derived(match.myPrediction);
  const lockIn = $derived(countdown(match.startTime, now));

  const selected = (t1, t2) => mine?.team1 === t1 && mine?.team2 === t2;
  const label = (team, code) => (isTbd(team) ? t('tbd') : (code ?? team));

  // What to tell the player about their pick:
  //   saving - sent, waiting for the server       saved - stored (savedAt comes from the DB)
  //   none   - no pick, or the last save failed (the card shows the stored pick again)
  const saveStatus = $derived(
    !mine ? 'none' : status === 'saving' ? 'saving' : mine.savedAt ? 'saved' : 'none',
  );

  // Which team the pick says wins: 1, 2, or 0 when there is no pick yet.
  const pickedSide = $derived(mine ? (mine.team1 > mine.team2 ? 1 : 2) : 0);
  const sideLabel = (side) =>
    side === 1 ? label(match.team1, match.team1Code) : label(match.team2, match.team2Code);
</script>

{#snippet logo(src)}
  {#if src}
    <img
      class="logo"
      {src}
      alt=""
      width="36"
      height="36"
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror={(e) => (e.currentTarget.style.display = 'none')}
    />
  {/if}
{/snippet}

<article class="card" class:open class:live class:done={completed} style="--i: {index}">
  <header>
    <span class="stage">{stage(match.stage)}</span>
    <span class="meta">BO{match.bestOf} · {timeLabel(match.startTime)}</span>
  </header>

  <div class="versus">
    <div class="team" class:win={left} class:lose={right}>
      {@render logo(match.team1Image)}
      <div class="names">
        <span class="code">{label(match.team1, match.team1Code)}</span>
        {#if !isTbd(match.team1) && match.team1Code && match.team1Code !== match.team1}
          <span class="full">{match.team1}</span>
        {/if}
      </div>
    </div>
    <div class="mid">
      {#if completed}
        <span class="result">{match.team1Wins}–{match.team2Wins}</span>
      {:else}
        <span class="vs">VS</span>
      {/if}
    </div>
    <div class="team r" class:win={right} class:lose={left}>
      {@render logo(match.team2Image)}
      <div class="names">
        <span class="code">{label(match.team2, match.team2Code)}</span>
        {#if !isTbd(match.team2) && match.team2Code && match.team2Code !== match.team2}
          <span class="full">{match.team2}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="status">
    {#if completed}
      <span class="tag">{t('card.final')}</span>
      {#if mine?.points !== null && mine?.points !== undefined}
        <span class="pts" class:zero={mine.points === 0}>+{mine.points} {t('pts')}</span>
      {/if}
    {:else if live}
      <span class="tag live-tag">{t('card.live')}</span>
    {:else if tbd}
      <span class="tag muted">{t('card.tbd')}</span>
    {:else if started}
      <span class="tag live-tag">{t('card.locked')}</span>
    {:else if lockIn}
      <span class="tag open-tag">{t('card.locksIn')} <b>{lockIn}</b></span>
    {/if}
  </div>

  {#if open}
    <div class="picker" role="group" aria-label={t('card.pickAria')}>
      {#each [scores.left, scores.right] as side, i}
        <div class="sidebox" class:chosen={pickedSide === i + 1}>
          <span class="sidehead">{sideLabel(i + 1)} {t('card.wins')}</span>
          <div class="side">
            {#each side as [t1, t2]}
              <button
                aria-pressed={selected(t1, t2)}
                aria-label="{sideLabel(i + 1)} {t('card.wins')} {t1}–{t2}"
                onclick={() => onpick(t1, t2)}
              >
                {t1}–{t2}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if !tbd}
    <!-- The pick and whether the server has it: saving, saved (with the time), or failed. -->
    <div class="pickrow" class:saved={saveStatus === 'saved'}>
      <p class="yourpick">
        {#if mine}
          {t('card.yourPick')} <b>{sideLabel(pickedSide)}</b> {t('card.wins')}
          <b>{mine.team1}–{mine.team2}</b>
        {:else if !open}
          {t('card.noPick')}
        {/if}
      </p>
      <span class="save {saveStatus}" role="status">
        {#if saveStatus === 'saving'}
          <span class="dot" aria-hidden="true"></span>{t('card.saving')}
        {:else if saveStatus === 'saved'}
          <span class="check" aria-hidden="true">✓</span>{t('card.saved')}
          <time datetime={mine.savedAt}>{timeLabel(mine.savedAt)}</time>
        {/if}
      </span>
    </div>
    {#if status === 'error'}
      <p class="saveerror" role="alert">{t('card.saveFailed')}</p>
    {/if}
  {/if}

  {#if match.predictions?.length}
    <details>
      <summary>{t('card.everyone')} · {match.predictions.length}</summary>
      <ul>
        {#each match.predictions as p (p.userId)}
          <li>
            <span>{p.name}</span>
            <span class="score">{p.team1}–{p.team2}</span>
            {#if p.points !== null}
              <span class="pts small" class:zero={p.points === 0}>+{p.points}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</article>

<style>
  .card {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--line);
    padding: 14px 14px 16px;
    margin-bottom: 12px;
    animation: rise 0.4s ease-out both;
    animation-delay: calc(var(--i) * 50ms);
  }
  .card.open {
    border-left-color: var(--open);
  }
  .card.live {
    border-left-color: var(--live);
  }
  header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meta {
    font-family: var(--mono);
    letter-spacing: 0.04em;
  }
  .versus {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    margin: 14px 0 10px;
  }
  .team {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .team.r {
    flex-direction: row-reverse;
    text-align: right;
  }
  .names {
    display: grid;
    min-width: 0;
  }
  .logo {
    flex: none;
    width: 36px;
    height: 36px;
    object-fit: contain;
    padding: 3px;
    background: rgb(255 255 255 / 0.08);
    border-radius: 4px;
  }
  .code {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(34px, 11vw, 48px);
    line-height: 0.95;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .full {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .team.lose {
    opacity: 0.4;
  }
  .team.win .code {
    color: var(--open);
  }
  .mid {
    text-align: center;
  }
  .vs {
    font-family: var(--display);
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  .result {
    font-family: var(--display);
    font-weight: 900;
    font-size: 34px;
  }
  .status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 24px;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tag {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
  }
  .tag b {
    color: var(--text);
    font-weight: 600;
  }
  .open-tag b {
    color: var(--open);
  }
  .live-tag {
    color: var(--live);
  }
  .pts {
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
  .pts.small {
    font-size: 12px;
  }
  .picker {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }
  .sidebox {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .sidehead {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sidebox.chosen .sidehead {
    color: var(--open);
    font-weight: 600;
  }
  .side {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 6px;
  }
  .picker button {
    min-height: 48px;
    background: var(--ink);
    border: 1px solid var(--line);
    font-family: var(--display);
    font-weight: 800;
    font-size: 22px;
    letter-spacing: 0.04em;
    transition:
      background 0.12s,
      transform 0.12s;
  }
  .picker button:active {
    transform: scale(0.96);
  }
  .picker button[aria-pressed='true'] {
    background: var(--open);
    border-color: var(--open);
    color: var(--ink);
  }
  .pickrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    min-height: 24px;
  }
  .yourpick {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }
  .save {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .save time {
    opacity: 0.75;
  }
  /* "Saved": a clear confirmation while the pick can still be changed. */
  .card.open .save.saved {
    color: var(--open);
  }
  .check {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--muted);
    color: var(--ink);
    font-size: 11px;
    line-height: 1;
  }
  .card.open .save.saved .check {
    background: var(--open);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse 0.9s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  .saveerror {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--live);
  }
  .yourpick b {
    color: var(--text);
    font-family: var(--mono);
    margin-left: 4px;
  }
  details {
    margin-top: 12px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  li span:first-child {
    flex: 1;
  }
  .score {
    font-family: var(--mono);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
