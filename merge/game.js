/* One Day in Kyiv — «Накопич кіловати» Triple Town–style merge */
import {
  KIND, SIZE, createGame, place, swapHold, idx, neighbors, unlitSet,
  readBest, writeBest,
} from './logic.mjs';

const BEST_KEY = 'merge-best-kw';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const T = {
  ua: {
    title: 'Накопич кіловати',
    scoreLbl: 'накопичено',
    bestLbl: 'рекорд',
    nextTag: 'далі',
    holdTag: 'запас',
    holdEmpty: 'натисни, щоб відкласти',
    hint: 'Став на вільну клітинку. 3+ однакові зливаються. «Відключення» ходить щоходу — затисни три, отримаєш лампу.',
    overTitle: 'Дошка заповнена',
    overMsg: 'Кіловати накопичено. Спробуй побити рекорд!',
    overBest: (n) => `Рекорд: ${n} кВт`,
    again: 'Грати ще раз',
    names: {
      [KIND.BATTERY]: 'Батарейка',
      [KIND.POWERBANK]: 'Павербанк',
      [KIND.STATION]: 'Зарядна станція',
      [KIND.GENERATOR]: 'Генератор',
      [KIND.SOLAR]: 'Сонячна панель',
      [KIND.TEC]: 'ТЕЦ',
      [KIND.BLACKOUT]: 'Відключення',
      [KIND.TRAPPED]: 'Застрягле відключення',
      [KIND.LAMP]: 'Лампа',
      [KIND.STREET]: 'Вуличний ліхтар',
      [KIND.EMPTY]: 'порожньо',
    },
    legend: '3 однакові → наступний рівень · біля відключення предмети «темні» і не зливаються',
  },
  en: {
    title: 'Stack the kilowatts',
    scoreLbl: 'stored',
    bestLbl: 'best',
    nextTag: 'next',
    holdTag: 'hold',
    holdEmpty: 'tap to stash',
    hint: 'Place on an empty cell. 3+ identical merge. Blackouts move each turn — trap three for a lamp.',
    overTitle: 'Board is full',
    overMsg: 'Kilowatts banked. Try to beat your best!',
    overBest: (n) => `Best: ${n} kW`,
    again: 'Play again',
    names: {
      [KIND.BATTERY]: 'Battery',
      [KIND.POWERBANK]: 'Power bank',
      [KIND.STATION]: 'Power station',
      [KIND.GENERATOR]: 'Generator',
      [KIND.SOLAR]: 'Solar panel',
      [KIND.TEC]: 'CHP plant',
      [KIND.BLACKOUT]: 'Blackout',
      [KIND.TRAPPED]: 'Trapped blackout',
      [KIND.LAMP]: 'Lamp',
      [KIND.STREET]: 'Street light',
      [KIND.EMPTY]: 'empty',
    },
    legend: '3 alike → next tier · items next to a blackout stay dark and won’t merge',
  },
};

/** Custom SVG icons — no emoji, no brand logos. */
const ICONS = {
  [KIND.BATTERY]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="12" y="8" width="16" height="26" rx="3" fill="#facc15" stroke="#1a2340" stroke-width="2"/><rect x="16" y="4" width="8" height="5" rx="1.5" fill="#1a2340"/><rect x="15" y="14" width="10" height="4" rx="1" fill="#1a2340"/><rect x="15" y="21" width="10" height="4" rx="1" fill="#1a2340"/></svg>`,
  [KIND.POWERBANK]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="12" width="24" height="18" rx="3" fill="#0ea5e9" stroke="#1a2340" stroke-width="2"/><rect x="12" y="16" width="10" height="6" rx="1" fill="#e0f2fe"/><path d="M26 16h4v3h-2v2h2v3h-4z" fill="#fde047"/><circle cx="14" cy="26" r="1.5" fill="#1a2340"/></svg>`,
  [KIND.STATION]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="14" width="26" height="16" rx="3" fill="#ef4444" stroke="#1a2340" stroke-width="2"/><rect x="11" y="17" width="10" height="7" rx="1.5" fill="#1e293b"/><rect x="13" y="19" width="6" height="3" rx="0.5" fill="#22d3ee"/><rect x="24" y="18" width="5" height="8" rx="1" fill="#fde047" stroke="#1a2340" stroke-width="1"/><path d="M10 30h20" stroke="#1a2340" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="32" r="2" fill="#1a2340"/><circle cx="28" cy="32" r="2" fill="#1a2340"/></svg>`,
  [KIND.GENERATOR]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="16" width="22" height="14" rx="2" fill="#fb923c" stroke="#1a2340" stroke-width="2"/><rect x="10" y="19" width="8" height="5" rx="1" fill="#1e293b"/><circle cx="30" cy="22" r="6" fill="#fde047" stroke="#1a2340" stroke-width="2"/><circle cx="30" cy="22" r="2" fill="#1a2340"/><path d="M9 30h16" stroke="#1a2340" stroke-width="2"/><rect x="8" y="12" width="6" height="5" rx="1" fill="#94a3b8" stroke="#1a2340" stroke-width="1.5"/></svg>`,
  [KIND.SOLAR]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="8" width="24" height="18" rx="2" fill="#3b82f6" stroke="#1a2340" stroke-width="2"/><path d="M8 14h24M8 20h24M16 8v18M24 8v18" stroke="#1e3a8a" stroke-width="1.5"/><path d="M20 26v6M14 34h12" stroke="#1a2340" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="6" r="2" fill="#fde047"/></svg>`,
  [KIND.TEC]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="22" width="32" height="12" rx="1" fill="#a78bfa" stroke="#1a2340" stroke-width="2"/><path d="M10 22V12h6v10M18 22V10h8v12M28 22v-6h6v6" fill="#c4b5fd" stroke="#1a2340" stroke-width="1.5"/><path d="M12 12c0-4 2-7 3-8M22 10c0-5 3-8 4-9M31 16c0-3 1-5 2-6" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/><rect x="8" y="26" width="4" height="4" fill="#1a2340"/><rect x="16" y="26" width="4" height="4" fill="#1a2340"/><rect x="24" y="26" width="4" height="4" fill="#1a2340"/></svg>`,
  [KIND.BLACKOUT]: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="18" rx="14" ry="11" fill="#475569" stroke="#0f172a" stroke-width="2"/><ellipse cx="14" cy="22" rx="7" ry="6" fill="#64748b" stroke="#0f172a" stroke-width="1.5"/><ellipse cx="26" cy="22" rx="7" ry="6" fill="#64748b" stroke="#0f172a" stroke-width="1.5"/><path d="M12 14l4 3M24 14l4 3" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/><path d="M17 24c1.5 1 4.5 1 6 0" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><path d="M20 28v5M18 34h6" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><rect x="16" y="34" width="8" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" stroke-width="1"/></svg>`,
  [KIND.TRAPPED]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="8" width="28" height="24" rx="3" fill="#64748b" stroke="#0f172a" stroke-width="2"/><path d="M12 14h16M12 20h16M12 26h10" stroke="#334155" stroke-width="2" stroke-linecap="round"/><circle cx="28" cy="26" r="3" fill="#1e293b"/></svg>`,
  [KIND.LAMP]: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 18c0-6 3-10 6-10s6 4 6 10c0 3-1 5-2 6h-8c-1-1-2-3-2-6z" fill="#fde047" stroke="#1a2340" stroke-width="2"/><rect x="16" y="24" width="8" height="4" rx="1" fill="#1a2340"/><rect x="18" y="28" width="4" height="6" fill="#475569" stroke="#1a2340" stroke-width="1"/><path d="M12 16h2M26 16h2M20 6v2" stroke="#facc15" stroke-width="2" stroke-linecap="round"/></svg>`,
  [KIND.STREET]: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="18" width="4" height="16" fill="#475569" stroke="#1a2340" stroke-width="1.5"/><path d="M10 18c0-8 4-14 10-14s10 6 10 14" fill="#fde047" stroke="#1a2340" stroke-width="2"/><path d="M14 18h12" stroke="#1a2340" stroke-width="2"/><circle cx="20" cy="12" r="3" fill="#fef08a"/></svg>`,
};

const PIECE_CLASS = {
  [KIND.BATTERY]: 'k1',
  [KIND.POWERBANK]: 'k2',
  [KIND.STATION]: 'k3',
  [KIND.GENERATOR]: 'k4',
  [KIND.SOLAR]: 'k5',
  [KIND.TEC]: 'k6',
  [KIND.BLACKOUT]: 'kb',
  [KIND.TRAPPED]: 'kt',
  [KIND.LAMP]: 'kl',
  [KIND.STREET]: 'ks',
};

let lang = localStorage.getItem('merge-lang') || 'ua';
let game = createGame();
let best = readBest(localStorage, BEST_KEY);

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const cells = [];

function pieceHTML(kind) {
  if (!kind || kind === KIND.EMPTY) {
    return '<div class="piece empty"></div>';
  }
  const cls = PIECE_CLASS[kind] || '';
  return `<div class="piece ${cls}">${ICONS[kind] || ''}</div>`;
}

function setPieceEl(el, kind) {
  el.className = 'piece ' + (kind && kind !== KIND.EMPTY ? (PIECE_CLASS[kind] || '') : 'empty');
  el.innerHTML = kind && kind !== KIND.EMPTY ? (ICONS[kind] || '') : '';
}

function buildBoard() {
  boardEl.innerHTML = '';
  cells.length = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.dataset.i = String(i);
    btn.setAttribute('role', 'gridcell');
    btn.innerHTML = pieceHTML(KIND.EMPTY);
    btn.addEventListener('click', () => onCell(i));
    boardEl.appendChild(btn);
    cells.push(btn);
  }
}

function paint() {
  const L = T[lang];
  const unlit = unlitSet(game.board);
  for (let i = 0; i < cells.length; i++) {
    const kind = game.board[i];
    const cell = cells[i];
    const was = cell.dataset.kind || '0';
    cell.dataset.kind = String(kind);
    cell.innerHTML = pieceHTML(kind);
    cell.classList.toggle('unlit', unlit.has(i) && kind !== KIND.EMPTY && kind !== KIND.BLACKOUT);
    cell.disabled = game.over || kind !== KIND.EMPTY;
    if (!reduceMotion() && was !== String(kind) && kind !== KIND.EMPTY) {
      cell.classList.remove('pop', 'fade');
      void cell.offsetWidth;
      cell.classList.add(was === '0' ? 'fade' : 'pop');
    }
  }
  setPieceEl($('nextPiece'), game.next);
  setPieceEl($('holdPiece'), game.hold);
  $('nextName').textContent = L.names[game.next] || '';
  $('holdName').textContent = game.hold === KIND.EMPTY ? L.holdEmpty : (L.names[game.hold] || '');
  $('scoreVal').innerHTML = `${game.score}<span>кВт</span>`;
  $('bestVal').textContent = `${best} кВт`;
}

function applyLang() {
  const L = T[lang];
  document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
  $('lang').textContent = lang.toUpperCase();
  $('title').textContent = L.title;
  document.title = `${L.title} · One Day in Kyiv`;
  $('scoreLbl').textContent = L.scoreLbl;
  $('bestLbl').textContent = L.bestLbl;
  $('nextTag').textContent = L.nextTag;
  $('holdTag').textContent = L.holdTag;
  $('hint').textContent = L.hint;
  $('legend').textContent = L.legend;
  $('overTitle').textContent = L.overTitle;
  $('overMsg').textContent = L.overMsg;
  $('again').textContent = L.again;
  $('menu').textContent = lang === 'ua' ? '☰ Меню' : '☰ Menu';
  paint();
  if (!game.over) {
    // keep overlay text in sync if visible
  } else {
    showOver(false);
  }
}

function showOver(animate) {
  const L = T[lang];
  best = writeBest(localStorage, BEST_KEY, game.score);
  $('overScore').innerHTML = `${game.score}<small>кВт</small>`;
  $('overBest').textContent = L.overBest(best);
  $('overlay').classList.remove('hidden');
  if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(true);
  paint();
}

function hideOver() {
  $('overlay').classList.add('hidden');
  if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
}

function onCell(i) {
  if (game.over) return;
  const res = place(game, i);
  if (!res.ok) return;
  paint();
  if (game.over) showOver(true);
}

function onHold() {
  if (game.over) return;
  swapHold(game);
  paint();
}

function restart() {
  game = createGame();
  hideOver();
  paint();
}

buildBoard();
best = readBest(localStorage, BEST_KEY);
$('lang').addEventListener('click', () => {
  lang = lang === 'ua' ? 'en' : 'ua';
  localStorage.setItem('merge-lang', lang);
  applyLang();
});
$('holdBtn').addEventListener('click', onHold);
$('again').addEventListener('click', restart);
applyLang();

/** Test hooks for screenshots / QA */
window.__merge = {
  getState: () => ({
    board: game.board.slice(),
    next: game.next,
    hold: game.hold,
    score: game.score,
    over: game.over,
    best,
  }),
  restart,
  place: (r, c) => onCell(idx(r, c)),
  setBoard(pairs, next = KIND.BATTERY, hold = KIND.EMPTY, score = 0) {
    game.board = game.board.map(() => KIND.EMPTY);
    for (const [r, c, k] of pairs) game.board[idx(r, c)] = k;
    game.next = next;
    game.hold = hold;
    game.score = score;
    game.over = false;
    hideOver();
    paint();
  },
  forceOver(score) {
    game.score = score;
    game.over = true;
    showOver(true);
  },
  KIND,
};
