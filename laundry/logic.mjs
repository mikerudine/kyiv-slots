/**
 * Pure match-3 laundry logic (colour+type matching, per-colour baskets, timed rounds).
 * Tunable constants live at the top — adjust after sim/tests.
 *
 * Matching: same COLOUR and same ITEM TYPE.
 * Socks-only for now (`ITEM_TYPES = ['sock']`); add 'briefs'/'tee' later.
 * Baskets: per colour only — any matched red items fill the red basket.
 */

// ---- tunable constants ----
/** Board size. */
export let COLS = 8;
export let ROWS = 8;

/**
 * Laundry item types. Matching requires colour AND type.
 * Socks only for now — append 'briefs' / 'tee' later without changing match rules.
 */
export const ITEM_TYPES = ['sock'];
/** Alias kept for existing call sites / UI. */
export const ITEM_KINDS = ITEM_TYPES;

/**
 * Colour palette (Ukrainian UI names). First START_COLOURS are active at round 1.
 * `mark` is a static colour-blind cue drawn on every tile of that colour.
 */
export const COLOURS = [
  { id: 'red', ua: 'червоний', en: 'red', hex: '#e11d48', dark: '#9f1239', mark: 'hatch' },
  { id: 'blue', ua: 'синій', en: 'blue', hex: '#2563eb', dark: '#1e40af', mark: 'dots' },
  { id: 'yellow', ua: 'жовтий', en: 'yellow', hex: '#ca8a04', dark: '#a16207', mark: 'cross' },
  { id: 'green', ua: 'зелений', en: 'green', hex: '#16a34a', dark: '#15803d', mark: 'triangle' },
  { id: 'orange', ua: 'помаранчевий', en: 'orange', hex: '#ea580c', dark: '#c2410c', mark: 'wave' },
  { id: 'violet', ua: 'фіолетовий', en: 'violet', hex: '#7c3aed', dark: '#5b21b6', mark: 'square' },
  { id: 'cyan', ua: 'блакитний', en: 'cyan', hex: '#0891b2', dark: '#0e7490', mark: 'diamond' },
];

/** Start with 4 sock colours; +1 colour every COLOUR_EVERY_N_ROUNDS rounds. */
export let START_COLOURS = 4;
export const MAX_COLOURS = COLOURS.length; // 7
/** New colour (+ basket) at the start of rounds 4, 7, 10… */
export const COLOUR_EVERY_N_ROUNDS = 3;

export const ROUND_DURATION_START = 60; // seconds
export const ROUND_DURATION_DROP = 10;  // every COLOUR_EVERY_N_ROUNDS rounds
/** Owner note: “if you made it within 30 seconds” → bonus for early basket load. */
export const QUICK_WASH_WINDOW = 30;
export const QUICK_WASH_BONUS = 50;

export const POINTS_PER_ITEM = 1;

/**
 * Extra weight for a neighbour’s (colour, kind) when dealing/refilling.
 * Socks-only boards cascade easily — keep bias modest.
 */
export let REFILL_NEIGHBOR_BIAS = 0.85;

/**
 * Base basket capacity at START_COLOURS. Scales with colour count.
 * Tuned via greedy sim for ~30–45s to first full basket (socks-only).
 */
export let BASKET_CAPACITY_BASE = 48;

/** Floor so late rounds with many colours stay reachable. */
export let BASKET_CAPACITY_MIN = 16;

/** Apply a tune profile (used by the capacity sweep / tests). */
export function applyTune(opts = {}) {
  if (opts.rows != null) ROWS = opts.rows | 0;
  if (opts.cols != null) COLS = opts.cols | 0;
  if (opts.startColours != null) START_COLOURS = opts.startColours | 0;
  if (opts.refillBias != null) REFILL_NEIGHBOR_BIAS = +opts.refillBias;
  if (opts.capacityBase != null) BASKET_CAPACITY_BASE = opts.capacityBase | 0;
  if (opts.capacityMin != null) BASKET_CAPACITY_MIN = opts.capacityMin | 0;
}

export function kindCount() {
  return ITEM_KINDS.length;
}

export function tileKinds(colourCount) {
  return colourCount * kindCount();
}

export function basketCapacity(colourCount) {
  const n = Math.max(1, colourCount | 0);
  return Math.max(
    BASKET_CAPACITY_MIN,
    Math.round(BASKET_CAPACITY_BASE * (START_COLOURS / n)),
  );
}

export function coloursForRound(round) {
  const extra = Math.floor(Math.max(0, round - 1) / COLOUR_EVERY_N_ROUNDS);
  return Math.min(MAX_COLOURS, START_COLOURS + extra);
}

export function durationForRound(round) {
  const drops = Math.floor(Math.max(0, round - 1) / COLOUR_EVERY_N_ROUNDS);
  return ROUND_DURATION_START - drops * ROUND_DURATION_DROP;
}

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randInt(rng, n) {
  return (rng() * n) | 0;
}

export function tilesEqual(a, b) {
  return !!a && !!b && a.colour === b.colour && a.kind === b.kind;
}

export function createTile(colour, kind, id) {
  return { colour, kind, id };
}

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function wouldMatchAt(board, r, c, colour, kind) {
  // horizontal: two identical to the left
  if (c >= 2) {
    const a = board[r][c - 1]; const b = board[r][c - 2];
    if (a && b && a.colour === colour && a.kind === kind && b.colour === colour && b.kind === kind) {
      return true;
    }
  }
  // vertical: two identical above
  if (r >= 2) {
    const a = board[r - 1][c]; const b = board[r - 2][c];
    if (a && b && a.colour === colour && a.kind === kind && b.colour === colour && b.kind === kind) {
      return true;
    }
  }
  return false;
}

function neighborWeight(board, r, c, colour, kind) {
  let w = 1;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dr, dc] of dirs) {
    const rr = r + dr; const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
    const t = board[rr][cc];
    if (t && t.colour === colour && t.kind === kind) w += REFILL_NEIGHBOR_BIAS;
  }
  return w;
}

/** Weighted pick of (colour, kind); optionally avoid creating an immediate match. */
export function pickTileSpec(board, r, c, colourCount, rng, avoidMatch) {
  const kinds = kindCount();
  const opts = [];
  let total = 0;
  for (let colour = 0; colour < colourCount; colour++) {
    for (let kind = 0; kind < kinds; kind++) {
      if (avoidMatch && wouldMatchAt(board, r, c, colour, kind)) continue;
      const w = neighborWeight(board, r, c, colour, kind);
      opts.push({ colour, kind, w });
      total += w;
    }
  }
  // Fallback if every option would match (dense board)
  if (!opts.length) {
    return {
      colour: randInt(rng, colourCount),
      kind: randInt(rng, kinds),
    };
  }
  let roll = rng() * total;
  for (const o of opts) {
    roll -= o.w;
    if (roll <= 0) return { colour: o.colour, kind: o.kind };
  }
  const last = opts[opts.length - 1];
  return { colour: last.colour, kind: last.kind };
}

export function fillBoard(colourCount, rng, nextId) {
  const board = createEmptyBoard();
  let id = nextId || 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let spec; let guard = 0;
      do {
        spec = pickTileSpec(board, r, c, colourCount, rng, true);
        guard++;
        // if bias keeps proposing matches, fall back to uniform avoid
        if (guard > 20) {
          spec = {
            colour: randInt(rng, colourCount),
            kind: randInt(rng, kindCount()),
          };
        }
      } while (guard < 60 && wouldMatchAt(board, r, c, spec.colour, spec.kind));
      board[r][c] = createTile(spec.colour, spec.kind, id++);
    }
  }
  return { board, nextId: id };
}

/** Runs of 3+ identical tiles (same colour AND kind). */
export function findMatches(board) {
  const marked = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const runs = [];

  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && tilesEqual(board[r][c], board[r][c - 1]);
      if (same) run++;
      else {
        if (run >= 3) {
          const cells = [];
          for (let k = 0; k < run; k++) {
            marked[r][c - 1 - k] = true;
            cells.push({ r, c: c - 1 - k });
          }
          runs.push(cells);
        }
        run = 1;
      }
    }
  }

  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && tilesEqual(board[r][c], board[r - 1][c]);
      if (same) run++;
      else {
        if (run >= 3) {
          const cells = [];
          for (let k = 0; k < run; k++) {
            marked[r - 1 - k][c] = true;
            cells.push({ r: r - 1 - k, c });
          }
          runs.push(cells);
        }
        run = 1;
      }
    }
  }

  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (marked[r][c]) cells.push({ r, c });
  }
  return { cells, runs, marked };
}

export function swapCreatesMatch(board, r1, c1, r2, c2) {
  const a = board[r1][c1];
  const b = board[r2][c2];
  if (!a || !b) return false;
  board[r1][c1] = b;
  board[r2][c2] = a;
  const ok = findMatches(board).cells.length > 0;
  board[r1][c1] = a;
  board[r2][c2] = b;
  return ok;
}

export function hasAnyMove(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && swapCreatesMatch(board, r, c, r, c + 1)) return true;
      if (r + 1 < ROWS && swapCreatesMatch(board, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

export function findMove(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && swapCreatesMatch(board, r, c, r, c + 1)) {
        return { r1: r, c1: c, r2: r, c2: c + 1 };
      }
      if (r + 1 < ROWS && swapCreatesMatch(board, r, c, r + 1, c)) {
        return { r1: r, c1: c, r2: r + 1, c2: c };
      }
    }
  }
  return null;
}

export function shuffleBoard(board, rng) {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c]) tiles.push(board[r][c]);
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = tiles[i]; tiles[i] = tiles[j]; tiles[j] = t;
  }
  let k = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    board[r][c] = tiles[k++];
  }
}

/** Reshuffle / redeal until no ready matches and at least one move exists. */
export function ensurePlayable(board, colourCount, rng, nextIdRef) {
  let tries = 0;
  while (tries++ < 80) {
    if (findMatches(board).cells.length) {
      const filled = fillBoard(colourCount, rng, nextIdRef.v);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = filled.board[r][c];
      nextIdRef.v = filled.nextId;
      continue;
    }
    if (hasAnyMove(board)) return true;
    shuffleBoard(board, rng);
    if (findMatches(board).cells.length) continue;
    if (hasAnyMove(board)) return true;
    // shuffle alone stuck — full redeal
    const filled = fillBoard(colourCount, rng, nextIdRef.v);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = filled.board[r][c];
    nextIdRef.v = filled.nextId;
  }
  return hasAnyMove(board);
}

/**
 * Clear matched cells, gravity + biased refill. Returns per-colour item counts.
 * Cascades until stable. Reshuffles if no moves remain.
 */
export function resolveMatches(board, colourCount, rng, nextIdRef) {
  const collected = Array(colourCount).fill(0);
  let waves = 0;
  const MAX_WAVES = 40;

  while (waves++ < MAX_WAVES) {
    const { cells } = findMatches(board);
    if (!cells.length) break;

    for (const { r, c } of cells) {
      const tile = board[r][c];
      if (!tile) continue;
      if (tile.colour >= 0 && tile.colour < colourCount) collected[tile.colour]++;
      board[r][c] = null;
    }

    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (r !== write) {
            board[write][c] = board[r][c];
            board[r][c] = null;
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        // During cascade refill, allow matches (they continue the cascade).
        // Soft bias toward neighbours so boards stay lively with many kinds.
        const spec = pickTileSpec(board, r, c, colourCount, rng, false);
        board[r][c] = createTile(spec.colour, spec.kind, nextIdRef.v++);
      }
    }
  }

  if (!hasAnyMove(board)) ensurePlayable(board, colourCount, rng, nextIdRef);
  return { collected, waves };
}

export function adjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

/**
 * Attempt a swap. Returns { ok, collected, invalid } where collected is per-colour counts
 * if the swap matched (after full cascade). Invalid swaps leave the board unchanged.
 */
export function trySwap(board, r1, c1, r2, c2, colourCount, rng, nextIdRef) {
  if (!adjacent(r1, c1, r2, c2)) return { ok: false, invalid: true, collected: null };
  const a = board[r1][c1];
  const b = board[r2][c2];
  if (!a || !b) return { ok: false, invalid: true, collected: null };

  board[r1][c1] = b;
  board[r2][c2] = a;
  if (findMatches(board).cells.length === 0) {
    board[r1][c1] = a;
    board[r2][c2] = b;
    return { ok: false, invalid: true, collected: null };
  }
  const { collected, waves } = resolveMatches(board, colourCount, rng, nextIdRef);
  return { ok: true, invalid: false, collected, waves };
}

/** Full game session state machine (no rendering / timers — caller advances time). */
export function createGame(opts = {}) {
  const rng = opts.rng || makeRng(opts.seed || (Date.now() & 0xffffffff));
  const nextIdRef = { v: 1 };

  const state = {
    running: false,
    over: false,
    endReason: null, // 'power' | 'shutdown' | null
    round: 1,
    colourCount: START_COLOURS,
    duration: ROUND_DURATION_START,
    timeLeft: ROUND_DURATION_START,
    roundElapsed: 0,
    baskets: [],
    washQueue: [],
    roundLoaded: false,
    score: 0,
    itemsCollected: 0,
    itemsWashed: 0,
    basketsWashed: 0,
    roundsSurvived: 0,
    quickBonuses: 0,
    board: createEmptyBoard(),
    capacity: basketCapacity(START_COLOURS),
  };

  function resetBaskets(n) {
    state.baskets = Array.from({ length: n }, () => ({ count: 0, full: false }));
  }

  function setupRound(round) {
    const dur = durationForRound(round);
    if (dur <= 0) {
      state.over = true;
      state.running = false;
      state.endReason = 'power';
      return false;
    }
    state.round = round;
    state.colourCount = coloursForRound(round);
    state.capacity = basketCapacity(state.colourCount);
    state.duration = dur;
    state.timeLeft = dur;
    state.roundElapsed = 0;
    state.roundLoaded = false;

    const prev = state.baskets;
    resetBaskets(state.colourCount);
    for (let i = 0; i < Math.min(prev.length, state.baskets.length); i++) {
      state.baskets[i].count = Math.min(prev[i].count, state.capacity);
      state.baskets[i].full = state.baskets[i].count >= state.capacity;
    }

    const filled = fillBoard(state.colourCount, rng, nextIdRef.v);
    state.board = filled.board;
    nextIdRef.v = filled.nextId;
    ensurePlayable(state.board, state.colourCount, rng, nextIdRef);
    return true;
  }

  function addToBaskets(collected) {
    const newlyFull = [];
    for (let i = 0; i < collected.length; i++) {
      if (!collected[i]) continue;
      const b = state.baskets[i];
      if (!b) continue;
      const wasFull = b.full;
      b.count = Math.min(state.capacity, b.count + collected[i]);
      state.itemsCollected += collected[i];
      state.score += collected[i] * POINTS_PER_ITEM;
      if (b.count >= state.capacity) {
        b.full = true;
        if (!wasFull) newlyFull.push(i);
      }
    }
    return newlyFull;
  }

  function washBasket(colourIndex) {
    const b = state.baskets[colourIndex];
    if (!b) return 0;
    const items = b.count;
    state.itemsWashed += items;
    state.basketsWashed += 1;
    b.count = 0;
    b.full = false;
    state.washQueue = state.washQueue.filter((c) => c !== colourIndex);
    return items;
  }

  function loadBasket(colourIndex, deferExtras = []) {
    if (state.over || !state.running) return { ok: false };
    const b = state.baskets[colourIndex];
    if (!b || !b.full) return { ok: false };

    const quick = state.roundElapsed <= QUICK_WASH_WINDOW;
    if (quick) {
      state.score += QUICK_WASH_BONUS;
      state.quickBonuses += 1;
    }

    const deferred = state.washQueue.filter((c) => c !== colourIndex);
    washBasket(colourIndex);
    for (const ci of deferred) washBasket(ci);

    state.washQueue = [];
    for (const ci of deferExtras) {
      if (ci === colourIndex) continue;
      if (state.baskets[ci] && state.baskets[ci].full && !state.washQueue.includes(ci)) {
        state.washQueue.push(ci);
      }
    }

    state.roundLoaded = true;
    state.roundsSurvived += 1;

    const finishedRound = state.round;
    const next = state.round + 1;
    const started = setupRound(next);
    return {
      ok: true,
      washed: colourIndex,
      deferred,
      deferredNext: state.washQueue.slice(),
      quickBonus: quick,
      finishedRound,
      nextRound: started ? state.round : null,
      powerOut: !started,
    };
  }

  function handleFills(newlyFull) {
    if (!newlyFull.length) return null;
    if (state.roundLoaded) {
      for (const ci of newlyFull) {
        if (!state.washQueue.includes(ci)) state.washQueue.push(ci);
      }
      return null;
    }
    const primary = newlyFull[0];
    const extras = newlyFull.slice(1);
    return loadBasket(primary, extras);
  }

  function swap(r1, c1, r2, c2) {
    if (!state.running || state.over) return { ok: false };
    const res = trySwap(state.board, r1, c1, r2, c2, state.colourCount, rng, nextIdRef);
    if (!res.ok) return res;
    const newlyFull = addToBaskets(res.collected);
    const wash = handleFills(newlyFull);
    return { ...res, newlyFull, wash };
  }

  /**
   * Resolve matches on the current board (caller already swapped tiles).
   * Used by the UI clear animation so the board can fade before gravity.
   */
  function resolveBoard() {
    if (!state.running || state.over) return { ok: false };
    const { collected, waves } = resolveMatches(state.board, state.colourCount, rng, nextIdRef);
    const newlyFull = addToBaskets(collected);
    const wash = handleFills(newlyFull);
    return { ok: true, invalid: false, collected, waves, newlyFull, wash };
  }

  function tick(dt) {
    if (!state.running || state.over) return null;
    state.timeLeft -= dt;
    state.roundElapsed += dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      if (!state.roundLoaded) {
        state.over = true;
        state.running = false;
        state.endReason = 'shutdown';
        return { type: 'shutdown' };
      }
      return null;
    }
    return null;
  }

  function start() {
    state.running = true;
    state.over = false;
    state.endReason = null;
    state.score = 0;
    state.itemsCollected = 0;
    state.itemsWashed = 0;
    state.basketsWashed = 0;
    state.roundsSurvived = 0;
    state.quickBonuses = 0;
    state.washQueue = [];
    nextIdRef.v = 1;
    resetBaskets(START_COLOURS);
    setupRound(1);
  }

  function snapshot() {
    return {
      running: state.running,
      over: state.over,
      endReason: state.endReason,
      round: state.round,
      colourCount: state.colourCount,
      duration: state.duration,
      timeLeft: state.timeLeft,
      roundElapsed: state.roundElapsed,
      capacity: state.capacity,
      baskets: state.baskets.map((b) => ({ ...b })),
      washQueue: state.washQueue.slice(),
      roundLoaded: state.roundLoaded,
      score: state.score,
      itemsCollected: state.itemsCollected,
      itemsWashed: state.itemsWashed,
      basketsWashed: state.basketsWashed,
      roundsSurvived: state.roundsSurvived,
      quickBonuses: state.quickBonuses,
      board: state.board.map((row) => row.map((t) => (t ? { ...t } : null))),
    };
  }

  return {
    state,
    start,
    swap,
    resolveBoard,
    tick,
    loadBasket,
    findMove: () => findMove(state.board),
    snapshot,
    rng,
    nextIdRef,
    addToBaskets,
    handleFills,
    setupRound,
    washBasket,
  };
}

/**
 * Greedy bot: always play a found match move.
 * Estimates seconds-to-first-basket-fill assuming `secondsPerMove`.
 */
export function simulateCapacity(opts = {}) {
  const colourCount = opts.colourCount || START_COLOURS;
  const capacity = opts.capacity != null ? opts.capacity : basketCapacity(colourCount);
  const secondsPerMove = opts.secondsPerMove || 1.8; // slightly slower — harder matches
  const maxMoves = opts.maxMoves || 250;
  const trials = opts.trials || 40;
  const seed0 = opts.seed || 42;

  const times = [];
  let reshuffles = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(seed0 + t * 9973);
    const nextIdRef = { v: 1 };
    const filled = fillBoard(colourCount, rng, 1);
    const board = filled.board;
    nextIdRef.v = filled.nextId;
    ensurePlayable(board, colourCount, rng, nextIdRef);
    const baskets = Array(colourCount).fill(0);
    let moves = 0;
    let filledAt = null;
    while (moves < maxMoves) {
      let m = findMove(board);
      if (!m) {
        reshuffles++;
        ensurePlayable(board, colourCount, rng, nextIdRef);
        m = findMove(board);
        if (!m) break;
      }
      const res = trySwap(board, m.r1, m.c1, m.r2, m.c2, colourCount, rng, nextIdRef);
      moves++;
      if (!res.ok) continue;
      for (let i = 0; i < res.collected.length; i++) {
        baskets[i] += res.collected[i];
        if (baskets[i] >= capacity) {
          filledAt = moves;
          break;
        }
      }
      if (filledAt != null) break;
    }
    if (filledAt != null) times.push(filledAt * secondsPerMove);
  }

  times.sort((a, b) => a - b);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : Infinity;
  const med = times.length ? times[(times.length / 2) | 0] : Infinity;
  const p20 = times.length ? times[Math.floor(times.length * 0.2)] : Infinity;
  const p80 = times.length ? times[Math.floor(times.length * 0.8)] : Infinity;
  return {
    colourCount,
    kinds: tileKinds(colourCount),
    rows: ROWS,
    cols: COLS,
    bias: REFILL_NEIGHBOR_BIAS,
    capacity,
    secondsPerMove,
    trials,
    filledTrials: times.length,
    reshuffles,
    avgSec: +avg.toFixed(1),
    medianSec: +med.toFixed(1),
    p20Sec: +p20.toFixed(1),
    p80Sec: +p80.toFixed(1),
  };
}
