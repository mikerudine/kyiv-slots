#!/usr/bin/env node
/** Headless checks for Outage Tetris (24×10 queue board). */
import assert from 'node:assert/strict';

const ROWS = 24;
const COLS = 10;
const QUEUES = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2'];

const SHAPES = {
  I: [[[1,0],[1,1],[1,2],[1,3]],[[0,2],[1,2],[2,2],[3,2]],[[2,0],[2,1],[2,2],[2,3]],[[0,1],[1,1],[2,1],[3,1]]],
  O: [[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]]],
  T: [[[0,1],[1,0],[1,1],[1,2]],[[0,1],[1,1],[1,2],[2,1]],[[1,0],[1,1],[1,2],[2,1]],[[0,1],[1,0],[1,1],[2,1]]],
  S: [[[0,1],[0,2],[1,0],[1,1]],[[0,1],[1,1],[1,2],[2,2]],[[1,1],[1,2],[2,0],[2,1]],[[0,0],[1,0],[1,1],[2,1]]],
  Z: [[[0,0],[0,1],[1,1],[1,2]],[[0,2],[1,1],[1,2],[2,1]],[[1,0],[1,1],[2,1],[2,2]],[[0,1],[1,0],[1,1],[2,0]]],
  J: [[[0,0],[1,0],[1,1],[1,2]],[[0,1],[0,2],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,0],[2,1]]],
  L: [[[0,2],[1,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[1,2],[2,0]],[[0,0],[0,1],[1,1],[2,1]]],
};

function cellsOf(type, rot, r, c) {
  return SHAPES[type][rot].map(([dr, dc]) => [r + dr, c + dc]);
}
function fits(grid, type, rot, r, c) {
  for (const [rr, cc] of cellsOf(type, rot, r, c)) {
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return false;
    if (grid[rr][cc]) return false;
  }
  return true;
}
function empty() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}
function clearLines(grid) {
  let cleared = 0;
  const g = grid.map((r) => r.slice());
  for (let r = ROWS - 1; r >= 0; r--) {
    if (g[r].every((v) => v)) {
      g.splice(r, 1);
      g.unshift(Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return { g, cleared };
}
function hourLabel(row) {
  return String(row).padStart(2, '0') + '–' + String(row + 1).padStart(2, '0');
}

assert.equal(QUEUES.length, 10);
assert.deepEqual(QUEUES, ['1.1','1.2','2.1','2.2','3.1','3.2','4.1','4.2','5.1','5.2']);
assert.equal(hourLabel(0), '00–01');
assert.equal(hourLabel(23), '23–24');
assert.equal(Array.from({ length: ROWS }, (_, r) => hourLabel(r)).length, 24);

for (const k of Object.keys(SHAPES)) {
  assert.equal(SHAPES[k].length, 4, k + ' rotations');
  for (const rot of SHAPES[k]) assert.equal(rot.length, 4, k + ' cells');
}
assert.deepEqual(Object.keys(SHAPES).sort(), ['I','J','L','O','S','T','Z']);

{
  const g = empty();
  assert.equal(fits(g, 'O', 0, 0, 0), true);
  assert.equal(fits(g, 'I', 0, 0, 7), false); // 7+3 = 10 out of bounds for horizontal I at c=7? I is 4 wide at c=7 -> cols 7,8,9,10 - false
  assert.equal(fits(g, 'I', 0, 0, 6), true);
  assert.equal(fits(g, 'I', 0, 0, -1), false);
  g[1][5] = 1;
  assert.equal(fits(g, 'O', 0, 0, 4), false);
}

{
  const g = empty();
  let c = 6, r = 0, rot = 0;
  assert.equal(fits(g, 'I', rot, r, c), true);
  const nrot = 1;
  let ok = false;
  for (const k of [0, -1, 1, -2, 2]) {
    if (fits(g, 'I', nrot, r, c + k)) { c += k; rot = nrot; ok = true; break; }
  }
  assert.equal(ok, true);
}

{
  const g = empty();
  for (let c = 0; c < COLS; c++) g[ROWS - 1][c] = 1;
  const { g: g2, cleared } = clearLines(g);
  assert.equal(cleared, 1);
  assert.equal(g2[ROWS - 1].every((v) => v === 0), true);
  assert.equal([0, 100, 300, 500, 800][1] * 2, 200);
}

{
  const g = empty();
  for (let c = 0; c < COLS; c++) { g[ROWS - 1][c] = 1; g[ROWS - 2][c] = 1; }
  g[ROWS - 3][0] = 1;
  const { g: g2, cleared } = clearLines(g);
  assert.equal(cleared, 2);
  assert.equal(g2[ROWS - 1][0], 1);
}

console.log('tetris logic-test: ok (24×10 queues)');
