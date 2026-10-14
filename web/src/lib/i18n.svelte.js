// Tiny translation layer. Czech is the default; the choice is remembered.
// Use t('key') in templates. Add new text to BOTH dictionaries below.
const cs = {
  'brand.1': 'Worlds',
  'brand.2': 'tipovačka',
  'nav.matches': 'Zápasy',
  'nav.leaderboard': 'Žebříček',
  'nav.admin': 'Admin',
  'nav.logout': 'Odhlásit se',
  'nav.sections': 'Sekce',
  loading: 'Načítám…',
  tbd: 'TBD',

  'login.title1': 'Tipni si každou',
  'login.title2': 'sérii.',
  'login.sub': 'Tipuj výsledky všech zápasů Worlds. Nejvíc bodů vyhrává.',
  'login.join': 'Registrace',
  'login.login': 'Přihlášení',
  'login.invite': 'Pozvánkový kód',
  'login.name': 'Jméno',
  'login.pin': 'PIN',
  'login.pinHint': '(6–12 číslic)',
  'login.busy': 'Moment…',
  'login.joinBtn': 'Připojit se do hry',
  'login.loginBtn': 'Přihlásit se',

  'filter.all': 'Vše',
  'filter.open': 'Otevřené',
  'filter.finished': 'Dokončené',
  'matches.aria': 'Filtr zápasů',
  'matches.loading': 'Načítám zápasy…',
  'matches.none': 'Zatím žádné zápasy. Zkus to později.',
  'matches.emptyView': 'V tomto zobrazení nic není.',

  'card.match': 'Zápas',
  'card.final': 'Konec',
  'card.live': '● Živě',
  'card.tbd': 'Týmy se teprve určí',
  'card.locked': 'Uzamčeno',
  'card.locksIn': 'Uzamčení za',
  'card.yourPick': 'Tvůj tip',
  'card.noPick': 'Bez tipu',
  'card.everyone': 'Tipy všech',
  'card.pickAria': 'Tvůj tipovaný výsledek',
  pts: 'b.',

  'lb.title': 'Žebříček',
  'lb.none': 'Zatím žádní hráči.',
  'lb.you': '(ty)',
  'lb.exact': 'přesně',
  'lb.winner': 'vítěz',

  'player.back': '← Žebříček',
  'player.notFound': 'Hráč nenalezen.',
  'player.none': 'Zatím žádné uzamčené tipy. Tipy se zobrazí po začátku zápasu.',
  'player.pick': 'Tip',
  'player.result': 'Výsledek',

  'admin.title': 'Admin',
  'admin.addMatch': 'Přidat zápas',
  'admin.stage': 'Fáze',
  'admin.stagePh': 'Swiss, čtvrtfinále…',
  'admin.team1': 'Tým 1',
  'admin.team2': 'Tým 2',
  'admin.bestOf': 'Best of',
  'admin.start': 'Začátek (tvůj čas)',
  'admin.matches': 'Zápasy',
  'admin.noMatches': 'Zatím žádné zápasy.',
  'admin.setResult': 'Nastavit výsledek',
  'admin.delete': 'Smazat',
  'admin.sync': 'Synchronizace',
  'admin.syncHint':
    'Stáhne rozpis a výsledky z LoL Esports API. Běží i automaticky každých pár minut.',
  'admin.syncNow': 'Synchronizovat',
  'admin.scoring': 'Bodování',
  'admin.scoringHint': 'Přepočítá body ve všech dokončených zápasech. Lze spustit kdykoli.',
  'admin.rescore': 'Přepočítat vše',
  'admin.players': 'Hráči',
  'admin.adminTag': ' · admin',
  'admin.makeAdmin': 'Udělat adminem',
  'admin.removeAdmin': 'Zrušit admina',
  'admin.remove': 'Odebrat',
  'admin.removeFirst': 'Nejdřív zruš adminská práva',
  'admin.state.unstarted': 'nezačal',
  'admin.state.inProgress': 'probíhá',
  'admin.state.completed': 'Konec {a}–{b}',
  'admin.confirmResult': 'Nastavit výsledek: {label}?',
  'admin.confirmDelete': 'Smazat {a} vs {b} i s tipy?',
  'admin.confirmRemove': 'Odebrat hráče {name}? Jeho tipy a body budou smazány.',
  'admin.added': 'Zápas přidán.',
  'admin.resultSaved': 'Výsledek uložen a body přepočítány: {label}',
  'admin.deleted': 'Zápas smazán.',
  'admin.rescored': 'Přepočítáno zápasů: {n}.',
  'admin.nowAdmin': '{name} je nyní admin.',
  'admin.noLongerAdmin': '{name} už není admin.',
  'admin.removed': '{name} byl odebrán.',
  'admin.synced': 'Synchronizováno: {inserted} nových, {updated} změněných, {scored} obodovaných.',

  'unit.d': 'd',
  'unit.h': 'h',
  'unit.m': 'min',
  'unit.s': 's',
};

const en = {
  'brand.1': 'Worlds',
  'brand.2': 'tipovačka',
  'nav.matches': 'Matches',
  'nav.leaderboard': 'Leaderboard',
  'nav.admin': 'Admin',
  'nav.logout': 'Log out',
  'nav.sections': 'Sections',
  loading: 'Loading…',
  tbd: 'TBD',

  'login.title1': 'Call your',
  'login.title2': 'series.',
  'login.sub': 'Predict every Worlds match. Most points wins.',
  'login.join': 'Join',
  'login.login': 'Log in',
  'login.invite': 'Invite code',
  'login.name': 'Name',
  'login.pin': 'PIN',
  'login.pinHint': '(6–12 digits)',
  'login.busy': 'One moment…',
  'login.joinBtn': 'Join the game',
  'login.loginBtn': 'Log in',

  'filter.all': 'All',
  'filter.open': 'Open',
  'filter.finished': 'Finished',
  'matches.aria': 'Filter matches',
  'matches.loading': 'Loading matches…',
  'matches.none': 'No matches yet. Check back soon.',
  'matches.emptyView': 'Nothing in this view.',

  'card.match': 'Match',
  'card.final': 'Final',
  'card.live': '● Live',
  'card.tbd': 'Teams to be decided',
  'card.locked': 'Locked',
  'card.locksIn': 'Locks in',
  'card.yourPick': 'Your pick',
  'card.noPick': 'No pick made',
  'card.everyone': "Everyone's picks",
  'card.pickAria': 'Your predicted score',
  pts: 'pts',

  'lb.title': 'Leaderboard',
  'lb.none': 'No players yet.',
  'lb.you': '(you)',
  'lb.exact': 'exact',
  'lb.winner': 'correct',

  'player.back': '← Leaderboard',
  'player.notFound': 'Player not found.',
  'player.none': 'No locked picks yet. Picks appear once a match starts.',
  'player.pick': 'Pick',
  'player.result': 'Result',

  'admin.title': 'Admin',
  'admin.addMatch': 'Add match',
  'admin.stage': 'Stage',
  'admin.stagePh': 'Swiss, Quarterfinal…',
  'admin.team1': 'Team 1',
  'admin.team2': 'Team 2',
  'admin.bestOf': 'Best of',
  'admin.start': 'Start (your local time)',
  'admin.matches': 'Matches',
  'admin.noMatches': 'No matches yet.',
  'admin.setResult': 'Set result',
  'admin.delete': 'Delete',
  'admin.sync': 'Sync',
  'admin.syncHint':
    'Pulls the schedule and results from the LoL Esports API. This also runs automatically every few minutes.',
  'admin.syncNow': 'Sync now',
  'admin.scoring': 'Scoring',
  'admin.scoringHint': 'Recalculates points for every completed match. Safe to run any time.',
  'admin.rescore': 'Rescore all',
  'admin.players': 'Players',
  'admin.adminTag': ' · admin',
  'admin.makeAdmin': 'Make admin',
  'admin.removeAdmin': 'Remove admin',
  'admin.remove': 'Remove',
  'admin.removeFirst': 'Remove admin rights first',
  'admin.state.unstarted': 'unstarted',
  'admin.state.inProgress': 'in progress',
  'admin.state.completed': 'Final {a}–{b}',
  'admin.confirmResult': 'Set result: {label}?',
  'admin.confirmDelete': 'Delete {a} vs {b} and its picks?',
  'admin.confirmRemove': 'Remove {name}? Their picks and points are deleted.',
  'admin.added': 'Match added.',
  'admin.resultSaved': 'Result saved and scored: {label}',
  'admin.deleted': 'Match deleted.',
  'admin.rescored': 'Matches rescored: {n}.',
  'admin.nowAdmin': '{name} is now an admin.',
  'admin.noLongerAdmin': '{name} is no longer an admin.',
  'admin.removed': '{name} was removed.',
  'admin.synced': 'Synced: {inserted} new, {updated} updated, {scored} scored.',

  'unit.d': 'd',
  'unit.h': 'h',
  'unit.m': 'm',
  'unit.s': 's',
};

const messages = { cs, en };

// Stage names come from the API in English.
const stages = {
  cs: {
    'Play-Ins': 'Play-In',
    Swiss: 'Švýcarský systém',
    Quarterfinals: 'Čtvrtfinále',
    Semifinals: 'Semifinále',
    Finals: 'Finále',
  },
  en: {},
};

// Server error messages are English; known ones are translated here.
const errorsCs = {
  'Invalid invite code': 'Neplatný pozvánkový kód',
  'Name must be 1-30 characters': 'Jméno musí mít 1–30 znaků',
  'PIN must be 6-12 digits': 'PIN musí mít 6–12 číslic',
  'Name already taken': 'Toto jméno je už obsazené',
  'Invalid name or PIN': 'Nesprávné jméno nebo PIN',
  'Too many failed attempts, try again later':
    'Příliš mnoho neúspěšných pokusů, zkus to později',
  'Not logged in': 'Nejsi přihlášený',
  'Match is locked': 'Zápas je už uzamčený',
  'Teams are not decided yet': 'Týmy ještě nejsou známé',
  'Match not found': 'Zápas nenalezen',
  'User not found': 'Hráč nenalezen',
  Forbidden: 'Přístup odepřen',
  'Not found': 'Nenalezeno',
  'Something went wrong': 'Něco se pokazilo',
  'Cannot reach the server. Check your connection.':
    'Server není dostupný. Zkontroluj připojení.',
  'bestOf must be 1, 3 or 5': 'Best of musí být 1, 3 nebo 5',
  'startTime must be an ISO 8601 date': 'Neplatné datum začátku',
  'Only manual matches can be deleted': 'Smazat lze jen ručně přidané zápasy',
  'Sync is not configured (set ESPORTS_API_KEY)':
    'Synchronizace není nastavená (chybí ESPORTS_API_KEY)',
  'You cannot change your own admin status': 'Vlastní admin práva změnit nelze',
  'You cannot remove yourself': 'Nemůžeš odebrat sám sebe',
  'Remove admin rights before removing this user': 'Nejdřív zruš adminská práva',
};

const STORAGE_KEY = 'lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in messages) return saved;
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 'cs';
}

const startLang = initialLang();
let lang = $state(startLang);
document.documentElement.lang = startLang;

export const i18n = {
  get lang() {
    return lang;
  },
  setLang(next) {
    if (!(next in messages)) return;
    lang = next;
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  },
};

// t('admin.removed', { name: 'Bob' })
export function t(key, params) {
  const text = messages[lang][key] ?? messages.en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : text;
}

export function stage(name) {
  if (!name) return t('card.match');
  return stages[lang][name] ?? name;
}

export function translateError(message, status) {
  if (lang !== 'cs') return message;
  if (status === 429) return 'Příliš mnoho pokusů, zkus to za chvíli';
  if (errorsCs[message]) return errorsCs[message];
  if (message.startsWith('Invalid score')) return 'Neplatný výsledek pro tento formát';
  if (message.startsWith('Sync failed:')) {
    return `Synchronizace selhala:${message.slice('Sync failed:'.length)}`;
  }
  return message;
}
