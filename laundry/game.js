/* One Day in Kyiv — laundry match-3 v2 (board + colour baskets + timed rounds) */
import {
  COLS, ROWS, ITEM_KINDS, COLOURS,
  QUICK_WASH_WINDOW, QUICK_WASH_BONUS,
  coloursForRound, durationForRound,
  createGame, findMatches, adjacent,
} from './logic.mjs';

const canvas = document.getElementById('game');
const wrapEl = document.getElementById('wrap');
const ctx = canvas.getContext('2d', { alpha: true });

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWAP_MS = reduceMotion ? 0.01 : 0.12;
const FALL_MS = reduceMotion ? 0.01 : 0.16;
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
/** Reserved for ≤7 colours in 2 chip rows (board size stays stable). */
const BASKET_STRIP_H_MAX = 100;

function topUiPx() {
  // Compact header under the fixed nav; include safe-area already on #wrap/#hud.
  return 48;
}

function relayout() {
  const rect = wrapEl.getBoundingClientRect();
  W = Math.max(280, Math.round(rect.width) || 360);
  H = Math.max(420, Math.round(rect.height) || 640);

  const top = topUiPx();
  CELL = Math.max(28, Math.floor(Math.min(
    (W - MARGIN_X * 2) / COLS,
    (H - top - BOTTOM_PAD - BOARD_BASKET_GAP - BASKET_STRIP_H_MAX) / ROWS,
  )));
  BOARD_W = COLS * CELL;
  BOARD_H = ROWS * CELL;
  BOARD_X = Math.floor((W - BOARD_W) / 2);
  BASKET_STRIP_W = W - MARGIN_X * 2;
  BASKET_STRIP_X = MARGIN_X;
  // Pack board from the header; let the basket strip grow into leftover height
  // (up to a cap) so tall phones don’t show a big empty void under the chips.
  BOARD_Y = top;
  BASKET_STRIP_Y = BOARD_Y + BOARD_H + BOARD_BASKET_GAP;
  const remaining = H - BASKET_STRIP_Y - BOTTOM_PAD;
  BASKET_STRIP_H = Math.max(BASKET_STRIP_H_MAX, Math.min(remaining, 128));
}

/** Horizontal chip grid under the board (1 row if ≤4, else 2 rows). */
function basketLayout(n) {
  const count = Math.max(1, n | 0);
  const cols = count <= 4 ? count : Math.ceil(count / 2);
  const rows = Math.ceil(count / cols);
  const gap = 4;
  const chipW = (BASKET_STRIP_W - gap * (cols - 1)) / cols;
  const chipH = Math.min(56, (BASKET_STRIP_H - gap * (rows - 1)) / rows);
  const usedH = rows * chipH + (rows - 1) * gap;
  // Pack chips toward the top of the strip (closer to the board).
  const originY = BASKET_STRIP_Y + Math.max(2, Math.floor((BASKET_STRIP_H - usedH) * 0.15));
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
    hint: '3+ однакових (тип+колір) → у кошик кольору. Заповни кошик, поки є світло.',
    round: (n) => `Раунд ${n}`,
    timer: (s) => `${Math.ceil(s)} с`,
    score: (s) => `рахунок ${s | 0}`,
    overlayTitle: 'Стирка',
    overlayBody: 'Збирай 3+ однакових речей (той самий тип і колір). У кошик іде колір: червоні шкарпетки й футболки — в один кошик. Заповнений кошик — у пральну, новий таймер. Кожен 3-й раунд: новий колір і менше часу.',
    start: 'Старт', again: 'Ще раз',
    powerTitle: 'Світло скінчилось',
    shutdownTitle: 'Екстрене відключення',
    overBody: 'Час прати на генераторі закінчився.',
    stats: (s) => `Рахунок ${s.score} · раундів ${s.roundsSurvived} · кошиків ${s.basketsWashed} · речей ${s.itemsWashed}`,
    pause: 'Пауза', pauseBody: 'Торкніться, щоб продовжити',
    wash: 'Прання…',
    washQuick: 'Швидке прання!',
    basketFull: 'Повний — завантажити',
    load: 'У машину',
  },
  en: {
    title: 'Laundry',
    hint: 'Match 3+ same type+colour → colour basket. Fill a basket while the power lasts.',
    round: (n) => `Round ${n}`,
    timer: (s) => `${Math.ceil(s)} s`,
    score: (s) => `score ${s | 0}`,
    overlayTitle: 'Laundry',
    overlayBody: 'Match 3+ identical items (same type and colour). Baskets are per colour: red socks and red tees share the red basket. A full basket goes into the washer and a new timer starts. Every 3rd round: a new colour and less time.',
    start: 'Start', again: 'Again',
    powerTitle: 'Power ran out',
    shutdownTitle: 'Emergency shutdown',
    overBody: 'No more washing without power.',
    stats: (s) => `Score ${s.score} · rounds ${s.roundsSurvived} · baskets ${s.basketsWashed} · items ${s.itemsWashed}`,
    pause: 'Paused', pauseBody: 'Tap to resume',
    wash: 'Washing…',
    washQuick: 'Quick wash!',
    basketFull: 'Full — load',
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
let pulseFull = 0;

const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const washOverlay = document.getElementById('washOverlay');

function resizeCanvas() {
  relayout();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
// Relayout once fonts/nav settle
requestAnimationFrame(resizeCanvas);

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
  const tl = document.getElementById('timerLine');
  if (s.running && !s.over) {
    tl.textContent = L.timer(Math.max(0, s.timeLeft));
    tl.classList.toggle('warn', s.timeLeft <= 15 && s.timeLeft > 5);
    tl.classList.toggle('danger', s.timeLeft <= 5);
  } else {
    tl.textContent = '';
    tl.classList.remove('warn', 'danger');
  }
  document.getElementById('scoreLine').textContent = live ? L.score(s.score) : '';
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
      // Capacity shrink may leave a basket already full — auto-load it
      const pre = game.state.baskets.findIndex((b) => b.full);
      if (pre >= 0) {
        const again = game.loadBasket(pre);
        afterWashResult(again);
        return false;
      }
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
    const res = game.swap(r1, c1, r2, c2);
    tileFx.clear();
    const falling = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = game.state.board[r][c];
      if (!tile) continue;
      const f = fxFor(tile);
      f.oy = reduceMotion ? 0 : -CELL * (1 + ((r + c) % 3) * 0.15);
      f.fall0 = f.oy;
      falling.push(f);
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
        if (res.wash && res.wash.ok) afterWashResult(res.wash);
        else busy = false;
        return false;
      }
      return true;
    });
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
  tileFx.clear();
  hideWash();
  pauseOverlay.classList.remove('show');
  document.getElementById('overlay').classList.add('hidden');
  syncPauseBtn();
  applyLang();
  syncHud();
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
  } else if (kind === 1) { // briefs
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

  // soft cell plate
  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  roundRect(-s / 2, -s / 2, s, s, 8);
  ctx.fill();

  drawItemShape(tile.kind, col.hex, s * 0.92);
  // colour-blind mark (static, corner)
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
  // tray
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  roundRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  roundRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 12);
  ctx.stroke();

  // faint grid (static, not animated)
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

function drawBaskets() {
  const baskets = game.state.baskets;
  const n = baskets.length;
  if (!n) return;
  const cap = game.state.capacity;
  const L = t();
  const compact = n > 4;

  for (let i = 0; i < n; i++) {
    const b = baskets[i];
    const col = COLOURS[i];
    const r = basketRect(i, n);
    const pad = 4;

    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = col.hex;
    ctx.lineWidth = b.full ? 2.2 : 1.2;
    roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.stroke();

    if (b.full) {
      const glow = reduceMotion ? 1 : (0.75 + Math.sin(pulseFull) * 0.25);
      ctx.fillStyle = `rgba(250,204,21,${0.14 * glow})`;
      roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill();
    }

    // colour swatch + mark
    const sw = compact ? 12 : 14;
    ctx.fillStyle = col.hex;
    roundRect(r.x + pad, r.y + pad, sw, sw, 3);
    ctx.fill();
    ctx.save();
    ctx.translate(r.x + pad + sw / 2, r.y + pad + sw / 2);
    drawColourMark(col.mark, sw + 4);
    ctx.restore();

    // name (full when room; short when compact)
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    const name = lang === 'ua' ? col.ua : col.en;
    const label = compact ? name.slice(0, 4) : name;
    ctx.font = `bold ${compact ? 8 : 9}px system-ui,sans-serif`;
    ctx.fillText(label, r.x + pad + sw + 4, r.y + pad + (compact ? 10 : 11));

    // count
    ctx.font = `bold ${compact ? 10 : 11}px system-ui,sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${b.count}/${cap}`, r.x + r.w - pad, r.y + pad + (compact ? 10 : 11));
    ctx.textAlign = 'left';

    // fill bar
    const barX = r.x + pad;
    const barY = r.y + r.h - pad - (compact ? 6 : 7);
    const barW = r.w - pad * 2;
    const barH = compact ? 5 : 6;
    ctx.fillStyle = 'rgba(30,41,59,0.95)';
    roundRect(barX, barY, barW, barH, 2);
    ctx.fill();
    const frac = Math.min(1, b.count / Math.max(1, cap));
    if (frac > 0) {
      ctx.fillStyle = col.hex;
      roundRect(barX, barY, Math.max(2, barW * frac), barH, 2);
      ctx.fill();
    }

    if (b.full) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 8px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(L.load, r.x + r.w / 2, barY - 3);
      ctx.textAlign = 'left';
    }
  }
}

function draw() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // atmosphere (static gradient — no scrolling patterns)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(30,58,95,0.28)');
  g.addColorStop(0.45, 'rgba(12,18,32,0)');
  g.addColorStop(1, 'rgba(15,23,42,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawBoard();
  drawBaskets();
}

function update(dt) {
  if (!game.state.running || paused || game.state.over) {
    for (let i = anims.length - 1; i >= 0; i--) {
      if (washFx && anims[i]) {
        // allow wash anim to finish even if over mid-frame
      }
    }
  }

  for (let i = anims.length - 1; i >= 0; i--) {
    if (!anims[i](dt)) anims.splice(i, 1);
  }

  if (!reduceMotion) pulseFull += dt * 4;

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
    CELL, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, BASKET_STRIP_H,
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
  // test helpers: set / fill basket counts (no auto-load)
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
    COLS, ROWS, ITEM_KINDS, COLOURS: COLOURS.map((c) => c.id),
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
    syncHud();
    syncPauseBtn();
    syncOverlay();
    return { round: game.state.round, colours: game.state.colourCount, kinds: coloursForRound(r) * 3 };
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
