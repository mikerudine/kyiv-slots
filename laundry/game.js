/* One Day in Kyiv — laundry match-3 v2 (board + colour baskets + timed rounds) */
import {
  COLS, ROWS, ITEM_KINDS, ITEM_TYPES, COLOURS,
  QUICK_WASH_WINDOW, QUICK_WASH_BONUS,
  coloursForRound, durationForRound,
  createGame, findMatches, adjacent,
} from './logic.mjs';

const canvas = document.getElementById('game');
const wrapEl = document.getElementById('wrap');
const ctx = canvas.getContext('2d', { alpha: true });

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWAP_MS = reduceMotion ? 0.01 : 0.12;
const CLEAR_MS = reduceMotion ? 0.01 : 0.2;
const FALL_MS = reduceMotion ? 0.01 : 0.18;
const WASH_MS = reduceMotion ? 0.15 : 0.9;

// Layout is recomputed from the wrap’s CSS box so the 8×8 board can use
// full width and grow with the phone’s height (no fixed 9:16 letterbox).
let W = 360;
let H = 640;
let CELL = 40;
let BOARD_W = 320;
let BOARD_H = 320;
let BOARD_X = 20;
let BOARD_Y = 52;
let BASKET_STRIP_X = 6;
let BASKET_STRIP_Y = 400;
let BASKET_STRIP_W = 348;
let BASKET_STRIP_H = 96;

const MARGIN_X = 6;
const BOARD_BASKET_GAP = 6;
const BOTTOM_PAD = 8;
const HEADER_GAP = 8; // air between measured HUD chrome and board top
/** Basket chip sizing — reserve 2 rows so 7-colour boards keep the same CELL. */
const BASKET_CHIP_H = 56;
const BASKET_GAP = 4;
const BASKET_ROWS_MAX = 2;
const BASKET_STRIP_H_RESERVE = BASKET_ROWS_MAX * BASKET_CHIP_H + (BASKET_ROWS_MAX - 1) * BASKET_GAP;

/** Pixels from canvas top to just below the HUD chrome (title + timer). */
function topUiPx() {
  const chrome = document.getElementById('hudChrome');
  const canvasRect = canvas.getBoundingClientRect();
  if (!chrome || !canvasRect.height) return 96;
  const r = chrome.getBoundingClientRect();
  const scaleY = H / canvasRect.height;
  const below = (r.bottom - canvasRect.top) * scaleY;
  return Math.max(88, Math.ceil(below) + HEADER_GAP);
}

function relayout() {
  const rect = wrapEl.getBoundingClientRect();
  W = Math.max(280, Math.round(rect.width) || 360);
  H = Math.max(420, Math.round(rect.height) || 640);

  const top = topUiPx();
  // Always reserve 2 basket rows so CELL / BOARD_Y never jump when colours unlock.
  CELL = Math.max(24, Math.floor(Math.min(
    (W - MARGIN_X * 2) / COLS,
    (H - top - BOTTOM_PAD - BOARD_BASKET_GAP - BASKET_STRIP_H_RESERVE) / ROWS,
  )));
  BOARD_W = COLS * CELL;
  BOARD_H = ROWS * CELL;
  BOARD_X = Math.floor((W - BOARD_W) / 2);
  BASKET_STRIP_W = W - MARGIN_X * 2;
  BASKET_STRIP_X = MARGIN_X;
  BASKET_STRIP_H = BASKET_STRIP_H_RESERVE;

  const blockH = BOARD_H + BOARD_BASKET_GAP + BASKET_STRIP_H;
  const available = H - top - BOTTOM_PAD;
  const startY = top + Math.max(0, Math.floor((available - blockH) / 2));
  BOARD_Y = startY;
  BASKET_STRIP_Y = BOARD_Y + BOARD_H + BOARD_BASKET_GAP;
}

/** Horizontal chip grid under the board (1 row if ≤4, else 2 rows). */
function basketLayout(n) {
  const count = Math.max(1, n | 0);
  const cols = count <= 4 ? count : Math.ceil(count / 2);
  const rows = Math.ceil(count / cols);
  const gap = BASKET_GAP;
  const chipW = (BASKET_STRIP_W - gap * (cols - 1)) / cols;
  const chipH = BASKET_CHIP_H;
  const usedH = rows * chipH + (rows - 1) * gap;
  // Vertically centre the used rows inside the reserved strip.
  const originY = BASKET_STRIP_Y + Math.max(0, (BASKET_STRIP_H - usedH) / 2);
  return { cols, rows, gap, chipW, chipH, originY, originX: BASKET_STRIP_X, usedH };
}

function basketRect(i, n) {
  const L = basketLayout(n);
  const col = i % L.cols;
  const row = (i / L.cols) | 0;
  return {
    x: L.originX + col * (L.chipW + L.gap),
    y: L.originY + row * (L.chipH + L.gap),
    w: L.chipW,
    h: L.chipH,
  };
}

const I18N = {
  ua: {
    title: 'Стирка',
    hint: '3+ однакових шкарпеток одного кольору → у кошик. Заповни кошик, поки є світло.',
    round: (n) => `Раунд ${n}`,
    timer: (s) => `${Math.ceil(s)}`,
    score: (s) => `рахунок ${s | 0}`,
    overlayTitle: 'Стирка',
    overlayBody: 'Збирай 3+ шкарпетки одного кольору. Кожен колір має свій кошик. Заповнений кошик — у пральну машину, новий таймер. Кожен 3-й раунд: новий колір і менше часу.',
    start: 'Старт', again: 'Ще раз',
    powerTitle: 'Світло скінчилось',
    shutdownTitle: 'Екстрене відключення',
    overBody: 'Час прати на генераторі закінчився.',
    stats: (s) => `Рахунок ${s.score} · раундів ${s.roundsSurvived} · кошиків ${s.basketsWashed} · речей ${s.itemsWashed}`,
    pause: 'Пауза', pauseBody: 'Торкніться, щоб продовжити',
    wash: 'Прання…',
    washQuick: 'Швидке прання!',
    basketFull: 'Повний',
    load: 'У машину',
  },
  en: {
    title: 'Laundry',
    hint: 'Match 3+ socks of the same colour → colour basket. Fill a basket while the power lasts.',
    round: (n) => `Round ${n}`,
    timer: (s) => `${Math.ceil(s)}`,
    score: (s) => `score ${s | 0}`,
    overlayTitle: 'Laundry',
    overlayBody: 'Match 3+ socks of the same colour. Each colour has its own basket. A full basket goes into the washer and a new timer starts. Every 3rd round: a new colour and less time.',
    start: 'Start', again: 'Again',
    powerTitle: 'Power ran out',
    shutdownTitle: 'Emergency shutdown',
    overBody: 'No more washing without power.',
    stats: (s) => `Score ${s.score} · rounds ${s.roundsSurvived} · baskets ${s.basketsWashed} · items ${s.itemsWashed}`,
    pause: 'Paused', pauseBody: 'Tap to resume',
    wash: 'Washing…',
    washQuick: 'Quick wash!',
    basketFull: 'Full',
    load: 'Load',
  },
};

let lang = localStorage.getItem('laundry-lang') || 'ua';
const t = () => I18N[lang];

const game = createGame({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
let selected = null;
let busy = false;
let paused = false;
let anims = [];
let washFx = null; // { until, quick, colour }
let tileFx = new Map(); // id -> { ox, oy, scale, clear, fall0 }
let flyParts = []; // optional clear→basket particles (static ease, no blink)

const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const washOverlay = document.getElementById('washOverlay');

function resizeCanvas() {
  const rect = wrapEl.getBoundingClientRect();
  W = Math.max(280, Math.round(rect.width) || 360);
  H = Math.max(420, Math.round(rect.height) || 640);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  relayout();
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(() => { resizeCanvas(); });
setTimeout(() => resizeCanvas(), 50);

function applyLang() {
  const L = t();
  document.getElementById('tTitle').textContent = L.title;
  document.getElementById('hint').textContent = L.hint;
  document.getElementById('lang').textContent = lang.toUpperCase();
  document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
  document.getElementById('pauseTitle').textContent = L.pause;
  document.getElementById('pauseBody').textContent = L.pauseBody;
  document.getElementById('washText').textContent = L.wash;
  syncOverlay();
  syncHud();
}

document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'ua' ? 'en' : 'ua';
  localStorage.setItem('laundry-lang', lang);
  applyLang();
});

function syncHud() {
  const s = game.state;
  const L = t();
  const live = s.running || s.over;
  document.getElementById('roundLine').textContent = live ? L.round(s.round) : '';
  document.getElementById('scoreLine').textContent = live ? L.score(s.score) : '';

  const block = document.getElementById('timerBlock');
  const big = document.getElementById('timerBig');
  const fill = document.getElementById('timerFill');
  if (s.running && !s.over) {
    block.classList.add('show');
    const secs = Math.max(0, s.timeLeft);
    big.textContent = L.timer(secs);
    const frac = Math.max(0, Math.min(1, secs / Math.max(1, s.duration)));
    fill.style.transform = `scaleX(${frac})`;
    const warn = secs <= 15 && secs > 10;
    const danger = secs <= 10;
    big.classList.toggle('warn', warn);
    big.classList.toggle('danger', danger);
    fill.classList.toggle('warn', warn);
    fill.classList.toggle('danger', danger);
  } else {
    block.classList.remove('show');
    big.classList.remove('warn', 'danger');
    fill.classList.remove('warn', 'danger');
    fill.style.transform = 'scaleX(1)';
  }
}

function syncPauseBtn() {
  if (game.state.running && !game.state.over) pauseBtn.classList.remove('hidden');
  else pauseBtn.classList.add('hidden');
}

function setPaused(v) {
  if (!game.state.running || game.state.over) return;
  paused = !!v;
  if (paused) pauseOverlay.classList.add('show');
  else {
    pauseOverlay.classList.remove('show');
    last = performance.now();
  }
  applyLang();
}
function togglePause() {
  if (!game.state.running || game.state.over) return;
  setPaused(!paused);
}
pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
pauseOverlay.addEventListener('click', () => { if (paused) setPaused(false); });

function syncOverlay() {
  const L = t();
  const s = game.state;
  const overlay = document.getElementById('overlay');
  const stats = document.getElementById('oStats');
  if (s.over) {
    overlay.classList.remove('hidden');
    document.getElementById('oTitle').textContent =
      s.endReason === 'power' ? L.powerTitle : L.shutdownTitle;
    document.getElementById('oBody').textContent = L.overBody;
    stats.hidden = false;
    stats.textContent = L.stats(s);
    document.getElementById('oBtn').textContent = L.again;
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(true);
  } else if (!s.running) {
    overlay.classList.remove('hidden');
    document.getElementById('oTitle').textContent = L.overlayTitle;
    document.getElementById('oBody').textContent = L.overlayBody;
    stats.hidden = true;
    document.getElementById('oBtn').textContent = L.start;
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
  } else {
    overlay.classList.add('hidden');
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
  }
}

function posOf(r, c) {
  return { x: BOARD_X + c * CELL + CELL / 2, y: BOARD_Y + r * CELL + CELL / 2 };
}

function fxFor(tile) {
  if (!tile) return null;
  let f = tileFx.get(tile.id);
  if (!f) {
    f = { ox: 0, oy: 0, scale: 1, clear: 0, fall0: null };
    tileFx.set(tile.id, f);
  }
  return f;
}

function showWash(colour, quick) {
  washFx = { until: WASH_MS, quick: !!quick, colour };
  washOverlay.classList.add('show');
  document.getElementById('washText').textContent = quick ? t().washQuick : t().wash;
  const col = COLOURS[colour];
  if (col) washOverlay.querySelector('.washer').style.background = col.dark;
}

function hideWash() {
  washFx = null;
  washOverlay.classList.remove('show');
}

function afterWashResult(wash) {
  if (!wash || !wash.ok) return;
  busy = true;
  showWash(wash.washed, wash.quickBonus);
  let u = 0;
  anims.push((dt) => {
    u += dt;
    if (u >= WASH_MS) {
      hideWash();
      if (wash.powerOut || game.state.over) {
        busy = false;
        syncPauseBtn();
        syncOverlay();
        syncHud();
        return false;
      }
      const pre = game.state.baskets.findIndex((b) => b.full);
      if (pre >= 0) {
        const again = game.loadBasket(pre);
        afterWashResult(again);
        return false;
      }
      // Strip height is reserved — no layout jump; still refresh measure.
      resizeCanvas();
      busy = false;
      syncHud();
      syncPauseBtn();
      return false;
    }
    return true;
  });
}

/** Animate two tiles along ±(dx,dy). startFrac/endFrac in [0,1] of the full swap vector. */
function tweenSwapOffset(a, b, dx, dy, startFrac, endFrac, then) {
  const fa = fxFor(a);
  const fb = fxFor(b);
  let u = 0;
  anims.push((dt) => {
    u += dt / SWAP_MS;
    const t0 = Math.min(1, u);
    const e = startFrac + (endFrac - startFrac) * (t0 * t0 * (3 - 2 * t0));
    fa.ox = dx * e; fa.oy = dy * e;
    fb.ox = -dx * e; fb.oy = -dy * e;
    if (t0 >= 1) {
      then();
      return false;
    }
    return true;
  });
}

function snapshotIdPositions(board) {
  const map = new Map();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const tile = board[r][c];
    if (tile) map.set(tile.id, { r, c });
  }
  return map;
}

function runFallFrom(beforePos, res) {
  const falling = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const tile = game.state.board[r][c];
    if (!tile) continue;
    const f = fxFor(tile);
    f.ox = 0;
    f.scale = 1;
    f.clear = 0;
    const prev = beforePos.get(tile.id);
    if (prev) {
      f.oy = reduceMotion ? 0 : (prev.r - r) * CELL;
    } else {
      // New tile entering from above — short calm drop, not a sky-fall of the whole board.
      f.oy = reduceMotion ? 0 : -CELL * (1.1 + (r % 3) * 0.08);
    }
    f.fall0 = f.oy;
    if (f.oy !== 0) falling.push(f);
  }
  if (!falling.length) {
    syncHud();
    if (res && res.wash && res.wash.ok) afterWashResult(res.wash);
    else busy = false;
    return;
  }
  let u = 0;
  anims.push((dt) => {
    u += dt / FALL_MS;
    const t0 = Math.min(1, u);
    const e = t0 * t0 * (3 - 2 * t0);
    for (const f of falling) f.oy = (f.fall0 || 0) * (1 - e);
    if (t0 >= 1) {
      for (const f of falling) { f.oy = 0; f.fall0 = null; }
      syncHud();
      if (res && res.wash && res.wash.ok) afterWashResult(res.wash);
      else busy = false;
      return false;
    }
    return true;
  });
}

function animateClearThenResolve(matchCells) {
  const board = game.state.board;
  const clearing = [];
  const nB = game.state.baskets.length;

  for (const { r, c } of matchCells) {
    const tile = board[r][c];
    if (!tile) continue;
    const f = fxFor(tile);
    f.ox = 0;
    f.oy = 0;
    clearing.push({ tile, f, r, c, colour: tile.colour, kind: tile.kind });
    // Soft fly-to-basket particle (skipped under reduced motion).
    if (!reduceMotion && tile.colour < nB) {
      const from = posOf(r, c);
      const br = basketRect(tile.colour, nB);
      flyParts.push({
        x0: from.x, y0: from.y,
        x1: br.x + br.w / 2, y1: br.y + br.h * 0.4,
        colour: tile.colour, kind: tile.kind,
        u: 0, life: CELL * 0.45,
      });
    }
  }

  if (reduceMotion || !clearing.length) {
    const beforePos = snapshotIdPositions(board);
    // Remove matched tiles from fx map after resolve; snapshot first.
    const res = game.resolveBoard();
    // Drop fx for destroyed tiles; keep survivors.
    const live = new Set();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = game.state.board[r][c];
      if (t) live.add(t.id);
    }
    for (const id of [...tileFx.keys()]) if (!live.has(id)) tileFx.delete(id);
    runFallFrom(beforePos, res);
    return;
  }

  let u = 0;
  anims.push((dt) => {
    u += dt / CLEAR_MS;
    const t0 = Math.min(1, u);
    const e = t0 * t0 * (3 - 2 * t0);
    for (const g of clearing) {
      g.f.scale = 1 - e * 0.85;
      g.f.clear = e;
    }
    for (const p of flyParts) p.u = Math.min(1, t0);
    if (t0 >= 1) {
      flyParts = [];
      const beforePos = snapshotIdPositions(board);
      const res = game.resolveBoard();
      const live = new Set();
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const t = game.state.board[r][c];
        if (t) live.add(t.id);
      }
      for (const id of [...tileFx.keys()]) if (!live.has(id)) tileFx.delete(id);
      runFallFrom(beforePos, res);
      return false;
    }
    return true;
  });
}

function attemptSwap(r1, c1, r2, c2) {
  if (busy || paused || !game.state.running || game.state.over) return false;
  if (!adjacent(r1, c1, r2, c2)) return false;
  const board = game.state.board;
  const a = board[r1][c1];
  const b = board[r2][c2];
  if (!a || !b) return false;

  board[r1][c1] = b; board[r2][c2] = a;
  const willMatch = findMatches(board).cells.length > 0;
  board[r1][c1] = a; board[r2][c2] = b;

  const p1 = posOf(r1, c1);
  const p2 = posOf(r2, c2);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  busy = true;
  tweenSwapOffset(a, b, dx, dy, 0, 1, () => {
    if (!willMatch) {
      tweenSwapOffset(a, b, dx, dy, 1, 0, () => {
        const fa = fxFor(a); const fb = fxFor(b);
        fa.ox = fa.oy = fb.ox = fb.oy = 0;
        busy = false;
      });
      return;
    }
    // Commit swap on the board, reset visual offsets (tiles now live in new cells).
    board[r1][c1] = b;
    board[r2][c2] = a;
    const fa = fxFor(a); const fb = fxFor(b);
    fa.ox = fa.oy = fb.ox = fb.oy = 0;

    const matchCells = findMatches(board).cells;
    animateClearThenResolve(matchCells);
  });
  return true;
}

function trySelect(r, c) {
  if (busy || paused || !game.state.running || game.state.over) return;
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return;
  if (!selected) { selected = { r, c }; return; }
  if (selected.r === r && selected.c === c) { selected = null; return; }
  if (adjacent(selected.r, selected.c, r, c)) {
    const from = selected;
    selected = null;
    attemptSwap(from.r, from.c, r, c);
  } else {
    selected = { r, c };
  }
}

function basketHit(mx, my) {
  const n = game.state.baskets.length;
  if (!n) return -1;
  for (let i = 0; i < n; i++) {
    const r = basketRect(i, n);
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
  }
  return -1;
}

function tryLoadBasket(i) {
  if (busy || paused || !game.state.running || game.state.over) return;
  const b = game.state.baskets[i];
  if (!b || !b.full) return;
  const wash = game.loadBasket(i);
  if (wash.ok) afterWashResult(wash);
}

// ---- input ----
function hitCell(mx, my) {
  const c = Math.floor((mx - BOARD_X) / CELL);
  const r = Math.floor((my - BOARD_Y) / CELL);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
  return { r, c };
}

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

const pointer = { down: false, x: 0, y: 0, sr: -1, sc: -1 };

function onDown(e) {
  e.preventDefault();
  if (!game.state.running || paused || game.state.over || busy) return;
  const p = canvasPos(e.touches ? e.touches[0] : e);
  pointer.down = true; pointer.x = p.x; pointer.y = p.y;
  const bi = basketHit(p.x, p.y);
  if (bi >= 0 && game.state.baskets[bi].full) {
    tryLoadBasket(bi);
    pointer.sr = pointer.sc = -1;
    return;
  }
  const cell = hitCell(p.x, p.y);
  if (cell) { pointer.sr = cell.r; pointer.sc = cell.c; }
  else pointer.sr = pointer.sc = -1;
}
function onMove(e) {
  if (!pointer.down) return;
  const p = canvasPos(e.touches ? e.touches[0] : e);
  pointer.x = p.x; pointer.y = p.y;
}
function onUp(e) {
  if (!pointer.down) return;
  pointer.down = false;
  if (!game.state.running || paused || game.state.over || busy) return;
  const p = canvasPos(e.changedTouches ? e.changedTouches[0] : e);
  if (pointer.sr >= 0) {
    const dx = p.x - (BOARD_X + pointer.sc * CELL + CELL / 2);
    const dy = p.y - (BOARD_Y + pointer.sr * CELL + CELL / 2);
    const swipe = Math.max(10, CELL * 0.28);
    if (Math.abs(dx) > swipe || Math.abs(dy) > swipe) {
      let tr = pointer.sr; let tc = pointer.sc;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
      else tr += dy > 0 ? 1 : -1;
      if (tr >= 0 && tc >= 0 && tr < ROWS && tc < COLS) {
        selected = null;
        attemptSwap(pointer.sr, pointer.sc, tr, tc);
        return;
      }
    }
    const cell = hitCell(p.x, p.y);
    if (cell) trySelect(cell.r, cell.c);
    else trySelect(pointer.sr, pointer.sc);
  }
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', () => { pointer.down = false; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); }
  if (e.code === 'Enter' && !game.state.running) document.getElementById('oBtn').click();
});

document.getElementById('oBtn').addEventListener('click', () => {
  game.start();
  selected = null;
  busy = false;
  paused = false;
  anims = [];
  flyParts = [];
  tileFx.clear();
  hideWash();
  pauseOverlay.classList.remove('show');
  document.getElementById('overlay').classList.add('hidden');
  syncPauseBtn();
  applyLang();
  syncHud();
  // Timer block appears — remasure HUD chrome.
  requestAnimationFrame(() => resizeCanvas());
});

// ---- drawing ----
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawColourMark(mark, s) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.4;
  const h = s * 0.18;
  if (mark === 'hatch') {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-h * 2, i * h * 0.7);
      ctx.lineTo(h * 2, i * h * 0.7 + h);
      ctx.stroke();
    }
  } else if (mark === 'dots') {
    for (const [x, y] of [[-h, -h], [h, -h], [0, h * 0.2], [-h, h], [h, h]]) {
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  } else if (mark === 'cross') {
    ctx.beginPath();
    ctx.moveTo(-h, 0); ctx.lineTo(h, 0);
    ctx.moveTo(0, -h); ctx.lineTo(0, h);
    ctx.stroke();
  } else if (mark === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -h); ctx.lineTo(h, h); ctx.lineTo(-h, h); ctx.closePath();
    ctx.stroke();
  } else if (mark === 'wave') {
    ctx.beginPath();
    ctx.moveTo(-h * 1.4, 0);
    ctx.quadraticCurveTo(-h * 0.5, -h, 0, 0);
    ctx.quadraticCurveTo(h * 0.5, h, h * 1.4, 0);
    ctx.stroke();
  } else if (mark === 'square') {
    ctx.strokeRect(-h, -h, h * 2, h * 2);
  } else if (mark === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -h); ctx.lineTo(h, 0); ctx.lineTo(0, h); ctx.lineTo(-h, 0);
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function drawItemShape(kind, colourHex, s) {
  ctx.save();
  ctx.fillStyle = colourHex;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  const h = s / 2;
  if (kind === 0) { // sock
    ctx.beginPath();
    ctx.moveTo(-h * 0.28, -h * 0.72);
    ctx.lineTo(h * 0.22, -h * 0.72);
    ctx.lineTo(h * 0.28, h * 0.05);
    ctx.quadraticCurveTo(h * 0.72, h * 0.12, h * 0.55, h * 0.68);
    ctx.lineTo(-h * 0.02, h * 0.72);
    ctx.quadraticCurveTo(-h * 0.18, h * 0.22, -h * 0.28, h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-h * 0.26, -h * 0.72, h * 0.48, h * 0.18);
  } else if (kind === 1) { // briefs (kept for future ITEM_TYPES)
    ctx.beginPath();
    ctx.moveTo(-h * 0.58, -h * 0.22);
    ctx.lineTo(h * 0.58, -h * 0.22);
    ctx.lineTo(h * 0.48, h * 0.58);
    ctx.lineTo(h * 0.12, h * 0.18);
    ctx.lineTo(-h * 0.12, h * 0.18);
    ctx.lineTo(-h * 0.48, h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-h * 0.52, -h * 0.32, h * 1.04, h * 0.14);
  } else { // tee
    ctx.beginPath();
    ctx.moveTo(-h * 0.58, -h * 0.32);
    ctx.lineTo(-h * 0.22, -h * 0.55);
    ctx.lineTo(0, -h * 0.32);
    ctx.lineTo(h * 0.22, -h * 0.55);
    ctx.lineTo(h * 0.58, -h * 0.32);
    ctx.lineTo(h * 0.38, -h * 0.12);
    ctx.lineTo(h * 0.38, h * 0.62);
    ctx.lineTo(-h * 0.38, h * 0.62);
    ctx.lineTo(-h * 0.38, -h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawTile(tile, x, y, sel) {
  const f = fxFor(tile);
  const col = COLOURS[tile.colour];
  if (!col) return;
  const scale = f ? f.scale : 1;
  const s = CELL * 0.9 * scale;
  ctx.save();
  ctx.translate(x + (f ? f.ox : 0), y + (f ? f.oy : 0));
  if (f && f.clear) ctx.globalAlpha = Math.max(0, 1 - f.clear);

  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  roundRect(-s / 2, -s / 2, s, s, 8);
  ctx.fill();

  drawItemShape(tile.kind, col.hex, s * 0.92);
  ctx.save();
  ctx.translate(s * 0.28, -s * 0.28);
  drawColourMark(col.mark, s * 0.7);
  ctx.restore();

  if (sel) {
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2.5;
    roundRect(-s / 2 - 1, -s / 2 - 1, s + 2, s + 2, 9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoard() {
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  roundRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  roundRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(51,65,85,0.45)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X, BOARD_Y + r * CELL);
    ctx.lineTo(BOARD_X + BOARD_W, BOARD_Y + r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X + c * CELL, BOARD_Y);
    ctx.lineTo(BOARD_X + c * CELL, BOARD_Y + BOARD_H);
    ctx.stroke();
  }

  const board = game.state.board;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const tile = board[r][c];
    if (!tile) continue;
    const p = posOf(r, c);
    drawTile(tile, p.x, p.y, selected && selected.r === r && selected.c === c);
  }
}

/** Mix hex colour toward white/black. amount in [-1,1]. */
function shadeHex(hex, amount) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    const a = -amount;
    r = Math.round(r * (1 - a));
    g = Math.round(g * (1 - a));
    b = Math.round(b * (1 - a));
  }
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a small woven/plastic laundry basket tinted with the colour,
 * socks piled by fill level, count label, and a static full/load cue.
 */
function drawLaundryBasket(r, col, count, cap, full) {
  const L = t();
  const labelH = Math.max(11, Math.min(14, r.h * 0.22));
  const basketH = r.h - labelH - 1;
  const bx = r.x + 2;
  const by = r.y + 1;
  const bw = r.w - 4;
  const bh = basketH;

  const bodyTop = by + bh * 0.22;
  const bodyBot = by + bh * 0.92;
  const rimY = bodyTop;
  const topInset = bw * 0.08;
  const botInset = bw * 0.16;
  const leftTop = bx + topInset;
  const rightTop = bx + bw - topInset;
  const leftBot = bx + botInset;
  const rightBot = bx + bw - botInset;

  const base = shadeHex(col.hex, -0.28);
  const mid = shadeHex(col.hex, -0.08);
  const lit = shadeHex(col.hex, 0.22);
  const weave = shadeHex(col.hex, -0.42);

  // Side handles (loops)
  ctx.strokeStyle = shadeHex(col.hex, -0.35);
  ctx.lineWidth = Math.max(1.5, bw * 0.04);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(leftTop - bw * 0.02, rimY + bh * 0.12, bh * 0.11, Math.PI * 0.55, Math.PI * 1.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rightTop + bw * 0.02, rimY + bh * 0.12, bh * 0.11, Math.PI * 1.55, Math.PI * 0.45);
  ctx.stroke();

  // Basket body (trapezoid)
  ctx.beginPath();
  ctx.moveTo(leftTop, rimY);
  ctx.lineTo(rightTop, rimY);
  ctx.lineTo(rightBot, bodyBot);
  ctx.lineTo(leftBot, bodyBot);
  ctx.closePath();
  const grad = ctx.createLinearGradient(bx, rimY, bx, bodyBot);
  grad.addColorStop(0, lit);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = full ? '#fde68a' : weave;
  ctx.lineWidth = full ? 1.8 : 1.1;
  ctx.stroke();

  // Static weave / plastic ribs (no animation)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftTop, rimY);
  ctx.lineTo(rightTop, rimY);
  ctx.lineTo(rightBot, bodyBot);
  ctx.lineTo(leftBot, bodyBot);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  const ribs = Math.max(3, Math.floor(bw / 9));
  for (let i = 1; i < ribs; i++) {
    const t0 = i / ribs;
    const x0 = leftTop + (rightTop - leftTop) * t0;
    const x1 = leftBot + (rightBot - leftBot) * t0;
    ctx.beginPath();
    ctx.moveTo(x0, rimY);
    ctx.lineTo(x1, bodyBot);
    ctx.stroke();
  }
  const bands = Math.max(2, Math.floor(bh / 14));
  for (let i = 1; i < bands; i++) {
    const t0 = i / bands;
    const y = rimY + (bodyBot - rimY) * t0;
    const xl = leftTop + (leftBot - leftTop) * t0;
    const xr = rightTop + (rightBot - rightTop) * t0;
    ctx.beginPath();
    ctx.moveTo(xl, y);
    ctx.lineTo(xr, y);
    ctx.stroke();
  }
  ctx.restore();

  // Rim lip
  ctx.fillStyle = shadeHex(col.hex, 0.12);
  roundRect(leftTop - 1, rimY - bh * 0.06, (rightTop - leftTop) + 2, bh * 0.1, 2);
  ctx.fill();
  if (full) {
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.4;
    roundRect(leftTop - 1, rimY - bh * 0.06, (rightTop - leftTop) + 2, bh * 0.1, 2);
    ctx.stroke();
  }

  // Socks piled inside (fill level)
  const frac = Math.min(1, count / Math.max(1, cap));
  const innerLeft = leftTop + bw * 0.06;
  const innerRight = rightTop - bw * 0.06;
  const innerBot = bodyBot - bh * 0.08;
  const innerTop = rimY + bh * 0.08;
  const fillTop = innerBot - (innerBot - innerTop) * frac;
  if (frac > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(leftTop + 2, rimY + 2);
    ctx.lineTo(rightTop - 2, rimY + 2);
    ctx.lineTo(rightBot - 2, bodyBot - 2);
    ctx.lineTo(leftBot + 2, bodyBot - 2);
    ctx.closePath();
    ctx.clip();
    // Soft laundry mound
    ctx.fillStyle = shadeHex(col.hex, 0.35);
    ctx.beginPath();
    ctx.moveTo(innerLeft, innerBot);
    ctx.lineTo(innerRight, innerBot);
    ctx.quadraticCurveTo(innerRight - 2, fillTop, (innerLeft + innerRight) / 2, fillTop - bh * 0.04);
    ctx.quadraticCurveTo(innerLeft + 2, fillTop, innerLeft, innerBot);
    ctx.fill();
    // Tiny sock silhouettes peeking out
    const sockN = Math.min(5, Math.max(1, Math.ceil(frac * 5)));
    for (let i = 0; i < sockN; i++) {
      const sx = innerLeft + (innerRight - innerLeft) * ((i + 0.5) / sockN);
      const sy = fillTop + bh * 0.06 + (i % 2) * bh * 0.04;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate((i - sockN / 2) * 0.25);
      drawItemShape(0, col.hex, Math.min(14, bw * 0.28));
      ctx.restore();
    }
    ctx.restore();
  }

  // Colour-blind mark on rim
  ctx.save();
  ctx.translate((leftTop + rightTop) / 2, rimY - bh * 0.01);
  drawColourMark(col.mark, Math.min(16, bw * 0.35));
  ctx.restore();

  // Count / full label below basket
  const labelY = by + bh + labelH * 0.78;
  ctx.textAlign = 'center';
  if (full) {
    ctx.fillStyle = '#fde68a';
    ctx.font = `bold ${Math.max(8, Math.min(10, labelH - 2))}px system-ui,sans-serif`;
    ctx.fillText(L.load, r.x + r.w / 2, labelY);
  } else {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${Math.max(9, Math.min(11, labelH))}px system-ui,sans-serif`;
    ctx.fillText(`${count}/${cap}`, r.x + r.w / 2, labelY);
  }
  ctx.textAlign = 'left';
}

function drawBaskets() {
  const baskets = game.state.baskets;
  const n = baskets.length;
  if (!n) return;
  const cap = game.state.capacity;

  for (let i = 0; i < n; i++) {
    const b = baskets[i];
    const col = COLOURS[i];
    const r = basketRect(i, n);
    drawLaundryBasket(r, col, b.count, cap, b.full);
  }
}

function drawFlyParts() {
  for (const p of flyParts) {
    const e = p.u * p.u * (3 - 2 * p.u);
    const x = p.x0 + (p.x1 - p.x0) * e;
    const y = p.y0 + (p.y1 - p.y0) * e - Math.sin(e * Math.PI) * 18;
    const col = COLOURS[p.colour];
    if (!col) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - e * 0.85);
    ctx.translate(x, y);
    drawItemShape(p.kind, col.hex, p.size * (1 - e * 0.35));
    ctx.restore();
  }
}

function draw() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(30,58,95,0.28)');
  g.addColorStop(0.45, 'rgba(12,18,32,0)');
  g.addColorStop(1, 'rgba(15,23,42,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawBoard();
  drawBaskets();
  drawFlyParts();
}

function update(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    if (!anims[i](dt)) anims.splice(i, 1);
  }

  if (game.state.running && !paused && !game.state.over && !busy && !washFx) {
    const ev = game.tick(dt);
    syncHud();
    if (ev && ev.type === 'shutdown') {
      syncPauseBtn();
      syncOverlay();
    }
  }
}

let last = performance.now();

window.__laundry = {
  getState: () => ({
    ...game.snapshot(),
    busy, paused, selected, W, H,
    CELL, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, BASKET_STRIP_Y, BASKET_STRIP_H,
    headerBottom: topUiPx(),
    reduceMotion,
    QUICK_WASH_WINDOW, QUICK_WASH_BONUS,
  }),
  start: () => document.getElementById('oBtn').click(),
  setPaused: (v) => setPaused(!!v),
  findMove: () => game.findMove(),
  playMove: (m) => {
    if (!m) m = game.findMove();
    if (!m) return false;
    return attemptSwap(m.r1, m.c1, m.r2, m.c2);
  },
  loadBasket: (i) => tryLoadBasket(i),
  forceTick: (s) => {
    const ev = game.tick(s);
    if (ev && ev.type === 'shutdown') {
      syncPauseBtn();
      syncOverlay();
      syncHud();
    }
    return ev;
  },
  forcePowerOut: () => {
    game.state.over = true;
    game.state.running = false;
    game.state.endReason = 'power';
    syncPauseBtn();
    syncOverlay();
    syncHud();
  },
  forceShutdown: () => {
    game.state.over = true;
    game.state.running = false;
    game.state.endReason = 'shutdown';
    syncPauseBtn();
    syncOverlay();
    syncHud();
  },
  setBasketCount: (i, n) => {
    const b = game.state.baskets[i];
    if (!b) return false;
    b.count = Math.max(0, Math.min(game.state.capacity, n | 0));
    b.full = b.count >= game.state.capacity;
    return true;
  },
  fillBasket: (i) => {
    const b = game.state.baskets[i];
    if (!b) return false;
    b.count = game.state.capacity;
    b.full = true;
    return true;
  },
  autoLoadFull: () => {
    const i = game.state.baskets.findIndex((b) => b.full);
    if (i < 0) return null;
    const wash = game.loadBasket(i);
    afterWashResult(wash);
    return wash;
  },
  constants: () => ({
    COLS, ROWS, ITEM_KINDS, ITEM_TYPES, COLOURS: COLOURS.map((c) => c.id),
  }),
  /** Jump to a round (for layout shots with more colours). */
  forceRound: (round) => {
    const r = Math.max(1, round | 0);
    if (durationForRound(r) <= 0) return false;
    if (!game.state.running) {
      game.start();
    }
    game.setupRound(r);
    game.state.running = true;
    game.state.over = false;
    hideWash();
    busy = false;
    selected = null;
    tileFx.clear();
    flyParts = [];
    resizeCanvas();
    syncHud();
    syncPauseBtn();
    syncOverlay();
    return {
      round: game.state.round,
      colours: game.state.colourCount,
      kinds: coloursForRound(r) * ITEM_TYPES.length,
    };
  },
};

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// Preview board on the start screen (not a running round)
game.start();
game.state.running = false;
game.state.timeLeft = game.state.duration;
document.getElementById('overlay').classList.remove('hidden');
if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
applyLang();
syncHud();
syncPauseBtn();
draw();
requestAnimationFrame(frame);
