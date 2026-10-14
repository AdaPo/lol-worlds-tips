<script>
  import { t } from './lib/i18n.svelte.js';
  import { EXACT_POINTS, WINNER_POINTS } from './lib/rules.js';

  let dialog;

  const rows = [
    { label: 'info.exact', example: 'info.exactEx', points: EXACT_POINTS },
    { label: 'info.winner', example: 'info.winnerEx', points: WINNER_POINTS },
    { label: 'info.wrong', example: 'info.wrongEx', points: 0 },
  ];

  // A click on the backdrop lands on the dialog element itself.
  function onBackdrop(event) {
    if (event.target === dialog) dialog.close();
  }
</script>

<button class="info" aria-label={t('info.open')} title={t('info.open')} onclick={() => dialog.showModal()}>
  i
</button>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} onclick={onBackdrop} aria-labelledby="scoring-title">
  <h2 id="scoring-title">{t('info.title')}</h2>

  <ul class="rows">
    {#each rows as row}
      <li>
        <div>
          <b>{t(row.label)}</b>
          <span>{t(row.example)}</span>
        </div>
        <strong class:zero={row.points === 0}>{row.points} {t('pts')}</strong>
      </li>
    {/each}
  </ul>

  <p>{t('info.bo1')}</p>
  <p>{t('info.lock')}</p>
  <p>{t('info.rank')}</p>

  <button class="close" onclick={() => dialog.close()}>{t('info.close')}</button>
</dialog>

<style>
  .info {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: none;
    color: var(--muted);
    font-family: var(--display);
    font-weight: 800;
    font-size: 17px;
    font-style: italic;
    line-height: 1;
  }
  .info:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  dialog {
    width: min(92vw, 460px);
    padding: 22px 20px 20px;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--line);
    border-top: 3px solid var(--open);
    border-radius: 0;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.65);
  }
  h2 {
    margin: 0 0 16px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 30px;
    text-transform: uppercase;
  }
  .rows {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--ink);
    border: 1px solid var(--line);
  }
  li div {
    display: grid;
    gap: 2px;
  }
  li span {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
  li strong {
    flex: none;
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    color: var(--gold);
  }
  li strong.zero {
    color: var(--muted);
  }
  p {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--muted);
  }
  .close {
    margin-top: 8px;
    width: 100%;
    min-height: 44px;
    border: 0;
    background: var(--text);
    color: var(--ink);
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
