import { describe, expect, it } from 'vitest';
import { createSaveQueue } from '../web/src/lib/saveQueue.js';

// A fake server that records every request and how many ran at the same time.
function fakeServer({ failOn = [] } = {}) {
  const log = [];
  let active = 0;
  let maxActive = 0;
  const gates = [];
  return {
    log,
    gates,
    get maxActive() {
      return maxActive;
    },
    send(matchId, t1, t2) {
      active++;
      maxActive = Math.max(maxActive, active);
      log.push(`${matchId}:${t1}-${t2}`);
      return new Promise((resolve, reject) => {
        gates.push(() => {
          active--;
          if (failOn.includes(`${matchId}:${t1}-${t2}`)) reject(new Error('rejected'));
          else resolve({ prediction: { matchId, team1: t1, team2: t2 } });
        });
      });
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(server) {
  const events = [];
  const queue = createSaveQueue({
    send: server.send,
    onSaved: (id, res, isLatest) =>
      events.push(`saved ${id} ${res.prediction.team1}-${res.prediction.team2} latest=${isLatest}`),
    onFailed: (id, e) => events.push(`failed ${id} ${e.message}`),
    onIdle: () => events.push('idle'),
  });
  return { queue, events };
}

describe('createSaveQueue', () => {
  it('saves a single pick', async () => {
    const server = fakeServer();
    const { queue, events } = setup(server);

    const done = queue.save('m1', 2, 0);
    expect(queue.isBusy()).toBe(true);
    server.gates.shift()();
    await done;

    expect(server.log).toEqual(['m1:2-0']);
    expect(events).toEqual(['saved m1 2-0 latest=true', 'idle']);
    expect(queue.isBusy()).toBe(false);
  });

  it('sends only the newest pick after a running save, never two at once', async () => {
    const server = fakeServer();
    const { queue, events } = setup(server);

    const first = queue.save('m1', 2, 0);
    queue.save('m1', 2, 1); // clicked while the first is in flight
    queue.save('m1', 1, 2); // and changed their mind again
    expect(server.log).toEqual(['m1:2-0']); // nothing else sent yet

    server.gates.shift()(); // first save finishes
    await tick();
    expect(server.log).toEqual(['m1:2-0', 'm1:1-2']); // the 2-1 click was skipped
    server.gates.shift()();
    await first;

    expect(events).toEqual([
      'saved m1 2-0 latest=false', // not the final state yet
      'saved m1 1-2 latest=true',
      'idle',
    ]);
    expect(server.maxActive).toBe(1);
  });

  it('keeps different matches independent', async () => {
    const server = fakeServer();
    const { queue } = setup(server);

    const a = queue.save('m1', 2, 0);
    const b = queue.save('m2', 0, 1);
    expect(server.log).toEqual(['m1:2-0', 'm2:0-1']);
    expect(server.maxActive).toBe(2);
    server.gates.shift()();
    server.gates.shift()();
    await Promise.all([a, b]);
  });

  it('reports a failure, drops queued clicks, and can save again afterwards', async () => {
    const server = fakeServer({ failOn: ['m1:2-0'] });
    const { queue, events } = setup(server);

    const first = queue.save('m1', 2, 0);
    queue.save('m1', 2, 1); // queued behind the failing save
    server.gates.shift()();
    await first;

    expect(server.log).toEqual(['m1:2-0']); // the queued click was dropped
    expect(events).toEqual(['failed m1 rejected', 'idle']);
    expect(queue.isBusy()).toBe(false);

    const again = queue.save('m1', 2, 1);
    server.gates.shift()();
    await again;
    expect(events.at(-2)).toBe('saved m1 2-1 latest=true');
  });
});
