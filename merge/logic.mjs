/**
 * «Накопич кіловати» — Triple Town–style merge logic (pure, no DOM).
 *
 * Chain: battery → powerbank → station → generator → solar → TEC
 * Enemy: blackout (moves); trapped → obstacle; 3 trapped → lamp; 3 lamps → streetlight
 */

export const SIZE = 6;

export const KIND = {
  EMPTY: 0,
  BATTERY: 1,
  POWERBANK: 2,
  STATION: 3,
  GENERATOR: 4,
  SOLAR: 5,
  TEC: 6,
  BLACKOUT: 10,
  TRAPPED: 11,
  LAMP: 12,
  STREET: 13,
};

/** Next merge tier for mergeable kinds; undefined = no further merge. */
export const NEXT_TIER = {
  [KIND.BATTERY]: KIND.POWERBANK,
  [KIND.POWERBANK]: KIND.STATION,
  [KIND.STATION]: KIND.GENERATOR,
  [KIND.GENERATOR]: KIND.SOLAR,
  [KIND.SOLAR]: KIND.TEC,
  [KIND.TRAPPED]: KIND.LAMP,
  [KIND.LAMP]: KIND.STREET,
};

/** кВт awarded when a merge produces this kind. */
export const SCORE_FOR = {
  [KIND.POWERBANK]: 1,
  [KIND.STATION]: 3,
  [KIND.GENERATOR]: 10,
  [KIND.SOLAR]: 25,
  [KIND.TEC]: 80,
  [KIND.LAMP]: 15,
  [KIND.STREET]: 40,
};

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

export function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => KIND.EMPTY);
}

export function idx(r, c) {
  return r * SIZE + c;
}

export function rc(i) {
  return [(i / SIZE) | 0, i % SIZE];
}

export function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE;
}

export function neighbors(i) {
  const [r, c] = rc(i);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) out.push(idx(nr, nc));
  }
  return out;
}

/** Orthogonally connected component of the same kind including start. */
export function flood(board, start) {
  const kind = board[start];
  if (kind === KIND.EMPTY) return [];
  const seen = new Set([start]);
  const stack = [start];
  const cells = [start];
  while (stack.length) {
    const i = stack.pop();
    for (const n of neighbors(i)) {
      if (!seen.has(n) && board[n] === kind) {
        seen.add(n);
        stack.push(n);
        cells.push(n);
      }
    }
  }
  return cells;
}

export function isActiveBlackout(kind) {
  return kind === KIND.BLACKOUT;
}

export function isMergeableItem(kind) {
  return kind >= KIND.BATTERY && kind <= KIND.SOLAR;
}

/**
 * Cells orthogonally adjacent to any active blackout are "unlit"
 * and cannot take part in item merges.
 */
export function unlitSet(board) {
  const set = new Set();
  for (let i = 0; i < board.length; i++) {
    if (board[i] === KIND.BLACKOUT) {
      for (const n of neighbors(i)) set.add(n);
    }
  }
  return set;
}

/**
 * After placing `kind` at `at`, resolve chain merges for normal items.
 * Unlit cells (next to active blackouts) are excluded from merge groups
 * except the freshly placed cell itself (so you can still place there).
 */
export function resolveItemMerges(board, at, scoreRef) {
  const events = [];
  let cursor = at;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const kind = board[cursor];
    const next = NEXT_TIER[kind];
    if (!next || kind === KIND.TRAPPED || kind === KIND.LAMP) break;
    const unlit = unlitSet(board);
    const group = flood(board, cursor).filter((i) => i === cursor || !unlit.has(i));
    if (group.length < 3) break;
    for (const i of group) board[i] = KIND.EMPTY;
    board[cursor] = next;
    const gained = SCORE_FOR[next] || 0;
    scoreRef.score += gained;
    events.push({ type: 'merge', from: kind, to: next, cells: group.slice(), at: cursor, score: gained });
  }
  return events;
}

/**
 * Resolve merges for trapped blackouts → lamps and lamps → streetlights.
 * Anchor stays at the first cell of each group (stable, readable).
 */
export function resolveObstacleMerges(board, scoreRef) {
  const events = [];
  let changed = true;
  while (changed) {
    changed = false;
    const visited = new Set();
    for (let i = 0; i < board.length; i++) {
      const kind = board[i];
      if (kind !== KIND.TRAPPED && kind !== KIND.LAMP) continue;
      if (visited.has(i)) continue;
      const group = flood(board, i);
      for (const g of group) visited.add(g);
      const next = NEXT_TIER[kind];
      if (!next || group.length < 3) continue;
      // Prefer keeping a cell that maximizes future adjacency (first in group is fine)
      const at = group[0];
      for (const g of group) board[g] = KIND.EMPTY;
      board[at] = next;
      const gained = SCORE_FOR[next] || 0;
      scoreRef.score += gained;
      events.push({ type: 'merge', from: kind, to: next, cells: group.slice(), at, score: gained });
      changed = true;
      break; // restart scan after mutation
    }
  }
  return events;
}

export function emptyAdjacent(board, i) {
  return neighbors(i).filter((n) => board[n] === KIND.EMPTY);
}

/**
 * Move each active blackout once to a random adjacent empty cell.
 * Order: scan board top-left → bottom-right; each moves at most once.
 * If no empty adjacent cell, convert to TRAPPED.
 */
export function moveBlackouts(board, rng = Math.random) {
  const events = [];
  const movers = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === KIND.BLACKOUT) movers.push(i);
  }
  // Move from bottom-right so earlier indices stay valid when possible
  const movedFrom = new Set();
  for (const from of movers) {
    if (movedFrom.has(from)) continue;
    if (board[from] !== KIND.BLACKOUT) continue;
    const empties = emptyAdjacent(board, from);
    if (!empties.length) {
      board[from] = KIND.TRAPPED;
      events.push({ type: 'trap', at: from });
      continue;
    }
    const to = empties[(rng() * empties.length) | 0];
    board[from] = KIND.EMPTY;
    board[to] = KIND.BLACKOUT;
    movedFrom.add(to);
    events.push({ type: 'move', from, to });
  }
  // Second pass: anything that became trapped by another blackout occupying its last cell
  for (let i = 0; i < board.length; i++) {
    if (board[i] === KIND.BLACKOUT && emptyAdjacent(board, i).length === 0) {
      board[i] = KIND.TRAPPED;
      events.push({ type: 'trap', at: i });
    }
  }
  return events;
}

/** Max consecutive batteries allowed as the rolled next piece. */
export const MAX_BATTERY_STREAK = 3;

/** Board is "crowded" when empty cells are at or below this share of the grid. */
export const CROWDED_EMPTY_RATIO = 0.25;

export function isCrowded(board) {
  return emptyCells(board).length / board.length <= CROWDED_EMPTY_RATIO;
}

/**
 * Pick from a list of [kind, weight] pairs using rng() ∈ [0, 1).
 * Weights are relative; they need not sum to 1.
 */
function pickWeighted(rng, pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let r = rng() * total;
  for (const [kind, w] of pairs) {
    r -= w;
    if (r < 0) return kind;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * Weighted next-piece spawn. Mostly batteries; occasional higher; sometimes blackout.
 *
 * Optional `opts`:
 * - `forbidBattery` — after a battery streak, roll only non-batteries (relative weights kept).
 * - `crowded` — late-game table: ~45% battery, more powerbanks/stations, blackout still ~10%.
 *
 * Plain `rollNext(rng)` keeps the original early-game table for tests/callers.
 */
export function rollNext(rng = Math.random, opts = {}) {
  const forbidBattery = !!(opts && opts.forbidBattery);
  const crowded = !!(opts && opts.crowded);

  // Early: BO 10, BAT 68, PB 12, ST 7, GEN 3
  // Crowded: BO 10, BAT 45, PB 25, ST 15, GEN 5
  const blackout = 10;
  const battery = crowded ? 45 : 68;
  const powerbank = crowded ? 25 : 12;
  const station = crowded ? 15 : 7;
  const generator = crowded ? 5 : 3;

  const table = forbidBattery
    ? [
        [KIND.BLACKOUT, blackout],
        [KIND.POWERBANK, powerbank],
        [KIND.STATION, station],
        [KIND.GENERATOR, generator],
      ]
    : [
        [KIND.BLACKOUT, blackout],
        [KIND.BATTERY, battery],
        [KIND.POWERBANK, powerbank],
        [KIND.STATION, station],
        [KIND.GENERATOR, generator],
      ];

  return pickWeighted(rng, table);
}

/**
 * Roll the next piece for a live game: applies battery-streak cap and crowded-board weights,
 * then updates `game.batteryStreak`. Use this from place()/swapHold(); keep rollNext for raw rolls.
 */
export function nextPiece(game, rng = Math.random) {
  if (typeof game.batteryStreak !== 'number' || game.batteryStreak < 0) {
    game.batteryStreak = 0;
  }
  const crowded = isCrowded(game.board);
  const forbidBattery = game.batteryStreak >= MAX_BATTERY_STREAK;
  const piece = rollNext(rng, { forbidBattery, crowded });
  game.batteryStreak = piece === KIND.BATTERY ? game.batteryStreak + 1 : 0;
  return piece;
}

/**
 * Pre-place 4–5 low-tier items (batteries + at most two power banks),
 * then 1 (occasionally 2) blackouts on cells that still have a free neighbour
 * so they are not trapped at start. Rejects item placements that would form
 * an immediate 3+ match.
 */
export function seedStarter(board, rng = Math.random) {
  const count = 4 + ((rng() * 2) | 0); // 4 or 5
  let powerbanks = 0;
  if (rng() < 0.55) powerbanks = 1;
  if (rng() < 0.25) powerbanks = Math.min(2, count - 1);
  const kinds = [];
  for (let i = 0; i < count - powerbanks; i++) kinds.push(KIND.BATTERY);
  for (let i = 0; i < powerbanks; i++) kinds.push(KIND.POWERBANK);
  // Fisher–Yates
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = t;
  }

  const placed = [];
  for (const kind of kinds) {
    const tried = new Set();
    let ok = false;
    for (let attempt = 0; attempt < 64 && !ok; attempt++) {
      const empties = emptyCells(board).filter((i) => !tried.has(i));
      if (!empties.length) break;
      const at = empties[(rng() * empties.length) | 0];
      tried.add(at);
      board[at] = kind;
      if (flood(board, at).length >= 3) {
        board[at] = KIND.EMPTY;
        continue;
      }
      placed.push(at);
      ok = true;
    }
  }

  // At least one blackout; ~30% of games get a second
  const blackoutCount = rng() < 0.3 ? 2 : 1;
  for (let n = 0; n < blackoutCount; n++) {
    const tried = new Set();
    let ok = false;
    for (let attempt = 0; attempt < 64 && !ok; attempt++) {
      const candidates = emptyCells(board).filter(
        (i) => !tried.has(i) && emptyAdjacent(board, i).length > 0
      );
      if (!candidates.length) break;
      const at = candidates[(rng() * candidates.length) | 0];
      tried.add(at);
      board[at] = KIND.BLACKOUT;
      // Still free after placing (another blackout shouldn't trap it immediately)
      if (emptyAdjacent(board, at).length === 0) {
        board[at] = KIND.EMPTY;
        continue;
      }
      placed.push(at);
      ok = true;
    }
  }
  return placed;
}

export function createGame(rng = Math.random) {
  const board = emptyBoard();
  seedStarter(board, rng);
  const game = {
    board,
    next: KIND.EMPTY,
    hold: KIND.EMPTY,
    score: 0,
    over: false,
    turns: 0,
    batteryStreak: 0,
  };
  game.next = nextPiece(game, rng);
  // Prefer a playable first piece (not blackout) on a fresh board
  if (game.next === KIND.BLACKOUT) {
    game.next = KIND.BATTERY;
    game.batteryStreak = 1;
  }
  return game;
}

export function emptyCells(board) {
  const out = [];
  for (let i = 0; i < board.length; i++) if (board[i] === KIND.EMPTY) out.push(i);
  return out;
}

export function isBoardFull(board) {
  return emptyCells(board).length === 0;
}

/**
 * Place current `next` onto empty cell `at`. Returns event list + updated state fields.
 * Mutates `game`.
 */
export function place(game, at, rng = Math.random) {
  if (game.over) return { ok: false, reason: 'over' };
  if (at < 0 || at >= game.board.length) return { ok: false, reason: 'bounds' };
  if (game.board[at] !== KIND.EMPTY) return { ok: false, reason: 'occupied' };

  const placed = game.next;
  const events = [];
  game.board[at] = placed;
  events.push({ type: 'place', kind: placed, at });

  const scoreRef = { score: game.score };

  if (isMergeableItem(placed) || placed === KIND.TEC) {
    events.push(...resolveItemMerges(game.board, at, scoreRef));
  }

  // Blackouts move after the player's placement
  events.push(...moveBlackouts(game.board, rng));
  events.push(...resolveObstacleMerges(game.board, scoreRef));

  // Item merges can become unblocked after blackouts move away — one more pass
  // only for cells that might have been freed; keep it simple: scan all mergeable groups
  events.push(...resolveAllItemMerges(game.board, scoreRef));

  game.score = scoreRef.score;
  game.turns += 1;
  game.next = nextPiece(game, rng);

  if (isBoardFull(game.board)) {
    game.over = true;
    events.push({ type: 'over', score: game.score });
  }

  return { ok: true, events, placed };
}

/** After blackout movement, merge any eligible item groups (anchor = first cell). */
export function resolveAllItemMerges(board, scoreRef) {
  const events = [];
  let changed = true;
  while (changed) {
    changed = false;
    const unlit = unlitSet(board);
    const visited = new Set();
    for (let i = 0; i < board.length; i++) {
      if (!isMergeableItem(board[i])) continue;
      if (visited.has(i) || unlit.has(i)) continue;
      const group = flood(board, i).filter((c) => !unlit.has(c));
      for (const g of flood(board, i)) visited.add(g);
      if (group.length < 3) continue;
      const kind = board[group[0]];
      const next = NEXT_TIER[kind];
      if (!next) continue;
      const at = group[0];
      for (const g of group) board[g] = KIND.EMPTY;
      board[at] = next;
      const gained = SCORE_FOR[next] || 0;
      scoreRef.score += gained;
      events.push({ type: 'merge', from: kind, to: next, cells: group.slice(), at, score: gained });
      changed = true;
      break;
    }
  }
  return events;
}

/**
 * Swap next with hold slot (Triple Town stash).
 * Empty hold stores next and rolls a fresh piece.
 */
export function swapHold(game, rng = Math.random) {
  if (game.over) return { ok: false };
  if (game.hold === KIND.EMPTY) {
    game.hold = game.next;
    game.next = nextPiece(game, rng);
  } else {
    const tmp = game.hold;
    game.hold = game.next;
    game.next = tmp;
  }
  return { ok: true };
}

/** Best-score helpers (localStorage key chosen by UI). */
export function readBest(storage, key) {
  try {
    const v = parseInt(storage.getItem(key) || '0', 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (_) {
    return 0;
  }
}

export function writeBest(storage, key, score) {
  const prev = readBest(storage, key);
  if (score > prev) {
    try {
      storage.setItem(key, String(score));
    } catch (_) {}
    return score;
  }
  return prev;
}
