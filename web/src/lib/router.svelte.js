// Minimal hash router: "#/leaderboard" -> path "/leaderboard".
let hash = $state(location.hash);

window.addEventListener('hashchange', () => {
  hash = location.hash;
  window.scrollTo(0, 0);
});

export const route = {
  get path() {
    return hash.replace(/^#/, '') || '/';
  },
};
