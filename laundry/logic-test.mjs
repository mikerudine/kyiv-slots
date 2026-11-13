#!/usr/bin/env node
/**
 * Headless logic + capacity simulation for laundry match-3
 * (match = colour AND type; socks-only for now; baskets = per colour).
 * Run: node laundry/logic-test.mjs
 */
import assert from 'node:assert/strict';
import {
  COLS, ROWS, START_COLOURS, MAX_COLOURS, COLOURS, ITEM_KINDS, ITEM_TYPES,
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
ok('socks only', ITEM_TYPES.length === 1 && ITEM_TYPES[0] === 'sock' && ITEM_KINDS === ITEM_TYPES);
ok('start colours 4', START_COLOURS === 4);
ok('kinds at start', tileKinds(START_COLOURS) === 4);
ok('max colours', MAX_COLOURS === 7 && COLOURS.length === 7);
ok('round1 colours', coloursForRound(1) === 4);
ok('round3 colours', coloursForRound(3) === 4);
ok('round4 colours', coloursForRound(4) === 5);
ok('round7 colours', coloursForRound(7) === 6);
ok('round10 colours', coloursForRound(10) === 7);
ok('dur 1–3', durationForRound(1) === 60 && durationForRound(3) === 60);
ok('dur 4–6', durationForRound(4) === 50);
ok('dur would be 0', durationForRound(19) === 0);
ok('capacity at start', basketCapacity(4) === BASKET_CAPACITY_BASE);
ok('capacity scales down', basketCapacity(6) < basketCapacity(4));
ok('capacity floor', basketCapacity(99) >= BASKET_CAPACITY_MIN);
ok('refill bias set', REFILL_NEIGHBOR_BIAS === 0.85);

console.log('— matching by colour AND type (socks now; rule keeps future kinds) —');
{
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // 3 red socks → match
  board[0][0] = createTile(0, 0, 1);
  board[0][1] = createTile(0, 0, 2);
  board[0][2] = createTile(0, 0, 3);
  board[0][3] = createTile(1, 0, 4);
  ok('same colour+kind matches', findMatches(board).cells.length === 3);

  // Plant a future kind (tee=2) to prove mixed-type same colour still does not match
  board[1][0] = createTile(0, 0, 5);
  board[1][1] = createTile(0, 0, 6);
  board[1][2] = createTile(0, 2, 7); // tee (not dealt today, but rule holds)
  ok('mixed kinds same colour no match', findMatches(board).cells.filter((c) => c.r === 1).length === 0);

  // same kind, different colours → no match (row 2, cols 3–5 — clear of earlier runs)
  board[2][3] = createTile(0, 0, 8);
  board[2][4] = createTile(1, 0, 9);
  board[2][5] = createTile(2, 0, 10);
  ok(
    'same kind different colours no match',
    findMatches(board).cells.filter((c) => c.r === 2 && c.c >= 3).length === 0,
  );

  // vertical same colour+kind
  board[3][0] = createTile(2, 0, 11);
  board[4][0] = createTile(2, 0, 12);
  board[5][0] = createTile(2, 0, 13);
  ok('vertical colour+kind match', findMatches(board).cells.some((c) => c.r === 3 && c.c === 0));
  ok('tilesEqual', tilesEqual(board[3][0], board[4][0]) && !tilesEqual(board[1][0], board[1][2]));
}

console.log('— board fill / no ready matches / has moves / reshuffle —');
{
  for (let seed = 1; seed <= 25; seed++) {
    const rng = makeRng(seed * 17);
    const nextIdRef = { v: 1 };
    const { board } = fillBoard(4, rng, 1);
    nextIdRef.v = 100;
    const playable = ensurePlayable(board, 4, rng, nextIdRef);
    assert.ok(playable, 'seed ' + seed + ' ensurePlayable');
    assert.equal(findMatches(board).cells.length, 0, 'seed ' + seed + ' ready match');
    assert.ok(hasAnyMove(board), 'seed ' + seed + ' no moves');
  }
  ok('25 seeds: dealable + playable', true);

  const rng = makeRng(999);
  const nextIdRef = { v: 1 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let id = 1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = createTile((r + c) % 4, 0, id++);
  }
  ensurePlayable(board, 4, rng, nextIdRef);
  ok('reshuffle recovers moves', hasAnyMove(board) && findMatches(board).cells.length === 0);
}

console.log('— swap / invalid / baskets collect by colour —');
{
  const rng = makeRng(99);
  const nextIdRef = { v: 1 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = createTile((r + c) % 4, 0, nextIdRef.v++);
  }
  // Plant: two red socks in a row, third red sock one row below to swap up
  board[0][0] = createTile(0, 0, nextIdRef.v++);
  board[0][1] = createTile(0, 0, nextIdRef.v++);
  board[0][2] = createTile(1, 0, nextIdRef.v++);
  board[1][2] = createTile(0, 0, nextIdRef.v++);
  board[0][3] = createTile(2, 0, nextIdRef.v++);

  const before = board[0][2].id;
  const bad = trySwap(board, 0, 3, 0, 2, 4, rng, nextIdRef);
  ok('invalid swap reverts', bad.invalid && board[0][2].id === before);

  const good = trySwap(board, 1, 2, 0, 2, 4, rng, nextIdRef);
  ok('valid colour+kind swap', good.ok && good.collected[0] >= 3, JSON.stringify(good.collected));

  const g = createGame({ seed: 7 });
  g.start();
  const newly = g.addToBaskets([3, 0, 0, 0]);
  ok('basket by colour', g.state.baskets[0].count === 3 && newly.length === 0);
  g.addToBaskets([3, 0, 0, 0]);
  ok('same colour accumulates', g.state.baskets[0].count === 6);

  // resolveBoard after a manual swap
  const g2 = createGame({ seed: 21 });
  g2.start();
  const board2 = g2.state.board;
  // Find a move, swap manually, resolveBoard
  const m = g2.findMove();
  assert.ok(m, 'has move');
  const tA = board2[m.r1][m.c1];
  const tB = board2[m.r2][m.c2];
  board2[m.r1][m.c1] = tB;
  board2[m.r2][m.c2] = tA;
  const resolved = g2.resolveBoard();
  ok('resolveBoard after manual swap', resolved.ok && resolved.collected.some((n) => n > 0));
}

console.log('— round / wash / colour add / ends —');
{
  const g = createGame({ seed: 11 });
  g.start();
  ok('start round1 4 colours', g.state.round === 1 && g.state.colourCount === 4 && g.state.duration === 60);
  ok('capacity', g.state.capacity === basketCapacity(4));

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

  // Jump to round 4 → 5 colours (START=4)
  while (g.state.round < 4 && !g.state.over) {
    g.state.baskets[0].count = g.state.capacity;
    g.state.baskets[0].full = true;
    g.loadBasket(0);
  }
  ok('round 4 has 5 colours', g.state.round === 4 && g.state.colourCount === 5 && g.state.duration === 50);
  ok('5 baskets', g.state.baskets.length === 5);
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
for (const n of [4, 5, 6]) {
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
    `sim ${n}c/${tileKinds(n)}k fillable ~30–45s`,
    sim.filledTrials >= 45 && sim.medianSec >= 26 && sim.medianSec <= 52,
    `median=${sim.medianSec}s p20=${sim.p20Sec} p80=${sim.p80Sec} cap=${cap}`,
  );
}

console.log('\nAll', passed, 'assertions passed.');
console.log('TUNED_CONSTANTS', JSON.stringify({
  ROWS, COLS,
  START_COLOURS,
  MAX_COLOURS,
  ITEM_TYPES,
  ITEM_KINDS,
  kindsAtStart: tileKinds(START_COLOURS),
  REFILL_NEIGHBOR_BIAS,
  BASKET_CAPACITY_BASE,
  BASKET_CAPACITY_MIN,
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
