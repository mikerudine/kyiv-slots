/* One Day in Kyiv — Outage Tetris ("Тетріс відключень")
   Ordinary Tetris on a 12×14 outage-schedule board. No live outage data. */
(function () {
  'use strict';

  const ROWS = 12;
  const COLS = 14;
  const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // SRS-ish shapes: each is a list of rotations; each rotation is [r,c] cells in a 4×4 box
  const SHAPES = {
    I: [
      [[1, 0], [1, 1], [1, 2], [1, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 1], [1, 1], [2, 1], [3, 1]],
    ],
    O: [
      [[0, 1], [0, 2], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [1, 2]],
    ],
    T: [
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 1]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
    S: [
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 1], [1, 2], [2, 0], [2, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]],
    ],
    Z: [
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 2], [1, 1], [1, 2], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 0]],
    ],
    J: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 0], [2, 1]],
    ],
    L: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [1, 2], [2, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  };
  const BAG = Object.keys(SHAPES);
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const BASE_MS = 900; // beginner gravity
  const MIN_MS = 120;

  const T = {
    ua: {
      title: 'Тетріс відключень',
      menu: '☰ Меню',
      score: 'рахунок',
      lines: 'лінії',
      level: 'рівень',
      next: 'Далі',
      legend: 'Легенда',
      legendLight: 'світло',
      legendDark: 'темрява',
      hint: '◀▶ рух · ↻ оберт · ▼ м’який · ▼▼ жорсткий. Клавіші: стрілки, пробіл, P.',
      startT: 'Тетріс відключень',
      startB: 'Звичайний тетріс на графіку відключень 12×14. Фігурки — сірі клітинки з перекресленою блискавкою. Це гра колекції, не офіційний сервіс.',
      go: 'Грати',
      pause: 'Пауза',
      pauseB: 'Натисни, щоб продовжити.',
      resume: 'Далі',
      over: 'Графік заповнено',
      overB: (s, l) => `Рахунок ${s}. Ліній: ${l}. Спробуй ще раз.`,
      again: 'Ще раз',
      halfAm: '00–12',
      halfPm: '12–24',
      legendHalf: 'у дні: ліва 00–12, права 12–24',
      legendHour: 'рядки = година ранку (+12 справа)',
      hard: '▼▼ Жорсткий',
      playing: 'Складаємо відключення…',
      paused: 'Пауза',
    },
    en: {
      title: 'Outage Tetris',
      menu: '☰ Menu',
      score: 'score',
      lines: 'lines',
      level: 'level',
      next: 'Next',
      legend: 'Legend',
      legendLight: 'power on',
      legendDark: 'outage',
      hint: '◀▶ move · ↻ rotate · ▼ soft · ▼▼ hard. Keys: arrows, space, P.',
      startT: 'Outage Tetris',
      startB: 'Ordinary Tetris on a 12×14 outage schedule. Pieces are grey cells with a crossed lightning bolt. A collection game — not an official service.',
      go: 'Play',
      pause: 'Paused',
      pauseB: 'Tap to resume.',
      resume: 'Resume',
      over: 'Schedule full',
      overB: (s, l) => `Score ${s}. Lines: ${l}. Try again.`,
      again: 'Play again',
      halfAm: '00–12',
      halfPm: '12–24',
      legendHalf: 'per day: left 00–12, right 12–24',
      legendHour: 'rows = morning hour (+12 on right)',
      hard: '▼▼ Hard drop',
      playing: 'Stacking outages…',
      paused: 'Paused',
    },
  };

  const $ = (id) => document.getElementById(id);
  const boardCv = $('board');
  const boardCtx = boardCv.getContext('2d');
  const nextCv = $('next');
  const nextCtx = nextCv.getContext('2d');

  let lang = localStorage.getItem('tetris-lang') || 'ua';
  let overlayMode = 'start'; // start | pause | over
  let running = false;
  let paused = false;
  let over = false;

  /** @type {(0|1)[][]} */
  let grid = [];
  let piece = null;
  let nextType = null;
  let bag = [];
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropAcc = 0;
  let lastTs = 0;
  let softDropping = false;
  let animId = 0;

  // layout metrics (recomputed on resize)
  let metrics = { cell: 24, ox: 48, oy: 44, dayH: 22, halfH: 18, hourW: 44 };

  function L() { return T[lang]; }
  function days() { return lang === 'ua' ? DAYS_UA : DAYS_EN; }

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function refillBag() {
    const b = BAG.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = b[i]; b[i] = b[j]; b[j] = t;
    }
    bag = bag.concat(b);
  }

  function takeFromBag() {
    if (bag.length < 7) refillBag();
    return bag.shift();
  }

  function cellsOf(type, rot, r, c) {
    return SHAPES[type][rot].map(([dr, dc]) => [r + dr, c + dc]);
  }

  function fits(type, rot, r, c) {
    const cells = cellsOf(type, rot, r, c);
    for (const [rr, cc] of cells) {
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return false;
      if (grid[rr][cc]) return false;
    }
    return true;
  }

  function spawn() {
    const type = nextType || takeFromBag();
    nextType = takeFromBag();
    // center horizontally in a 14-wide board; shapes use a 4-wide box
    const c = ((COLS - 4) / 2) | 0;
    const r = 0;
    if (!fits(type, 0, r, c)) {
      piece = { type, rot: 0, r, c };
      lockPiece(true);
      endGame();
      return false;
    }
    piece = { type, rot: 0, r, c };
    dropAcc = 0;
    drawNext();
    return true;
  }

  function tryMove(dr, dc) {
    if (!piece || over || paused) return false;
    const nr = piece.r + dr;
    const nc = piece.c + dc;
    if (!fits(piece.type, piece.rot, nr, nc)) return false;
    piece.r = nr;
    piece.c = nc;
    return true;
  }

  function tryRotate() {
    if (!piece || over || paused) return false;
    const nrot = (piece.rot + 1) & 3;
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (fits(piece.type, nrot, piece.r, piece.c + k)) {
        piece.rot = nrot;
        piece.c += k;
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    if (!piece || over || paused) return;
    let n = 0;
    while (tryMove(1, 0)) n++;
    score += n * 2;
    lockPiece(false);
  }

  function softStep() {
    if (!tryMove(1, 0)) lockPiece(false);
    else score += 1;
  }

  function lockPiece(spawnFailed) {
    if (!piece) return;
    const cells = cellsOf(piece.type, piece.rot, piece.r, piece.c);
    for (const [rr, cc] of cells) {
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) grid[rr][cc] = 1;
    }
    piece = null;
    if (!spawnFailed) {
      clearLines();
      updateHud();
      if (!over) spawn();
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every((v) => v)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (!cleared) return;
    score += LINE_SCORE[cleared] * level;
    lines += cleared;
    level = 1 + ((lines / 10) | 0);
  }

  function gravityMs() {
    return Math.max(MIN_MS, BASE_MS - (level - 1) * 70);
  }

  function endGame() {
    over = true;
    running = false;
    paused = false;
    overlayMode = 'over';
    showOverlay();
    updateHud();
  }

  function resetGame() {
    grid = emptyGrid();
    bag = [];
    nextType = null;
    piece = null;
    score = 0;
    lines = 0;
    level = 1;
    dropAcc = 0;
    over = false;
    paused = false;
    softDropping = false;
    refillBag();
    nextType = takeFromBag();
    spawn();
    running = true;
    lastTs = performance.now();
    updateHud();
    draw();
  }

  // ---- drawing ----
  /** Compact row label: morning hour start (right column of each day is +12). */
  function hourLabel(row) {
    return String(row).padStart(2, '0');
  }

  function computeMetrics() {
    const card = $('boardCard');
    const cssW = Math.max(200, (card && card.clientWidth) || boardCv.parentElement.clientWidth || 360);
    const cssH = Math.max(180, (card && card.clientHeight) || 320);
    // Single-line hour gutter — room for "00"/"11" without clipping
    const hourW = cssW < 340 ? 28 : (cssW < 420 ? 32 : 38);
    const dayH = cssW < 340 ? 20 : 24;
    // Fill the card: width- and height-driven sizes may differ slightly (schedule rows can be taller)
    const cellW = Math.max(16, Math.floor((cssW - hourW) / COLS));
    const cellH = Math.max(18, Math.floor((cssH - dayH) / ROWS));
    const boardW = hourW + cellW * COLS;
    const boardH = dayH + cellH * ROWS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardCv.width = Math.round(boardW * dpr);
    boardCv.height = Math.round(boardH * dpr);
    boardCv.style.width = boardW + 'px';
    boardCv.style.height = boardH + 'px';
    boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    metrics = { cell: Math.min(cellW, cellH), cellW, cellH, ox: hourW, oy: dayH, dayH, hourW, boardW, boardH };
  }

  function drawBolt(ctx, x, y, s, color) {
    const k = s / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(13.2, 2.2);
    ctx.lineTo(6.4, 13.1);
    ctx.lineTo(10.7, 13.1);
    ctx.lineTo(9.1, 21.8);
    ctx.lineTo(17.3, 9.4);
    ctx.lineTo(12.8, 9.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5, 5.5);
    ctx.lineTo(19, 18.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawOutageCell(ctx, x, y, s, ghost) {
    if (ghost) {
      ctx.strokeStyle = '#9aa3b2';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
      return;
    }
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(x, y, s, s);
    const pad = Math.max(2, s * 0.18);
    drawBolt(ctx, x + pad, y + pad, s - pad * 2, '#1a2340');
  }

  function ghostRow() {
    if (!piece) return piece;
    let r = piece.r;
    while (fits(piece.type, piece.rot, r + 1, piece.c)) r++;
    return { type: piece.type, rot: piece.rot, r, c: piece.c };
  }

  function draw() {
    const { cellW, cellH, ox, oy, dayH, hourW, boardW, boardH } = metrics;
    const ctx = boardCtx;
    ctx.clearRect(0, 0, boardW, boardH);

    // header background — day names only (half-day meaning lives in shared legend)
    ctx.fillStyle = '#f7f8fb';
    ctx.fillRect(0, 0, boardW, oy);
    ctx.fillStyle = '#eef1f6';
    ctx.fillRect(ox, 0, cellW * COLS, dayH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dayFont = cellW >= 26 ? 13 : (cellW >= 20 ? 12 : 11);
    ctx.fillStyle = '#1a2340';
    ctx.font = '800 ' + dayFont + 'px system-ui,sans-serif';
    const d = days();
    for (let i = 0; i < 7; i++) {
      ctx.fillText(d[i], ox + (i * 2 + 1) * cellW, dayH / 2);
    }

    // hour column — one compact label per row (no stacked am/pm pair)
    ctx.fillStyle = '#f7f8fb';
    ctx.fillRect(0, oy, hourW, cellH * ROWS);
    const hourFont = Math.max(10, Math.min(13, Math.floor(Math.min(cellH * 0.45, hourW * 0.42))));
    ctx.font = '800 ' + hourFont + 'px system-ui,sans-serif';
    ctx.fillStyle = '#1a2340';
    for (let r = 0; r < ROWS; r++) {
      const cy = oy + r * cellH + cellH / 2;
      ctx.fillText(hourLabel(r), hourW / 2, cy);
    }

    // corner
    ctx.fillStyle = '#64748b';
    ctx.font = '700 ' + Math.max(8, hourFont - 1) + 'px system-ui,sans-serif';
    ctx.fillText(lang === 'ua' ? 'год' : 'hr', hourW / 2, dayH / 2);

    // playfield white + fine grid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, cellW * COLS, cellH * ROWS);
    ctx.strokeStyle = '#e4e7ee';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cellH + 0.5);
      ctx.lineTo(ox + cellW * COLS, oy + r * cellH + 0.5);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cellW + 0.5, oy);
      ctx.lineTo(ox + c * cellW + 0.5, oy + cellH * ROWS);
      ctx.stroke();
    }
    // stronger separators between days; subtle mid-day split
    ctx.strokeStyle = '#d0d5de';
    for (let i = 0; i <= 7; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + i * 2 * cellW + 0.5, 0);
      ctx.lineTo(ox + i * 2 * cellW + 0.5, oy + cellH * ROWS);
      ctx.stroke();
    }
    ctx.strokeStyle = '#eceff4';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + (i * 2 + 1) * cellW + 0.5, oy);
      ctx.lineTo(ox + (i * 2 + 1) * cellW + 0.5, oy + cellH * ROWS);
      ctx.stroke();
    }

    const boltSize = Math.min(cellW, cellH);
    const boltPadX = (cellW - boltSize) / 2;
    const boltPadY = (cellH - boltSize) / 2;
    function paintCell(c, r, ghost) {
      const x = ox + c * cellW;
      const y = oy + r * cellH;
      if (ghost) {
        ctx.strokeStyle = '#9aa3b2';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);
        return;
      }
      ctx.fillStyle = '#9aa3b2';
      ctx.fillRect(x, y, cellW, cellH);
      const inset = Math.max(2, boltSize * 0.18);
      drawBolt(ctx, x + boltPadX + inset, y + boltPadY + inset, boltSize - inset * 2, '#1a2340');
    }

    // locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) paintCell(c, r, false);
      }
    }

    // ghost + active
    if (piece && running && !paused) {
      const g = ghostRow();
      if (g.r !== piece.r) {
        for (const [rr, cc] of cellsOf(g.type, g.rot, g.r, g.c)) {
          if (rr >= 0) paintCell(cc, rr, true);
        }
      }
      for (const [rr, cc] of cellsOf(piece.type, piece.rot, piece.r, piece.c)) {
        if (rr >= 0) paintCell(cc, rr, false);
      }
    }
  }

  function drawNext() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = nextCv.clientWidth || 72;
    nextCv.width = Math.round(css * dpr);
    nextCv.height = Math.round(css * dpr);
    nextCv.style.width = css + 'px';
    nextCv.style.height = css + 'px';
    nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nextCtx.clearRect(0, 0, css, css);
    nextCtx.fillStyle = '#fff';
    nextCtx.fillRect(0, 0, css, css);
    if (!nextType) return;
    const cells = SHAPES[nextType][0];
    let minR = 99, maxR = -1, minC = 99, maxC = -1;
    for (const [r, c] of cells) {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    const bw = maxC - minC + 1;
    const bh = maxR - minR + 1;
    const cell = Math.floor(Math.min((css - 8) / bw, (css - 8) / bh));
    const ox = (css - bw * cell) / 2;
    const oy = (css - bh * cell) / 2;
    for (const [r, c] of cells) {
      drawOutageCell(nextCtx, ox + (c - minC) * cell, oy + (r - minR) * cell, cell, false);
    }
  }

  // ---- UI ----
  function updateHud() {
    const LL = L();
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    document.title = LL.title + ' · One Day in Kyiv';
    $('title').textContent = LL.title;
    $('menu').textContent = LL.menu;
    $('lang').textContent = lang.toUpperCase();
    $('scoreLbl').textContent = LL.score;
    $('linesLbl').textContent = LL.lines;
    $('levelLbl').textContent = LL.level;
    $('score').textContent = String(score);
    $('lines').textContent = String(lines);
    $('level').textContent = String(level);
    $('nextLbl').textContent = LL.next;
    $('legTitle').textContent = LL.legend;
    $('hint').textContent = LL.hint;
    $('btnHard').textContent = LL.hard;
    $('pauseBtn').textContent = paused ? '▶' : '⏸';
    $('status').textContent = over ? '' : (paused ? LL.paused : (running ? LL.playing : ''));
    $('legend').innerHTML =
      '<span><i class="sw light"></i><em>' + LL.legendLight + '</em></span>' +
      '<span><i class="sw dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1a2340" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/><path stroke="#1a2340" stroke-width="2.4" stroke-linecap="round" d="M5 5.5 19 18.5"/></svg></i><em>' + LL.legendDark + '</em></span>' +
      '<span><i class="sw half" aria-hidden="true"><i></i><i></i></i><em>' + LL.legendHalf + '</em></span>' +
      '<span><em>' + LL.legendHour + '</em></span>';
  }

  function showOverlay() {
    const LL = L();
    const ov = $('overlay');
    ov.classList.remove('hidden');
    if (overlayMode === 'start') {
      $('oTitle').textContent = LL.startT;
      $('oBody').textContent = LL.startB;
      $('oBtn').textContent = LL.go;
    } else if (overlayMode === 'pause') {
      $('oTitle').textContent = LL.pause;
      $('oBody').textContent = LL.pauseB;
      $('oBtn').textContent = LL.resume;
    } else {
      $('oTitle').textContent = LL.over;
      $('oBody').textContent = LL.overB(score, lines);
      $('oBtn').textContent = LL.again;
    }
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
  }

  function startFromOverlay() {
    if (overlayMode === 'pause') {
      paused = false;
      hideOverlay();
      lastTs = performance.now();
      updateHud();
      return;
    }
    hideOverlay();
    resetGame();
  }

  function togglePause() {
    if (!running || over) return;
    if (paused) {
      paused = false;
      hideOverlay();
      lastTs = performance.now();
    } else {
      paused = true;
      overlayMode = 'pause';
      showOverlay();
    }
    updateHud();
  }

  // ---- loop ----
  function frame(ts) {
    animId = requestAnimationFrame(frame);
    if (!running || paused || over) {
      draw();
      return;
    }
    const dt = Math.min(50, ts - lastTs);
    lastTs = ts;
    dropAcc += dt;
    const step = softDropping ? Math.min(80, gravityMs() / 8) : gravityMs();
    while (dropAcc >= step) {
      dropAcc -= step;
      if (!tryMove(1, 0)) {
        lockPiece(false);
        break;
      } else if (softDropping) {
        score += 1;
      }
    }
    updateHud();
    draw();
  }

  // ---- input ----
  function onKey(e) {
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp')) return;
    const inOverlay = !$('overlay').classList.contains('hidden');
    if (inOverlay) {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startFromOverlay();
      }
      return;
    }
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault(); tryMove(0, -1); draw(); break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault(); tryMove(0, 1); draw(); break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault(); softDropping = true; softStep(); updateHud(); draw(); break;
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyX':
        e.preventDefault(); tryRotate(); draw(); break;
      case 'Space':
        e.preventDefault(); hardDrop(); updateHud(); draw(); break;
      case 'KeyP':
      case 'Escape':
        e.preventDefault(); togglePause(); break;
      default: break;
    }
  }

  function onKeyUp(e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') softDropping = false;
  }

  function bindHold(btn, downFn, upFn) {
    const down = (ev) => { ev.preventDefault(); downFn(); };
    const up = (ev) => { ev.preventDefault(); if (upFn) upFn(); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  let leftHold = 0, rightHold = 0, softHold = 0;

  function startRepeat(fn, assign) {
    fn();
    draw(); updateHud();
    const id = setInterval(() => { fn(); draw(); updateHud(); }, 70);
    assign(id);
  }
  function stopRepeat(id) { if (id) clearInterval(id); }

  // swipe on board
  let swipe = null;
  boardCv.addEventListener('pointerdown', (e) => {
    if (!running || paused || over) return;
    boardCv.setPointerCapture(e.pointerId);
    swipe = { x: e.clientX, y: e.clientY, moved: false };
  });
  boardCv.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (!swipe.moved && Math.hypot(dx, dy) < 18) return;
    swipe.moved = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) >= metrics.cellW * 0.55) {
        tryMove(0, dx > 0 ? 1 : -1);
        swipe.x = e.clientX;
        draw();
      }
    } else if (dy > metrics.cellH * 0.55) {
      softStep();
      swipe.y = e.clientY;
      updateHud();
      draw();
    }
  });
  boardCv.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (!swipe.moved && Math.hypot(dx, dy) < 12) {
      tryRotate();
      draw();
    } else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
      hardDrop();
      updateHud();
      draw();
    }
    swipe = null;
  });

  // ---- boot ----
  function applyLang() {
    updateHud();
    if (!$('overlay').classList.contains('hidden')) showOverlay();
    computeMetrics();
    drawNext();
    draw();
  }

  $('lang').onclick = () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('tetris-lang', lang);
    applyLang();
  };
  $('pauseBtn').onclick = () => togglePause();
  $('oBtn').onclick = () => startFromOverlay();

  bindHold($('btnLeft'), () => {
    if (!running || paused || over) return;
    stopRepeat(leftHold);
    startRepeat(() => tryMove(0, -1), (id) => { leftHold = id; });
  }, () => { stopRepeat(leftHold); leftHold = 0; });
  bindHold($('btnRight'), () => {
    if (!running || paused || over) return;
    stopRepeat(rightHold);
    startRepeat(() => tryMove(0, 1), (id) => { rightHold = id; });
  }, () => { stopRepeat(rightHold); rightHold = 0; });
  bindHold($('btnSoft'), () => {
    if (!running || paused || over) return;
    softDropping = true;
    stopRepeat(softHold);
    startRepeat(() => softStep(), (id) => { softHold = id; });
  }, () => { softDropping = false; stopRepeat(softHold); softHold = 0; });
  $('btnRot').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running || paused || over) return;
    tryRotate();
    draw();
  });
  $('btnHard').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running || paused || over) return;
    hardDrop();
    updateHud();
    draw();
  });

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  function relayout() {
    computeMetrics();
    drawNext();
    draw();
  }
  window.addEventListener('resize', relayout);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => relayout());
    ro.observe($('boardCard'));
    ro.observe($('wrap'));
  }

  // test hooks
  window.__tetris = {
    ROWS, COLS, SHAPES, BAG,
    state: () => ({
      running, paused, over, score, lines, level,
      grid: grid.map((r) => r.slice()),
      piece: piece ? { ...piece } : null,
      nextType, gravityMs: gravityMs(),
      metrics: { ...metrics },
      hourLabels: Array.from({ length: ROWS }, (_, r) => hourLabel(r)),
    }),
    relayout: () => relayout(),
    reset: () => { hideOverlay(); resetGame(); },
    move: (dr, dc) => tryMove(dr, dc),
    rotate: () => tryRotate(),
    hardDrop: () => hardDrop(),
    softDrop: () => softStep(),
    pause: () => togglePause(),
    setLang: (l) => { lang = l === 'en' ? 'en' : 'ua'; localStorage.setItem('tetris-lang', lang); applyLang(); },
    // inject board for tests
    setGrid: (g) => { grid = g.map((r) => r.slice()); draw(); },
    setPiece: (p) => { piece = p; draw(); },
    clearLines: () => { clearLines(); updateHud(); draw(); },
    lock: () => lockPiece(false),
  };

  grid = emptyGrid();
  overlayMode = 'start';
  applyLang();
  // second pass after flex layout settles so the board can grow into leftover height
  requestAnimationFrame(() => { relayout(); showOverlay(); });
  animId = requestAnimationFrame(frame);
})();
