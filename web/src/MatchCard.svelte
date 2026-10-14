<script>
  import { stage, t } from './lib/i18n.svelte.js';
  import { hasStarted, isTbd, validScores } from './lib/match.js';
  import { countdown, timeLabel } from './lib/time.js';

  let { match, now, index = 0, onpick } = $props();

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
</script>

<article class="card" class:open class:live class:done={completed} style="--i: {index}">
  <header>
    <span class="stage">{stage(match.stage)}</span>
    <span class="meta">BO{match.bestOf} · {timeLabel(match.startTime)}</span>
  </header>

  <div class="versus">
    <div class="team" class:win={left} class:lose={right}>
      <span class="code">{label(match.team1, match.team1Code)}</span>
      {#if !isTbd(match.team1) && match.team1Code && match.team1Code !== match.team1}
        <span class="full">{match.team1}</span>
      {/if}
    </div>
    <div class="mid">
      {#if completed}
        <span class="result">{match.team1Wins}–{match.team2Wins}</span>
      {:else}
        <span class="vs">VS</span>
      {/if}
    </div>
    <div class="team r" class:win={right} class:lose={left}>
      <span class="code">{label(match.team2, match.team2Code)}</span>
      {#if !isTbd(match.team2) && match.team2Code && match.team2Code !== match.team2}
        <span class="full">{match.team2}</span>
      {/if}
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
      {#each [scores.left, scores.right] as side}
        <div class="side">
          {#each side as [t1, t2]}
            <button aria-pressed={selected(t1, t2)} onclick={() => onpick(t1, t2)}>
              {t1}–{t2}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {:else if !tbd}
    <p class="yourpick">
      {#if mine}
        {t('card.yourPick')} <b>{mine.team1}–{mine.team2}</b>
      {:else}
        {t('card.noPick')}
      {/if}
    </p>
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
    display: grid;
    min-width: 0;
  }
  .team.r {
    text-align: right;
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
  .yourpick {
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 14px;
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
