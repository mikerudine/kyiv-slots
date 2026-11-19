import {
  KIND, SIZE, createGame, place, swapHold, flood, emptyBoard, idx,
  resolveItemMerges, resolveObstacleMerges, moveBlackouts, unlitSet, isBoardFull,
  seedStarter,
} from './logic.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  }
}

function boardOf(pairs) {
  const b = emptyBoard();
  for (const [r, c, k] of pairs) b[idx(r, c)] = k;
  return b;
}

// Flood finds a 3-group
{
  const b = boardOf([[0, 0, KIND.BATTERY], [0, 1, KIND.BATTERY], [0, 2, KIND.BATTERY]]);
  assert(flood(b, 0).length === 3, 'flood 3 batteries');
}

// Place three batteries → powerbank at place cell + score
{
  const g = createGame(() => 0); // always blackout for next — override
  g.next = KIND.BATTERY;
  g.board = boardOf([[0, 1, KIND.BATTERY], [0, 2, KIND.BATTERY]]);
  const rng = () => 0.5; // battery spawn, and deterministic blackout moves
  const res = place(g, idx(0, 0), rng);
  assert(res.ok, 'place ok');
  assert(g.board[idx(0, 0)] === KIND.POWERBANK, 'merged to powerbank at place cell');
  assert(g.board[idx(0, 1)] === KIND.EMPTY && g.board[idx(0, 2)] === KIND.EMPTY, 'sources cleared');
  assert(g.score >= 1, 'score awarded');
}

// Chain merge: place battery into two batteries next to two powerbanks forming 3 PB
{
  const g = createGame(() => 0.5);
  g.next = KIND.BATTERY;
  // row0: B B _ ; after placing at (0,2) → PB at (0,2)
  // also PB at (1,2) and (2,2) → should chain to station at (0,2)
  g.board = boardOf([
    [0, 0, KIND.BATTERY], [0, 1, KIND.BATTERY],
    [1, 2, KIND.POWERBANK], [2, 2, KIND.POWERBANK],
  ]);
  place(g, idx(0, 2), () => 0.5);
  assert(g.board[idx(0, 2)] === KIND.STATION, 'chain merge to station');
  assert(g.score >= 1 + 3, 'chain score');
}

// Unlit cells next to blackout cannot merge
{
  const b = boardOf([
    [0, 0, KIND.BATTERY], [0, 1, KIND.BATTERY], [0, 2, KIND.BATTERY],
    [1, 1, KIND.BLACKOUT],
  ]);
  const unlit = unlitSet(b);
  assert(unlit.has(idx(0, 1)), 'cell above blackout is unlit');
  const scoreRef = { score: 0 };
  // Place-style: only count non-unlit except anchor — simulate merge from (0,0)
  // Manual: group from 0 filtered
  const group = flood(b, idx(0, 0)).filter((i) => i === idx(0, 0) || !unlit.has(i));
  // (0,0) and (0,2) are not unlit; (0,1) is — so group length 2
  assert(group.length === 2, 'unlit breaks the triple');
  resolveItemMerges(b, idx(0, 0), scoreRef);
  assert(b[idx(0, 0)] === KIND.BATTERY, 'no merge while blackout adjacent');
}

// Trapped blackout when no empty neighbours
{
  const b = boardOf([
    [0, 0, KIND.BLACKOUT],
    [0, 1, KIND.BATTERY], [1, 0, KIND.BATTERY],
  ]);
  const ev = moveBlackouts(b, () => 0);
  assert(b[idx(0, 0)] === KIND.TRAPPED, 'corner blackout traps');
  assert(ev.some((e) => e.type === 'trap'), 'trap event');
}

// Three trapped → lamp
{
  const b = boardOf([
    [0, 0, KIND.TRAPPED], [0, 1, KIND.TRAPPED], [0, 2, KIND.TRAPPED],
  ]);
  const scoreRef = { score: 0 };
  resolveObstacleMerges(b, scoreRef);
  assert(b[idx(0, 0)] === KIND.LAMP, '3 trapped → lamp');
  assert(scoreRef.score === 15, 'lamp score');
}

// Three lamps → streetlight
{
  const b = boardOf([
    [1, 1, KIND.LAMP], [1, 2, KIND.LAMP], [2, 1, KIND.LAMP],
  ]);
  const scoreRef = { score: 0 };
  resolveObstacleMerges(b, scoreRef);
  assert(
    [...b].filter((k) => k === KIND.STREET).length === 1 &&
      [...b].filter((k) => k === KIND.LAMP).length === 0,
    '3 lamps → streetlight'
  );
}

// Hold swap
{
  const g = createGame(() => 0.5);
  g.next = KIND.GENERATOR;
  swapHold(g, () => 0.5);
  assert(g.hold === KIND.GENERATOR, 'hold stores generator');
  assert(g.next === KIND.BATTERY, 'rolled new next');
  swapHold(g, () => 0.5);
  assert(g.next === KIND.GENERATOR, 'swap back');
}

// Board full → over
{
  const g = createGame(() => 0.5);
  g.next = KIND.BATTERY;
  g.board = emptyBoard().map(() => KIND.TEC);
  g.board[0] = KIND.EMPTY;
  const res = place(g, 0, () => 0.5);
  assert(res.ok && g.over && isBoardFull(g.board), 'game over when full');
}

// Starter seed: 4–5 low-tier, no blackouts, no immediate 3-match
{
  const b = emptyBoard();
  let i = 0;
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.05, 0.95];
  const rng = () => seq[i++ % seq.length];
  seedStarter(b, rng);
  const filled = b.filter((k) => k !== KIND.EMPTY);
  assert(filled.length >= 4 && filled.length <= 5, 'seed 4–5 items');
  assert(filled.every((k) => k === KIND.BATTERY || k === KIND.POWERBANK), 'only batteries/powerbanks');
  assert(!b.includes(KIND.BLACKOUT), 'no starter blackout');
  for (let c = 0; c < b.length; c++) {
    if (b[c] === KIND.EMPTY) continue;
    assert(flood(b, c).length < 3, 'no immediate 3-match after seed');
  }
}

// createGame seeds the board
{
  const g = createGame(() => 0.4);
  const n = g.board.filter((k) => k !== KIND.EMPTY).length;
  assert(n >= 4 && n <= 5, 'createGame seeds board');
  assert(g.next !== KIND.BLACKOUT, 'first next is not blackout');
}

assert(SIZE === 6, 'grid size 6');

if (failed) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}
console.log('merge logic-test: ok');
