/* One Day in Kyiv — outage-schedule Minesweeper ("Графік світла") */
(function () {
  'use strict';

  const MODES = {
    easy: { rows: 12, cols: 14, mines: 18 },   // ~10.7% — beginner week
    hard: { rows: 24, cols: 28, mines: 120 },  // ~17.9% — challenging month
  };
  const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const T = {
    ua: {
      title: 'Графік світла',
      menu: '☰ Меню',
      dark: 'пастки',
      flags: 'мітки',
      flagMode: '🏷 Мітка',
      flagOn: '🏷 Мітка ON',
      rules: 'Правила',
      replay: 'Ще раз',
      easy: 'Проста',
      hard: 'Складна',
      hint: 'Відкривай темні години. Порожня зона — без світла (сіре з блискавкою). Білі з цифрами — зі світлом; цифра = пастки поруч.',
      hintFlag: 'Режим мітки: познач підозрілу пастку-відключення.',
      hintHard: 'Складна: 24 години × 28 днів. Гортай сітку в обидва боки.',
      startT: 'Графік світла',
      startB: 'Сапер як графік: відкриваєш темне. Порожні клітинки — години без світла (сірі з блискавкою). Білі з цифрами — години зі світлом. Наприкінці цифри зникають — лишається графік.',
      rulesCommon: [
        'Темні клітинки ще закриті (невідомо).',
        'Порожня відкрита зона (нуль) — немає світла: сіре з перекресленою блискавкою. Вона розливається на сусідні порожні години.',
        'Біла клітинка з цифрою — є світло; цифра показує, скільки пасток-відключень поруч (8 сусідів).',
        'Пастка-відключення (прихована) — якщо відкрити, програш. Лічильник «темрява» рахує саме їх.',
        'Перший хід завжди безпечний. Мітка: довге натискання / ПКМ / «Мітка».',
        'Виграш — відкрити всі безпечні години (і без світла, і зі світлом), не натрапивши на пастку.',
        'Після гри цифри й мітки зникають; кольори ті самі: біле = світло, сіре з блискавкою = без світла (включно з пастками).',
        '«Проста» — тиждень (12×14). «Складна» — місяць по годинах (24×28).',
      ],
      rulesEasy: 'Проста: 12×14 клітинок — 7 днів × дві половини доби (00–12 і 12–24), 18 пасток.',
      rulesHard: 'Складна: 24×28 клітинок — година на рядок (00–01 … 23–24), день на колонку (28 днів), 120 пасток.',
      go: 'Грати',
      win: 'Є світло! ⚡',
      winB: 'Графік відкрито. Нижче — чистий розклад без цифр.',
      lose: 'Пастка…',
      loseB: 'Потрапив на приховане відключення. Нижче — повний графік.',
      again: 'Ще раз',
      halfAm: '00–12',
      halfPm: '12–24',
      week: (n) => 'Тиждень ' + n,
      legendClosed: 'закрито',
      legendLight: 'світло (цифра)',
      legendDark: 'без світла',
      legendFlag: 'мітка пастки',
      legendTrap: 'пастка (лічильник)',
    },
    en: {
      title: 'Power schedule',
      menu: '☰ Menu',
      dark: 'traps',
      flags: 'flags',
      flagMode: '🏷 Flag',
      flagOn: '🏷 Flag ON',
      rules: 'Rules',
      replay: 'Replay',
      easy: 'Easy',
      hard: 'Hard',
      hint: 'Open dark hours. Empty flood = no power (grey + bolt). White with digits = power on; digit = nearby traps.',
      hintFlag: 'Flag mode: mark a suspected trap outage.',
      hintHard: 'Hard: 24 hours × 28 days. Scroll the grid both ways.',
      startT: 'Power schedule',
      startB: 'Minesweeper as a timetable: open the dark. Empty cells are no-power hours (grey + bolt). White numbered cells have power. At the end digits vanish into a clean schedule.',
      rulesCommon: [
        'Dark cells are still closed (unknown).',
        'An empty opened region (zero) means no power: grey with a crossed bolt. It floods through neighbouring empty hours.',
        'A white cell with a digit has power; the digit counts adjacent trap outages (8 neighbours).',
        'A hidden trap outage loses the round if opened. The “traps” counter tracks those.',
        'First click is always safe. Flag with long-press / right-click / Flag.',
        'Win by opening every safe hour (no-power empties and powered numbered cells) without hitting a trap.',
        'Afterwards digits and flags disappear; colours stay: white = power, grey + bolt = no power (including traps).',
        'Easy is a week (12×14). Hard is a month by the hour (24×28).',
      ],
      rulesEasy: 'Easy: 12×14 cells — 7 weekdays × two half-days (00–12 and 12–24), 18 traps.',
      rulesHard: 'Hard: 24×28 cells — one hour per row (00–01 … 23–24), one day per column (28 days), 120 traps.',
      go: 'Play',
      win: 'Lights on! ⚡',
      winB: 'Schedule cleared. Below — a clean timetable without numbers.',
      lose: 'Trap…',
      loseB: 'You hit a hidden outage trap. Below — the full schedule.',
      again: 'Play again',
      halfAm: '00–12',
      halfPm: '12–24',
      week: (n) => 'Week ' + n,
      legendClosed: 'closed',
      legendLight: 'power (digit)',
      legendDark: 'no power',
      legendFlag: 'trap flag',
      legendTrap: 'trap (counter)',
    },
  };

  const $ = (id) => document.getElementById(id);
  let lang = localStorage.getItem('minesweeper-lang') || 'ua';
  let mode = localStorage.getItem('minesweeper-mode') === 'hard' ? 'hard' : 'easy';
  let flagMode = false;
  let overlayMode = 'start'; // start | rules | win | lose

  let ROWS = MODES.easy.rows;
  let COLS = MODES.easy.cols;
  let MINES = MODES.easy.mines;

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

  function applyModeDims() {
    const m = MODES[mode];
    ROWS = m.rows;
    COLS = m.cols;
    MINES = m.mines;
  }

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

  function hourLabelEasy(row) {
    const a0 = String(row).padStart(2, '0');
    const a1 = String(row + 1).padStart(2, '0');
    const p0 = String(row + 12).padStart(2, '0');
    const p1 = String(row + 13).padStart(2, '0');
    return { am: a0 + '–' + a1, pm: p0 + '–' + p1 };
  }

  function hourLabelHard(row) {
    const a0 = String(row).padStart(2, '0');
    const a1 = String(row + 1).padStart(2, '0');
    return a0 + '–' + a1;
  }

  function dayName(dayIndex) {
    const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
    return days[dayIndex % 7];
  }

  function buildBoardSkeleton() {
    const board = $('board');
    board.innerHTML = '';
    board.className = mode;
    $('boardWrap').scrollTop = 0;
    $('boardWrap').scrollLeft = 0;
    if (mode === 'hard') buildHardBoard(board);
    else buildEasyBoard(board);
  }

  function buildEasyBoard(board) {
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
    corner2.className = 'corner half-spacer';
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
      const h = hourLabelEasy(r);
      const lab = document.createElement('div');
      lab.className = 'hour';
      lab.innerHTML = '<span class="am">' + h.am + '</span><span class="pm">' + h.pm + '</span>';
      board.appendChild(lab);
      for (let c = 0; c < COLS; c++) appendCell(board, r, c);
    }
  }

  function buildHardBoard(board) {
    const L = T[lang];

    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.textContent = lang === 'ua' ? 'Час' : 'Time';
    board.appendChild(corner);

    for (let w = 0; w < 4; w++) {
      const week = document.createElement('div');
      week.className = 'week';
      week.textContent = L.week(w + 1);
      board.appendChild(week);
    }

    const corner2 = document.createElement('div');
    corner2.className = 'corner day-spacer';
    corner2.setAttribute('aria-hidden', 'true');
    board.appendChild(corner2);

    for (let d = 0; d < 28; d++) {
      const el = document.createElement('div');
      el.className = 'dayn';
      el.innerHTML = '<span class="wd">' + dayName(d) + '</span><span class="dn">' + (d + 1) + '</span>';
      board.appendChild(el);
    }

    for (let r = 0; r < ROWS; r++) {
      const lab = document.createElement('div');
      lab.className = 'hour';
      lab.textContent = hourLabelHard(r);
      board.appendChild(lab);
      for (let c = 0; c < COLS; c++) appendCell(board, r, c);
    }
  }

  function appendCell(board, r, c) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cell closed';
    el.dataset.r = String(r);
    el.dataset.c = String(c);
    el.setAttribute('aria-label', cellAria(r, c));
    board.appendChild(el);
  }

  function cellAria(r, c) {
    if (mode === 'hard') {
      return dayName(c) + ' ' + (c + 1) + ' ' + hourLabelHard(r);
    }
    const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
    const day = days[(c / 2) | 0];
    const half = c % 2 === 0 ? T[lang].halfAm : T[lang].halfPm;
    const h = hourLabelEasy(r);
    const slot = c % 2 === 0 ? h.am : h.pm;
    return day + ' ' + half + ' ' + slot;
  }

  function hideResult() {
    const r = $('result');
    r.classList.remove('show', 'win', 'lose');
    $('resultTxt').textContent = '';
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
  }

  function showResult(kind) {
    const L = T[lang];
    const r = $('result');
    r.classList.add('show', kind);
    r.classList.remove(kind === 'win' ? 'lose' : 'win');
    $('resultTxt').textContent = (kind === 'win' ? L.win : L.lose) + ' — ' + (kind === 'win' ? L.winB : L.loseB);
    $('resultReplay').textContent = L.again;
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(true);
    // Ensure result + donate stay reachable without hunting below the fold
    requestAnimationFrame(() => { try { r.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (_) {} });
  }

  function resetGame() {
    applyModeDims();
    cells = Array.from({ length: ROWS * COLS }, () => ({ mine: false, open: false, flag: false, n: 0, hit: false }));
    placed = false;
    over = false;
    flags = 0;
    flagMode = false;
    hideResult();
    $('status').textContent = '';
    $('status').className = '';
    buildBoardSkeleton();
    bindCells();
    paintAll();
    applyLang();
  }

  function setMode(next) {
    if (next !== 'easy' && next !== 'hard') return;
    if (mode === next && cells.length === MODES[next].rows * MODES[next].cols) {
      // still refresh selection UI
      applyLang();
      return;
    }
    mode = next;
    localStorage.setItem('minesweeper-mode', mode);
    hideOverlay();
    resetGame();
  }

  function placeMines(safeIndex) {
    const forbidden = new Set([safeIndex, ...neighbors(rc(safeIndex).r, rc(safeIndex).c)]);
    const pool = [];
    for (let i = 0; i < ROWS * COLS; i++) if (!forbidden.has(i)) pool.push(i);
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

  /** Power-on = safe numbered cell. No-power visual = zero flood OR trap mine. */
  function isPowerOn(cell) { return !cell.mine && cell.n > 0; }

  function paintCell(i) {
    const el = cellEl(i);
    if (!el) return;
    const cell = cells[i];
    el.className = 'cell';
    el.innerHTML = '';
    el.textContent = '';

    // End: same power / no-power map as play — no digits, flags, or hit marks
    if (over) {
      if (isPowerOn(cell)) {
        el.classList.add('light');
      } else {
        el.classList.add('outage');
        el.innerHTML = BOLT_SVG;
      }
      return;
    }

    if (cell.flag && !cell.open) {
      el.classList.add('flagged', 'closed');
      el.innerHTML = '<span class="flag" aria-hidden="true">⚑</span>';
      return;
    }
    if (!cell.open) {
      el.classList.add('closed');
      return;
    }
    // Play: empty (zero) = no power + bolt; numbered = power + digit
    if (isPowerOn(cell)) {
      el.classList.add('open', 'light', 'n' + cell.n);
      el.textContent = String(cell.n);
      return;
    }
    el.classList.add('open', 'outage');
    el.innerHTML = BOLT_SVG;
  }

  function cellEl(i) {
    const { r, c } = rc(i);
    return $('board').querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function paintAll() {
    $('board').classList.toggle('ended', !!over);
    for (let i = 0; i < cells.length; i++) paintCell(i);
    updateCounters();
    renderLegend();
  }

  function updateCounters() {
    const mineCount = placed ? cells.filter((c) => c.mine).length : MINES;
    $('darkCount').textContent = String(mineCount - flags);
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

  function clearPlayMarks() {
    flags = 0;
    for (const cell of cells) {
      cell.flag = false;
      cell.hit = false;
      cell.open = true; // schedule view shows every hour
    }
  }

  function endRound(kind) {
    over = kind;
    clearPlayMarks();
    hideOverlay();
    paintAll();
    showResult(kind);
  }

  function checkWin() {
    const ok = cells.every((c) => c.mine || c.open);
    if (!ok) return;
    endRound('win');
  }

  function loseAt(/* i */) {
    endRound('lose');
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
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleFlag(i);
      });
    });
  }

  function rulesList() {
    const L = T[lang];
    return [mode === 'hard' ? L.rulesHard : L.rulesEasy, ...L.rulesCommon];
  }

  function renderLegend() {
    const L = T[lang];
    const miniBolt =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1a2340" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/>' +
      '<path stroke="#1a2340" stroke-width="2.4" stroke-linecap="round" d="M5 5.5 19 18.5"/></svg>';
    if (over) {
      $('legend').innerHTML =
        '<span><i class="sw light"></i>' + L.legendLight.replace(/\s*\(.*\)/, '') + '</span>' +
        '<span><i class="sw dark">' + miniBolt + '</i>' + L.legendDark + '</span>';
      return;
    }
    $('legend').innerHTML =
      '<span><i class="sw closed"></i>' + L.legendClosed + '</span>' +
      '<span><i class="sw dark">' + miniBolt + '</i>' + L.legendDark + '</span>' +
      '<span><i class="sw light"></i>' + L.legendLight + '</span>' +
      '<span><i class="sw flag"></i>' + L.legendFlag + '</span>';
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
    $('resultReplay').textContent = L.again;
    $('diffEasy').textContent = L.easy;
    $('diffHard').textContent = L.hard;
    $('diffEasy').classList.toggle('on', mode === 'easy');
    $('diffHard').classList.toggle('on', mode === 'hard');
    $('hint').textContent = flagMode ? L.hintFlag : (mode === 'hard' ? L.hintHard + ' ' + L.hint : L.hint);
    renderLegend();

    // refresh headers in place when language changes (same mode/geometry)
    if (mode === 'easy') {
      const days = lang === 'ua' ? DAYS_UA : DAYS_EN;
      $('board').querySelectorAll('.day').forEach((el, i) => { el.textContent = days[i]; });
      $('board').querySelectorAll('.half').forEach((el, i) => {
        el.textContent = i % 2 === 0 ? L.halfAm : L.halfPm;
      });
    } else {
      $('board').querySelectorAll('.week').forEach((el, i) => { el.textContent = L.week(i + 1); });
      $('board').querySelectorAll('.dayn').forEach((el, i) => {
        el.innerHTML = '<span class="wd">' + dayName(i) + '</span><span class="dn">' + (i + 1) + '</span>';
      });
    }
    const corner = $('board').querySelector('.corner');
    if (corner) corner.textContent = lang === 'ua' ? 'Час' : 'Time';
    $('board').querySelectorAll('.cell').forEach((el) => {
      el.setAttribute('aria-label', cellAria(+el.dataset.r, +el.dataset.c));
    });
    if (over === 'win' || over === 'lose') showResult(over);
    if (!$('overlay').classList.contains('hidden')) fillOverlay();
  }

  function fillOverlay() {
    const L = T[lang];
    const rules = $('oRules');
    rules.innerHTML = '';
    // Overlay is only for start / rules — win/lose use the outside-grid result banner
    $('oTitle').textContent = overlayMode === 'rules' ? L.rules : L.startT;
    $('oBody').textContent = L.startB;
    rulesList().forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      rules.appendChild(li);
    });
    $('oBtn').textContent = overlayMode === 'rules' ? (lang === 'ua' ? 'Зрозуміло' : 'Got it') : L.go;
  }

  function showOverlay(modeName) {
    overlayMode = modeName;
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
  $('resultReplay').onclick = () => { hideOverlay(); resetGame(); };
  $('diffEasy').onclick = () => setMode('easy');
  $('diffHard').onclick = () => setMode('hard');
  $('oBtn').onclick = () => {
    hideOverlay();
    if (overlayMode === 'start' || overlayMode === 'rules') return;
    resetGame();
  };

  $('boardWrap').addEventListener('contextmenu', (e) => e.preventDefault());

  window.__minesweeper = {
    get ROWS() { return ROWS; },
    get COLS() { return COLS; },
    get MINES() { return MINES; },
    get mode() { return mode; },
    MODES,
    state: () => ({
      mode, placed, over, flags, flagMode, lang, rows: ROWS, cols: COLS, minesTarget: MINES,
      mines: cells.filter((c) => c.mine).length,
      open: cells.filter((c) => c.open).length,
      cells: cells.map((c) => ({ mine: c.mine, open: c.open, flag: c.flag, n: c.n, hit: !!c.hit })),
      /** DOM snapshot helpers for tests */
      gridDigits: () => [...document.querySelectorAll('#board .cell')].filter((el) => /^\d+$/.test((el.textContent || '').trim())).length,
      gridFlags: () => document.querySelectorAll('#board .cell .flag').length,
      gridOutages: () => document.querySelectorAll('#board .cell.outage').length,
      gridLights: () => document.querySelectorAll('#board .cell.light').length,
      boardEnded: () => document.getElementById('board').classList.contains('ended'),
    }),
    openAt, toggleFlag, reset: resetGame, setMode,
    idx, neighbors, placeMines,
    seed(mineIndices, openIndex) {
      resetGame();
      cells.forEach((c) => { c.mine = false; c.n = 0; });
      for (const i of mineIndices) if (cells[i]) cells[i].mine = true;
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

  applyModeDims();
  resetGame();
  showOverlay('start');
})();
