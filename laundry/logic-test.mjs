#!/usr/bin/env node
/**
 * Headless logic + capacity simulation for laundry match-3
 * (match = colour AND type; baskets = per colour).
 * Run: node laundry/logic-test.mjs
 */
import assert from 'node:assert/strict';
import {
  COLS, ROWS, START_COLOURS, MAX_COLOURS, COLOURS, ITEM_KINDS,
  BASKET_CAPACITY_BASE, BASKET_CAPACITY_MIN, REFILL_NEIGHBOR_BIAS,
  QUICK_WASH_WINDOW, QUICK_WASH_BONUS,
  ROUND_DURATION_START, ROUND_DURATION_DROP, COLOUR_EVERY_N_ROUNDS,
  coloursForRound, durationForRound, basketCapacity, tileKinds,
  makeRng, fillBoard, findMatches, hasAnyMove, findMove, ensurePlayable,
  trySwap, createGame, simulateCapacity, createTile, tilesEqual,
} from './logic.mjs';

let passed = 0;
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail ? ': ' + detail : ''}`);
  passed++;
  console.log('  ✓', name, detail || '');
}

console.log('— constants / progression —');
ok('board 8x8', ROWS === 8 && COLS === 8);
ok('start colours 3', START_COLOURS === 3);
ok('kinds at start', tileKinds(START_COLOURS) === 9);
ok('max colours', MAX_COLOURS === 7 && COLOURS.length === 7);
ok('round1 colours', coloursForRound(1) === 3);
ok('round3 colours', coloursForRound(3) === 3);
ok('round4 colours', coloursForRound(4) === 4);
ok('round7 colours', coloursForRound(7) === 5);
ok('round10 colours', coloursForRound(10) === 6);
ok('round13 colours', coloursForRound(13) === 7);
ok('dur 1–3', durationForRound(1) === 60 && durationForRound(3) === 60);
ok('dur 4–6', durationForRound(4) === 50);
ok('dur would be 0', durationForRound(19) === 0);
ok('capacity at start', basketCapacity(3) === BASKET_CAPACITY_BASE);
ok('capacity scales down', basketCapacity(6) < basketCapacity(3));
ok('capacity floor', basketCapacity(99) >= BASKET_CAPACITY_MIN);
ok('refill bias set', REFILL_NEIGHBOR_BIAS === 1.0);

console.log('— matching by colour AND type —');
{
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // 3 red socks → match
  board[0][0] = createTile(0, 0, 1);
  board[0][1] = createTile(0, 0, 2);
  board[0][2] = createTile(0, 0, 3);
  board[0][3] = createTile(1, 0, 4);
  ok('same colour+kind matches', findMatches(board).cells.length === 3);

  // 2 red socks + 1 red tee → NO match
  board[1][0] = createTile(0, 0, 5);
  board[1][1] = createTile(0, 0, 6);
  board[1][2] = createTile(0, 2, 7); // tee
  ok('mixed kinds same colour no match', findMatches(board).cells.filter((c) => c.r === 1).length === 0);

  // same kind, different colours → no match
  board[2][0] = createTile(0, 1, 8);
  board[2][1] = createTile(1, 1, 9);
  board[2][2] = createTile(2, 1, 10);
  ok('same kind different colours no match', findMatches(board).cells.filter((c) => c.r === 2).length === 0);

  // vertical same colour+kind
  board[3][0] = createTile(2, 2, 11);
  board[4][0] = createTile(2, 2, 12);
  board[5][0] = createTile(2, 2, 13);
  ok('vertical colour+kind match', findMatches(board).cells.some((c) => c.r === 3 && c.c === 0));
  ok('tilesEqual', tilesEqual(board[3][0], board[4][0]) && !tilesEqual(board[1][0], board[1][2]));
}

console.log('— board fill / no ready matches / has moves / reshuffle —');
{
  for (let seed = 1; seed <= 25; seed++) {
    const rng = makeRng(seed * 17);
    const nextIdRef = { v: 1 };
    const { board } = fillBoard(3, rng, 1);
    nextIdRef.v = 100;
    const playable = ensurePlayable(board, 3, rng, nextIdRef);
    assert.ok(playable, 'seed ' + seed + ' ensurePlayable');
    assert.equal(findMatches(board).cells.length, 0, 'seed ' + seed + ' ready match');
    assert.ok(hasAnyMove(board), 'seed ' + seed + ' no moves');
  }
  ok('25 seeds: dealable + playable', true);

  // Force a no-move board and ensure reshuffle recovers
  const rng = makeRng(999);
  const nextIdRef = { v: 1 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // Checkerboard of unique-ish pairs so few matches/moves — then ensurePlayable
  let id = 1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = createTile((r + c) % 3, (r * 3 + c) % 3, id++);
  }
  // Clear any accidental matches by redeal path
  ensurePlayable(board, 3, rng, nextIdRef);
  ok('reshuffle recovers moves', hasAnyMove(board) && findMatches(board).cells.length === 0);
}

console.log('— swap / invalid / baskets collect by colour —');
{
  const rng = makeRng(99);
  const nextIdRef = { v: 1 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = createTile((r + c) % 3, (r + 2 * c) % 3, nextIdRef.v++);
  }
  // Plant: two red socks in a row, third red sock one row below to swap up
  board[0][0] = createTile(0, 0, nextIdRef.v++);
  board[0][1] = createTile(0, 0, nextIdRef.v++);
  board[0][2] = createTile(1, 1, nextIdRef.v++);
  board[1][2] = createTile(0, 0, nextIdRef.v++);
  board[0][3] = createTile(2, 2, nextIdRef.v++);

  const before = board[0][2].id;
  const bad = trySwap(board, 0, 3, 0, 2, 3, rng, nextIdRef);
  ok('invalid swap reverts', bad.invalid && board[0][2].id === before);

  const good = trySwap(board, 1, 2, 0, 2, 3, rng, nextIdRef);
  ok('valid colour+kind swap', good.ok && good.collected[0] >= 3, JSON.stringify(good.collected));

  // Basket counting: red socks + red tees both go to red
  const g = createGame({ seed: 7 });
  g.start();
  const newly = g.addToBaskets([3, 0, 0]); // 3 red (could be mixed kinds in real play)
  ok('basket by colour', g.state.baskets[0].count === 3 && newly.length === 0);
  g.addToBaskets([3, 0, 0]);
  ok('same colour accumulates', g.state.baskets[0].count === 6);
}

console.log('— round / wash / colour add / ends —');
{
  const g = createGame({ seed: 11 });
  g.start();
  ok('start round1 3 colours', g.state.round === 1 && g.state.colourCount === 3 && g.state.duration === 60);
  ok('capacity', g.state.capacity === basketCapacity(3));

  const cap = g.state.capacity;
  g.state.baskets[0].count = cap;
  g.state.baskets[0].full = true;
  g.state.baskets[1].count = cap;
  g.state.baskets[1].full = true;
  g.state.roundElapsed = 10;
  const wash = g.loadBasket(0, [1]);
  ok('wash + quick', wash.ok && wash.quickBonus && g.state.quickBonuses === 1);
  ok('deferred queue', g.state.washQueue.includes(1) && g.state.baskets[1].full);
  ok('round 2', g.state.round === 2);

  g.state.baskets[2].count = g.state.capacity;
  g.state.baskets[2].full = true;
  g.state.roundElapsed = 40;
  const wash2 = g.loadBasket(2);
  ok('deferred washed next round', wash2.deferred.includes(1) && g.state.basketsWashed === 3);

  // Jump to round 4 → 4 colours
  while (g.state.round < 4 && !g.state.over) {
    g.state.baskets[0].count = g.state.capacity;
    g.state.baskets[0].full = true;
    g.loadBasket(0);
  }
  ok('round 4 has 4 colours', g.state.round === 4 && g.state.colourCount === 4 && g.state.duration === 50);
  ok('4 baskets', g.state.baskets.length === 4);
}

{
  const g = createGame({ seed: 5 });
  g.start();
  const ev = g.tick(60.1);
  ok('emergency shutdown', ev && ev.type === 'shutdown' && g.state.endReason === 'shutdown');
}

{
  const g = createGame({ seed: 5 });
  g.start();
  g.state.round = 18;
  g.state.colourCount = coloursForRound(18);
  g.state.capacity = basketCapacity(g.state.colourCount);
  g.state.duration = durationForRound(18);
  g.state.timeLeft = g.state.duration;
  g.state.baskets = Array.from({ length: g.state.colourCount }, () => ({ count: 0, full: false }));
  g.state.baskets[0].count = g.state.capacity;
  g.state.baskets[0].full = true;
  const wash = g.loadBasket(0);
  ok('power out at dur 0', wash.powerOut && g.state.endReason === 'power');
}

console.log('— greedy bot capacity simulation —');
const sims = [];
for (const n of [3, 5, 6]) {
  const cap = basketCapacity(n);
  const sim = simulateCapacity({
    colourCount: n,
    capacity: cap,
    secondsPerMove: 1.8,
    trials: 50,
    seed: 100 + n,
  });
  sims.push(sim);
  console.log('  sim', JSON.stringify(sim));
  ok(
    `sim ${n}c/${tileKinds(n)}k fillable ~30–50s`,
    sim.filledTrials >= 45 && sim.medianSec >= 28 && sim.medianSec <= 52,
    `median=${sim.medianSec}s p20=${sim.p20Sec} p80=${sim.p80Sec} cap=${cap}`,
  );
}

console.log('\nAll', passed, 'assertions passed.');
console.log('TUNED_CONSTANTS', JSON.stringify({
  ROWS, COLS,
  START_COLOURS,
  MAX_COLOURS,
  ITEM_KINDS,
  kindsAtStart: tileKinds(START_COLOURS),
  REFILL_NEIGHBOR_BIAS,
  BASKET_CAPACITY_BASE,
  BASKET_CAPACITY_MIN,
  capacityAt3: basketCapacity(3),
  capacityAt4: basketCapacity(4),
  capacityAt5: basketCapacity(5),
  capacityAt6: basketCapacity(6),
  capacityAt7: basketCapacity(7),
  ROUND_DURATION_START,
  ROUND_DURATION_DROP,
  COLOUR_EVERY_N_ROUNDS,
  QUICK_WASH_WINDOW,
  QUICK_WASH_BONUS,
  sims,
}, null, 2));
