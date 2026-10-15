// Saves picks one at a time per match, so the value stored on the server is
// always the user's last click. Clicking again while a save is running does
// not start a second request; only the newest choice is sent afterwards.
//
//   send(matchId, team1, team2)  -> Promise<server response>
//   onSaved(matchId, response, isLatest)  isLatest is false when a newer click
//                                          is already waiting to be sent
//   onFailed(matchId, error)     queued clicks for that match are dropped
//   onIdle()                     nothing is being saved any more
export function createSaveQueue({ send, onSaved, onFailed, onIdle }) {
  const running = new Map(); // matchId -> { next: [team1, team2] | null }

  async function save(matchId, team1, team2) {
    const active = running.get(matchId);
    if (active) {
      active.next = [team1, team2];
      return;
    }

    const run = { next: null };
    running.set(matchId, run);
    try {
      let pick = [team1, team2];
      while (pick) {
        let response;
        try {
          response = await send(matchId, pick[0], pick[1]);
        } catch (error) {
          onFailed(matchId, error);
          return;
        }
        const newer = run.next;
        run.next = null;
        onSaved(matchId, response, !newer);
        pick = newer;
      }
    } finally {
      running.delete(matchId);
      onIdle?.();
    }
  }

  return { save, isBusy: () => running.size > 0 };
}
