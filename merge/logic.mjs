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

/** Weighted next-piece spawn. Mostly batteries; occasional higher; sometimes blackout. */
export function rollNext(rng = Math.random) {
  const r = rng();
  if (r < 0.10) return KIND.BLACKOUT;
  if (r < 0.78) return KIND.BATTERY;
  if (r < 0.90) return KIND.POWERBANK;
  if (r < 0.97) return KIND.STATION;
  return KIND.GENERATOR;
}

export function createGame(rng = Math.random) {
  return {
    board: emptyBoard(),
    next: rollNext(rng),
    hold: KIND.EMPTY,
    score: 0,
    over: false,
    turns: 0,
  };
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
  game.next = rollNext(rng);

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
    game.next = rollNext(rng);
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
