<script>
  import { api } from './lib/api.js';
  import { t } from './lib/i18n.svelte.js';

  let { onauthed } = $props();

  let mode = $state('login'); // 'join' | 'login'
  let inviteCode = $state('');
  let name = $state('');
  let pin = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const res =
        mode === 'join' ? await api.join(inviteCode, name, pin) : await api.login(name, pin);
      onauthed(res.user);
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel">
  <h1>{t('login.title1')} <em>{t('login.title2')}</em></h1>
  <p class="sub">{t('login.sub')}</p>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={mode === 'join'} onclick={() => (mode = 'join')}>
      {t('login.join')}
    </button>
    <button role="tab" aria-selected={mode === 'login'} onclick={() => (mode = 'login')}>
      {t('login.login')}
    </button>
  </div>

  <form onsubmit={submit}>
    {#if mode === 'join'}
      <label>
        {t('login.invite')}
        <input bind:value={inviteCode} autocomplete="off" required />
      </label>
    {/if}
    <label>
      {t('login.name')}
      <input bind:value={name} autocomplete="username" maxlength="30" required />
    </label>
    <label>
      {t('login.pin')} {mode === 'join' ? t('login.pinHint') : ''}
      <input
        bind:value={pin}
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete={mode === 'join' ? 'new-password' : 'current-password'}
        required
      />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button class="go" disabled={busy}>
      {busy ? t('login.busy') : mode === 'join' ? t('login.joinBtn') : t('login.loginBtn')}
    </button>
  </form>
</section>

<style>
  .panel {
    margin-top: 28px;
    padding: 28px 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-top: 3px solid var(--open);
    animation: rise 0.5s ease-out both;
  }
  h1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(44px, 14vw, 72px);
    line-height: 0.9;
    text-transform: uppercase;
    margin: 0 0 10px;
  }
  h1 em {
    font-style: normal;
    color: var(--open);
  }
  .sub {
    margin: 0 0 24px;
    color: var(--muted);
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--line);
    margin-bottom: 20px;
  }
  .tabs button {
    background: none;
    border: 0;
    padding: 12px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tabs button[aria-selected='true'] {
    background: var(--open);
    color: var(--ink);
  }
  form {
    display: grid;
    gap: 16px;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  input {
    background: var(--ink);
    border: 1px solid var(--line);
    padding: 14px;
    font-size: 17px;
    color: var(--text);
    text-transform: none;
    letter-spacing: normal;
    border-radius: 0;
  }
  input:focus {
    border-color: var(--open);
    outline: none;
  }
  .error {
    margin: 0;
    color: var(--live);
    font-size: 15px;
  }
  .go {
    padding: 15px;
    border: 0;
    background: var(--text);
    color: var(--ink);
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .go:disabled {
    opacity: 0.6;
    cursor: default;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
</style>
