#!/usr/bin/env node
/**
 * Headless logic + capacity simulation for laundry match-3.
 * Run: node laundry/logic-test.mjs
 */
import assert from 'node:assert/strict';
import {
  COLS, ROWS, START_COLOURS, MAX_COLOURS, COLOURS,
  BASKET_CAPACITY_BASE, QUICK_WASH_WINDOW, QUICK_WASH_BONUS,
  ROUND_DURATION_START, ROUND_DURATION_DROP, COLOUR_EVERY_N_ROUNDS,
  coloursForRound, durationForRound, basketCapacity,
  makeRng, fillBoard, findMatches, hasAnyMove, findMove,
  trySwap, resolveMatches, createGame, simulateCapacity,
  createTile, ensurePlayable, swapCreatesMatch,
} from './logic.mjs';

let passed = 0;
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail ? ': ' + detail : ''}`);
  passed++;
  console.log('  ✓', name, detail || '');
}

console.log('— constants / progression —');
ok('start colours', START_COLOURS === 4);
ok('max colours', MAX_COLOURS === 7 && COLOURS.length === 7);
ok('round1 colours', coloursForRound(1) === 4);
ok('round3 colours', coloursForRound(3) === 4);
ok('round4 colours', coloursForRound(4) === 5);
ok('round7 colours', coloursForRound(7) === 6);
ok('round10 colours', coloursForRound(10) === 7);
ok('round13 colours', coloursForRound(13) === 7);
ok('dur 1–3', durationForRound(1) === 60 && durationForRound(3) === 60);
ok('dur 4–6', durationForRound(4) === 50 && durationForRound(6) === 50);
ok('dur 7', durationForRound(7) === 40);
ok('dur drops to 10', durationForRound(16) === 10);
ok('dur would be 0', durationForRound(19) === 0);
ok('capacity scales', basketCapacity(4) === BASKET_CAPACITY_BASE);
ok('capacity 6 < 4', basketCapacity(6) < basketCapacity(4));
ok('capacity floor', basketCapacity(99) >= 12);

console.log('— matching by colour only —');
{
  const rng = makeRng(1);
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // three red of mixed kinds in a row → match
  board[0][0] = createTile(0, 0, 1);
  board[0][1] = createTile(0, 1, 2);
  board[0][2] = createTile(0, 2, 3);
  board[0][3] = createTile(1, 0, 4);
  const m = findMatches(board);
  ok('colour match ignores kind', m.cells.length === 3, JSON.stringify(m.cells));

  // same kinds but different colours → no match
  board[1][0] = createTile(0, 0, 5);
  board[1][1] = createTile(1, 0, 6);
  board[1][2] = createTile(2, 0, 7);
  const m2 = findMatches(board);
  ok('different colours no match', m2.cells.filter((c) => c.r === 1).length === 0);

  // vertical
  board[2][0] = createTile(2, 1, 8);
  board[3][0] = createTile(2, 2, 9);
  board[4][0] = createTile(2, 0, 10);
  ok('vertical colour match', findMatches(board).cells.some((c) => c.r === 2 && c.c === 0));
}

console.log('— board fill / no ready matches / has moves —');
{
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed * 17);
    const nextIdRef = { v: 1 };
    const { board } = fillBoard(4, rng, 1);
    nextIdRef.v = 100;
    ensurePlayable(board, 4, rng, nextIdRef);
    assert.equal(findMatches(board).cells.length, 0, 'seed ' + seed + ' ready match');
    assert.ok(hasAnyMove(board), 'seed ' + seed + ' no moves');
  }
  ok('20 seeds: no ready matches + has moves', true);
}

console.log('— swap / invalid revert / cascades —');
{
  const rng = makeRng(99);
  const nextIdRef = { v: 1 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // Fill with colour 1 so no accidental matches, then plant a swap puzzle
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = createTile((r + c) % 2 === 0 ? 1 : 2, 0, nextIdRef.v++);
  }
  // Make a valid swap: two reds, swap a red into place for 3-in-a-row
  board[0][0] = createTile(0, 0, nextIdRef.v++);
  board[0][1] = createTile(0, 1, nextIdRef.v++);
  board[1][2] = createTile(0, 2, nextIdRef.v++); // swap with [0][2]
  board[0][2] = createTile(1, 0, nextIdRef.v++);
  board[0][3] = createTile(2, 0, nextIdRef.v++);

  const before = board[0][2].id;
  const bad = trySwap(board, 0, 3, 0, 2, 4, rng, nextIdRef);
  ok('invalid swap reverts', bad.invalid && board[0][2].id === before);

  const good = trySwap(board, 1, 2, 0, 2, 4, rng, nextIdRef);
  ok('valid swap clears', good.ok && good.collected[0] >= 3, 'collected=' + JSON.stringify(good.collected));
  ok('cascade waves', good.waves >= 1);
}

console.log('— basket counting —');
{
  const g = createGame({ seed: 7 });
  g.start();
  const snap0 = g.snapshot();
  ok('start round 1', snap0.round === 1 && snap0.colourCount === 4 && snap0.duration === 60);
  ok('baskets empty', snap0.baskets.every((b) => b.count === 0));
  ok('capacity', snap0.capacity === basketCapacity(4));

  // Inject collection
  const newly = g.addToBaskets([5, 0, 3, 0]);
  ok('basket add', g.state.baskets[0].count === 5 && g.state.baskets[2].count === 3);
  ok('not full yet', newly.length === 0 && g.state.itemsCollected === 8);
  ok('score items', g.state.score === 8);

  const cap = g.state.capacity;
  g.state.baskets[0].count = cap - 2;
  const newly2 = g.addToBaskets([5, 0, 0, 0]);
  ok('basket fills', g.state.baskets[0].full && newly2.includes(0));
}

console.log('— round load / wash queue / quick bonus —');
{
  const g = createGame({ seed: 11 });
  g.start();
  const cap = g.state.capacity;
  // Fill two baskets in one go
  g.state.baskets[0].count = cap;
  g.state.baskets[0].full = true;
  g.state.baskets[1].count = cap;
  g.state.baskets[1].full = true;
  g.state.roundElapsed = 10; // within quick window
  const wash = g.loadBasket(0, [1]);
  ok('wash ok', wash.ok && wash.washed === 0);
  ok('quick bonus', wash.quickBonus === true && g.state.quickBonuses === 1);
  ok('score has bonus', g.state.score >= QUICK_WASH_BONUS);
  ok('basket 0 emptied', g.state.baskets[0].count === 0 && !g.state.baskets[0].full);
  ok('basket 1 deferred full', g.state.baskets[1].full && g.state.washQueue.includes(1));
  ok('round advanced', g.state.round === 2 && g.state.roundsSurvived === 1);
  ok('baskets washed 1', g.state.basketsWashed === 1);

  // End next round by loading another basket — deferred should wash too
  g.state.baskets[2].count = g.state.capacity;
  g.state.baskets[2].full = true;
  g.state.roundElapsed = 40; // no quick bonus
  const wash2 = g.loadBasket(2);
  ok('deferred washed', wash2.deferred.includes(1));
  ok('no quick', wash2.quickBonus === false);
  ok('baskets washed 3', g.state.basketsWashed === 3); // 0,1,2
  ok('basket 1 empty now', !g.state.baskets[1].full && g.state.baskets[1].count === 0);
}

console.log('— colour addition at rounds 4/7 —');
{
  const g = createGame({ seed: 3 });
  g.start();
  // Jump by loading repeatedly with forced fills
  for (let r = 1; r < 4; r++) {
    g.state.baskets[0].count = g.state.capacity;
    g.state.baskets[0].full = true;
    g.loadBasket(0);
  }
  ok('at round 4', g.state.round === 4 && g.state.colourCount === 5 && g.state.duration === 50);
  ok('5 baskets', g.state.baskets.length === 5);
  for (let r = 4; r < 7; r++) {
    g.state.baskets[0].count = g.state.capacity;
    g.state.baskets[0].full = true;
    g.loadBasket(0);
  }
  ok('at round 7', g.state.round === 7 && g.state.colourCount === 6 && g.state.duration === 40);
}

console.log('— end: emergency shutdown —');
{
  const g = createGame({ seed: 5 });
  g.start();
  const ev = g.tick(60.1);
  ok('shutdown event', ev && ev.type === 'shutdown');
  ok('end reason shutdown', g.state.over && g.state.endReason === 'shutdown');
  ok('rounds survived 0', g.state.roundsSurvived === 0);
}

console.log('— end: power out when duration would be 0 —');
{
  const g = createGame({ seed: 5 });
  g.start();
  // Force round 18, then load → try round 19 with dur 0
  g.state.round = 18;
  g.state.colourCount = coloursForRound(18);
  g.state.capacity = basketCapacity(g.state.colourCount);
  g.state.duration = durationForRound(18);
  g.state.timeLeft = g.state.duration;
  resetBasketsFor(g);
  g.state.baskets[0].count = g.state.capacity;
  g.state.baskets[0].full = true;
  const wash = g.loadBasket(0);
  ok('power out after round 18', wash.powerOut === true && g.state.endReason === 'power');
  ok('survived 18→19 blocked', g.state.roundsSurvived >= 1 && g.state.over);
}

function resetBasketsFor(g) {
  const n = g.state.colourCount;
  g.state.baskets = Array.from({ length: n }, () => ({ count: 0, full: false }));
}

console.log('— greedy bot capacity simulation —');
const sims = [];
for (const n of [4, 6]) {
  const cap = basketCapacity(n);
  const sim = simulateCapacity({
    colourCount: n,
    capacity: cap,
    secondsPerMove: 1.6,
    trials: 50,
    seed: 100 + n,
  });
  sims.push(sim);
  console.log('  sim', JSON.stringify(sim));
  ok(
    `sim ${n}c fillable ~30–50s (median)`,
    sim.filledTrials >= 40 && sim.medianSec >= 20 && sim.medianSec <= 55,
    `median=${sim.medianSec}s p20=${sim.p20Sec} p80=${sim.p80Sec} cap=${cap}`,
  );
}

// Also report BASE sensitivity
console.log('— capacity sensitivity (report) —');
for (const base of [24, 30, 36, 42]) {
  for (const n of [4, 6]) {
    const cap = Math.max(12, Math.round(base * (4 / n)));
    const sim = simulateCapacity({ colourCount: n, capacity: cap, secondsPerMove: 1.6, trials: 30, seed: 200 + base + n });
    console.log(`  BASE=${base} n=${n} cap=${cap} → median ${sim.medianSec}s (p20=${sim.p20Sec} p80=${sim.p80Sec})`);
  }
}

console.log('\nAll', passed, 'assertions passed.');
console.log('FINAL_CONSTANTS', JSON.stringify({
  BASKET_CAPACITY_BASE,
  START_COLOURS,
  MAX_COLOURS,
  ROUND_DURATION_START,
  ROUND_DURATION_DROP,
  COLOUR_EVERY_N_ROUNDS,
  QUICK_WASH_WINDOW,
  QUICK_WASH_BONUS,
  COLS,
  ROWS,
  capacityAt4: basketCapacity(4),
  capacityAt6: basketCapacity(6),
  capacityAt7: basketCapacity(7),
  sims,
}, null, 2));
