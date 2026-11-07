/* One Day in Kyiv — outage-schedule Minesweeper ("Графік світла") */
(function () {
  'use strict';

  const ROWS = 12;
  const COLS = 14; // 7 weekdays × 2 half-days
  const MINES = 18; // gentle beginner density (~10.7%)
  const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const T = {
    ua: {
      title: 'Графік світла',
      menu: '☰ Меню',
      dark: 'темрява',
      flags: 'мітки',
      flagMode: '🏷 Мітка',
      flagOn: '🏷 Мітка ON',
      rules: 'Правила',
      replay: 'Ще раз',
      hint: 'Відкрий клітинку зі світлом. Сірі з блискавкою — темрява. Довге натискання або ПКМ — мітка.',
      hintFlag: 'Режим мітки: торкнись клітинки, щоб позначити темряву.',
      startT: 'Графік світла',
      startB: 'Це сапер у вигляді графіка відключень. Світлі клітинки безпечні; сірі з перекресленою блискавкою — темрява.',
      rulesList: [
        '12×14 клітинок: 7 днів × дві половини доби (00–12 і 12–24).',
        'Відкрий клітинку — побачиш, скільки темряви навколо (8 сусідів).',
        'Нуль відкриває сусідні світлі клітинки автоматично.',
        'Перший хід завжди безпечний.',
        'Мітка: довге натискання / ПКМ / кнопка «Мітка».',
        'Виграш — відкрити всі світлі клітинки.',
      ],
      go: 'Грати',
      win: 'Є світло! ⚡',
      winB: 'Усі світлі клітинки відкрито. Темрява позначена або обійдена.',
      lose: 'Темрява…',
      loseB: 'Відкрив клітинку без світла. Спробуй ще раз.',
      again: 'Ще раз',
      statusIdle: '',
      halfAm: '00–12',
      halfPm: '12–24',
      legendClosed: 'закрито',
      legendLight: 'світло',
      legendDark: 'темрява',
      legendFlag: 'мітка',
    },
    en: {
      title: 'Power schedule',
      menu: '☰ Menu',
      dark: 'darkness',
      flags: 'flags',
      flagMode: '🏷 Flag',
      flagOn: '🏷 Flag ON',
      rules: 'Rules',
      replay: 'Replay',
      hint: 'Open a lit cell. Grey with a crossed bolt is darkness. Long-press or right-click to flag.',
      hintFlag: 'Flag mode: tap a cell to mark darkness.',
      startT: 'Power schedule',
      startB: 'Minesweeper as an outage timetable. Lit cells are safe; grey crossed-bolt cells are darkness.',
      rulesList: [
        '12×14 grid: 7 weekdays × two half-days (00–12 and 12–24).',
        'Open a cell to see how many darkness cells are around it (8 neighbours).',
        'A zero floods open neighbouring lit cells.',
        'The first click is always safe.',
        'Flag with long-press / right-click / Flag button.',
        'Win by opening every lit cell.',
      ],
      go: 'Play',
      win: 'Lights on! ⚡',
      winB: 'Every lit cell is open. Darkness flagged or avoided.',
      lose: 'Blackout…',
      loseB: 'You opened a dark cell. Try again.',
      again: 'Play again',
      statusIdle: '',
      halfAm: '00–12',
      halfPm: '12–24',
      legendClosed: 'closed',
      legendLight: 'power on',
      legendDark: 'outage',
      legendFlag: 'flag',
    },
  };

  const $ = (id) => document.getElementById(id);
  let lang = localStorage.getItem('minesweeper-lang') || 'ua';
  let flagMode = false;
  let overlayMode = 'start'; // start | rules | win | lose

  /** @type {{mine:boolean,open:boolean,flag:boolean,n:number,hit?:boolean}[]} */
  let cells = [];
  let placed = false;
  let over = false; // 'win' | 'lose' | false
  let flags = 0;

  const BOLT_SVG =
    '<svg class="bolt" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#1a2340" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/>' +
    '<path stroke="#1a2340" stroke-width="2.4" stroke-linecap="round" d="M5 5.5 19 18.5"/>' +
    '</svg>';

  function idx(r, c) { return r * COLS + c; }
  function rc(i) { return { r: (i / COLS) | 0, c: i % COLS }; }
  function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  function neighbors(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) out.push(idx(nr, nc));
      }
    }
    return out;
  }

  function hourLabel(row) {
    const a0 = String(row).padStart(2, '0');
    const a1 = String(row + 1).padStart(2, '0');
    const p0 = String(row + 12).padStart(2, '0');
    const p1 = String(row + 13).padStart(2, '0');
    return { am: a0 + '–' + a1, pm: p0 + '–' + p1 };
  }

  function buildBoardSkeleton() {
    const board = $('board');
    board.innerHTML = '';
    const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
    const L = T[lang];

    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.textContent = lang === 'ua' ? 'Час' : 'Time';
    board.appendChild(corner);

    for (let d = 0; d < 7; d++) {
      const day = document.createElement('div');
      day.className = 'day';
      day.textContent = days[d];
      board.appendChild(day);
    }

    const corner2 = document.createElement('div');
    corner2.className = 'corner';
    corner2.style.minHeight = '22px';
    corner2.setAttribute('aria-hidden', 'true');
    board.appendChild(corner2);

    for (let d = 0; d < 7; d++) {
      const am = document.createElement('div');
      am.className = 'half';
      am.textContent = L.halfAm;
      board.appendChild(am);
      const pm = document.createElement('div');
      pm.className = 'half';
      pm.textContent = L.halfPm;
      board.appendChild(pm);
    }

    for (let r = 0; r < ROWS; r++) {
      const h = hourLabel(r);
      const lab = document.createElement('div');
      lab.className = 'hour';
      lab.innerHTML = '<span class="am">' + h.am + '</span><span class="pm">' + h.pm + '</span>';
      board.appendChild(lab);
      for (let c = 0; c < COLS; c++) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cell closed';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.setAttribute('aria-label', cellAria(r, c));
        board.appendChild(el);
      }
    }
  }

  function cellAria(r, c) {
    const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
    const day = days[(c / 2) | 0];
    const half = c % 2 === 0 ? T[lang].halfAm : T[lang].halfPm;
    const h = hourLabel(r);
    const slot = c % 2 === 0 ? h.am : h.pm;
    return day + ' ' + half + ' ' + slot;
  }

  function resetGame() {
    cells = Array.from({ length: ROWS * COLS }, () => ({ mine: false, open: false, flag: false, n: 0 }));
    placed = false;
    over = false;
    flags = 0;
    flagMode = false;
    $('status').textContent = '';
    $('status').className = '';
    buildBoardSkeleton();
    bindCells();
    paintAll();
    applyLang();
  }

  function placeMines(safeIndex) {
    const forbidden = new Set([safeIndex, ...neighbors(rc(safeIndex).r, rc(safeIndex).c)]);
    const pool = [];
    for (let i = 0; i < ROWS * COLS; i++) if (!forbidden.has(i)) pool.push(i);
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const nMines = Math.min(MINES, pool.length);
    for (let i = 0; i < nMines; i++) cells[pool[i]].mine = true;
    for (let i = 0; i < ROWS * COLS; i++) {
      if (cells[i].mine) { cells[i].n = 0; continue; }
      const { r, c } = rc(i);
      cells[i].n = neighbors(r, c).reduce((s, j) => s + (cells[j].mine ? 1 : 0), 0);
    }
    placed = true;
  }

  function paintCell(i) {
    const el = cellEl(i);
    if (!el) return;
    const cell = cells[i];
    el.className = 'cell';
    el.innerHTML = '';
    if (cell.flag && !cell.open) {
      el.classList.add('flagged', 'closed');
      el.innerHTML = '<span class="flag" aria-hidden="true">⚑</span>';
      return;
    }
    if (!cell.open) {
      el.classList.add('closed');
      return;
    }
    el.classList.add('open');
    if (cell.mine) {
      el.classList.add('mine', 'revealed');
      if (cell.hit) el.classList.add('hit');
      el.innerHTML = BOLT_SVG;
      return;
    }
    if (cell.n === 0) {
      el.classList.add('zero');
      return;
    }
    el.classList.add('n' + cell.n);
    el.textContent = String(cell.n);
  }

  function cellEl(i) {
    const { r, c } = rc(i);
    return $('board').querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function paintAll() {
    for (let i = 0; i < cells.length; i++) paintCell(i);
    updateCounters();
  }

  function updateCounters() {
    const mineCount = placed ? cells.filter((c) => c.mine).length : MINES;
    // classic minesweeper counter: mines − flags
    const remain = mineCount - flags;
    $('darkCount').textContent = String(remain);
    $('flagCount').textContent = String(flags);
  }

  function openFlood(start) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const cell = cells[i];
      if (cell.flag || cell.open) continue;
      cell.open = true;
      if (cell.n === 0 && !cell.mine) {
        const { r, c } = rc(i);
        for (const j of neighbors(r, c)) stack.push(j);
      }
    }
  }

  function revealAllMines() {
    for (const cell of cells) if (cell.mine) { cell.open = true; cell.flag = false; }
  }

  function checkWin() {
    const ok = cells.every((c) => c.mine || c.open);
    if (!ok) return;
    over = 'win';
    for (const c of cells) if (c.mine && !c.flag) { c.flag = true; }
    flags = cells.filter((c) => c.flag).length;
    paintAll();
    $('status').textContent = T[lang].win;
    $('status').className = 'win';
    showOverlay('win');
  }

  function loseAt(i) {
    over = 'lose';
    cells[i].hit = true;
    revealAllMines();
    paintAll();
    $('status').textContent = T[lang].lose;
    $('status').className = 'lose';
    showOverlay('lose');
  }

  function openAt(i) {
    if (over) return;
    const cell = cells[i];
    if (cell.open || cell.flag) return;
    if (!placed) placeMines(i);
    if (cell.mine) {
      cell.open = true;
      loseAt(i);
      return;
    }
    if (cell.n === 0) openFlood(i);
    else cell.open = true;
    paintAll();
    checkWin();
  }

  function toggleFlag(i) {
    if (over) return;
    const cell = cells[i];
    if (cell.open) return;
    cell.flag = !cell.flag;
    flags += cell.flag ? 1 : -1;
    paintCell(i);
    updateCounters();
  }

  // ---- input: click / long-press / right-click ----
  let pressTimer = null;
  let longFired = false;
  let pressIndex = -1;

  function clearPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }

  function onPointerDown(e, i) {
    if (over) return;
    if (e.pointerType === 'mouse' && e.button === 2) return;
    longFired = false;
    pressIndex = i;
    clearPress();
    pressTimer = setTimeout(() => {
      longFired = true;
      toggleFlag(i);
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
    }, 420);
  }

  function onPointerUp(e, i) {
    clearPress();
    if (over) return;
    if (longFired) { longFired = false; return; }
    if (pressIndex !== i) return;
    if (flagMode) toggleFlag(i);
    else openAt(i);
  }

  function onPointerCancel() {
    clearPress();
    longFired = false;
    pressIndex = -1;
  }

  function bindCells() {
    $('board').querySelectorAll('.cell').forEach((el) => {
      const r = +el.dataset.r, c = +el.dataset.c;
      const i = idx(r, c);
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        onPointerDown(e, i);
      });
      el.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        onPointerUp(e, i);
      });
      el.addEventListener('pointercancel', onPointerCancel);
      el.addEventListener('pointerleave', () => { /* keep long-press if still down */ });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleFlag(i);
      });
    });
  }

  function applyLang() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    document.title = L.title + ' · One Day in Kyiv';
    $('title').textContent = L.title;
    $('menu').textContent = L.menu;
    $('lang').textContent = lang.toUpperCase();
    $('darkLbl').textContent = L.dark;
    $('flagLbl').textContent = L.flags;
    $('flagMode').textContent = flagMode ? L.flagOn : L.flagMode;
    $('flagMode').classList.toggle('on', flagMode);
    $('rulesBtn').textContent = L.rules;
    $('replay').textContent = L.replay;
    $('hint').textContent = flagMode ? L.hintFlag : L.hint;
    const miniBolt =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1a2340" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/>' +
      '<path stroke="#1a2340" stroke-width="2.4" stroke-linecap="round" d="M5 5.5 19 18.5"/></svg>';
    $('legend').innerHTML =
      '<span><i class="sw closed"></i>' + L.legendClosed + '</span>' +
      '<span><i class="sw light"></i>' + L.legendLight + '</span>' +
      '<span><i class="sw dark">' + miniBolt + '</i>' + L.legendDark + '</span>' +
      '<span><i class="sw flag"></i>' + L.legendFlag + '</span>';
    // refresh day headers without wiping game state
    const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
    $('board').querySelectorAll('.day').forEach((el, i) => { el.textContent = days[i]; });
    const halves = $('board').querySelectorAll('.half');
    halves.forEach((el, i) => { el.textContent = i % 2 === 0 ? L.halfAm : L.halfPm; });
    const corner = $('board').querySelector('.corner');
    if (corner) corner.textContent = lang === 'ua' ? 'Час' : 'Time';
    $('board').querySelectorAll('.cell').forEach((el) => {
      el.setAttribute('aria-label', cellAria(+el.dataset.r, +el.dataset.c));
    });
    if (over === 'win') $('status').textContent = L.win;
    if (over === 'lose') $('status').textContent = L.lose;
    if (!$('overlay').classList.contains('hidden')) fillOverlay();
  }

  function fillOverlay() {
    const L = T[lang];
    const rules = $('oRules');
    rules.innerHTML = '';
    if (overlayMode === 'start' || overlayMode === 'rules') {
      $('oTitle').textContent = overlayMode === 'rules' ? L.rules : L.startT;
      $('oBody').textContent = L.startB;
      L.rulesList.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        rules.appendChild(li);
      });
      $('oBtn').textContent = overlayMode === 'rules' ? (lang === 'ua' ? 'Зрозуміло' : 'Got it') : L.go;
    } else if (overlayMode === 'win') {
      $('oTitle').textContent = L.win;
      $('oBody').textContent = L.winB;
      $('oBtn').textContent = L.again;
    } else {
      $('oTitle').textContent = L.lose;
      $('oBody').textContent = L.loseB;
      $('oBtn').textContent = L.again;
    }
  }

  function showOverlay(mode) {
    overlayMode = mode;
    fillOverlay();
    $('overlay').classList.remove('hidden');
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
  }

  $('lang').onclick = () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('minesweeper-lang', lang);
    applyLang();
  };
  $('flagMode').onclick = () => {
    flagMode = !flagMode;
    applyLang();
  };
  $('rulesBtn').onclick = () => showOverlay('rules');
  $('replay').onclick = () => { hideOverlay(); resetGame(); };
  $('oBtn').onclick = () => {
    if (overlayMode === 'rules') { hideOverlay(); return; }
    hideOverlay();
    if (overlayMode === 'start') { /* already reset */ return; }
    resetGame();
  };

  // prevent browser context menu on board
  $('boardWrap').addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- test API ----
  window.__minesweeper = {
    ROWS, COLS, MINES,
    state: () => ({
      placed, over, flags, flagMode, lang,
      mines: cells.filter((c) => c.mine).length,
      open: cells.filter((c) => c.open).length,
      cells: cells.map((c) => ({ mine: c.mine, open: c.open, flag: c.flag, n: c.n, hit: !!c.hit })),
    }),
    openAt, toggleFlag, reset: resetGame,
    idx, neighbors, placeMines,
    /** Force-place mines with a known layout for tests. safeIndex is opened after. */
    seed(mineIndices, openIndex) {
      resetGame();
      cells.forEach((c) => { c.mine = false; c.n = 0; });
      for (const i of mineIndices) cells[i].mine = true;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].mine) continue;
        const { r, c } = rc(i);
        cells[i].n = neighbors(r, c).reduce((s, j) => s + (cells[j].mine ? 1 : 0), 0);
      }
      placed = true;
      if (openIndex != null) openAt(openIndex);
      paintAll();
    },
  };

  resetGame();
  showOverlay('start');
})();
