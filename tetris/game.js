/* One Day in Kyiv — Outage Tetris ("Тетріс відключень")
   Ordinary Tetris on a 24×10 outage-queue schedule. No live outage data. */
(function () {
  'use strict';

  const ROWS = 24;
  const COLS = 10;
  const QUEUES = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2'];

  // SRS-ish shapes: each rotation is [r,c] cells in a 4×4 box
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
  const BASE_MS = 900;
  const MIN_MS = 120;

  const COL = {
    bg: '#0f141c',
    header: '#161c26',
    grid: '#2a3344',
    gridSoft: '#1e2633',
    label: '#c9d2e0',
    labelDim: '#8b95a8',
    settled: '#6b7380',
    boltWhite: '#f2f5fa',
    boltYellow: '#f5c518',
    activeFill: '#1a2230',
    ghost: '#4a5568',
  };

  const T = {
    ua: {
      title: 'Тетріс відключень',
      menu: '☰ Меню',
      score: 'рахунок',
      lines: 'лінії',
      level: 'рівень',
      next: 'Далі',
      legend: 'Легенда',
      legendEmpty: 'світло',
      legendSettled: 'темрява',
      legendActive: 'фігура',
      legendQueues: 'колонки = черги 1.1–5.2',
      legendHours: 'рядки = години 00–24',
      corner: 'Час/Гр.',
      hint: '◀▶ рух · ↻ оберт · ▼ м’який · ▼▼ жорсткий. Клавіші: стрілки, пробіл, P.',
      startT: 'Тетріс відключень',
      startB: 'Звичайний тетріс на графіку черг відключень 24×10. Жовта блискавка — активна фігура; сірі з білою перекресленою — вже вимкнені години. Це гра колекції, не офіційний сервіс.',
      go: 'Грати',
      pause: 'Пауза',
      pauseB: 'Натисни, щоб продовжити.',
      resume: 'Далі',
      over: 'Графік заповнено',
      overB: (s, l) => `Рахунок ${s}. Ліній: ${l}. Спробуй ще раз.`,
      again: 'Ще раз',
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
      legendEmpty: 'power on',
      legendSettled: 'outage',
      legendActive: 'active',
      legendQueues: 'columns = queues 1.1–5.2',
      legendHours: 'rows = hours 00–24',
      corner: 'Time/Q.',
      hint: '◀▶ move · ↻ rotate · ▼ soft · ▼▼ hard. Keys: arrows, space, P.',
      startT: 'Outage Tetris',
      startB: 'Ordinary Tetris on a 24×10 outage-queue schedule. Yellow bolt = falling piece; grey cells with a white crossed bolt = locked outages. A collection game — not an official service.',
      go: 'Play',
      pause: 'Paused',
      pauseB: 'Tap to resume.',
      resume: 'Resume',
      over: 'Schedule full',
      overB: (s, l) => `Score ${s}. Lines: ${l}. Try again.`,
      again: 'Play again',
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
  let overlayMode = 'start';
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

  let metrics = { cellW: 28, cellH: 24, ox: 44, oy: 22, hourW: 44, dayH: 22, boardW: 324, boardH: 598 };

  function L() { return T[lang]; }

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
    for (const [rr, cc] of cellsOf(type, rot, r, c)) {
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return false;
      if (grid[rr][cc]) return false;
    }
    return true;
  }

  function spawn() {
    const type = nextType || takeFromBag();
    nextType = takeFromBag();
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
    for (const k of [0, -1, 1, -2, 2]) {
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
    for (const [rr, cc] of cellsOf(piece.type, piece.rot, piece.r, piece.c)) {
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

  function hourLabel(row) {
    const a0 = String(row).padStart(2, '0');
    const a1 = String(row + 1).padStart(2, '0');
    return a0 + '–' + a1;
  }

  function computeMetrics() {
    const card = $('boardCard');
    const cssW = Math.max(260, (card && card.clientWidth) || boardCv.parentElement.clientWidth || 360);
    // Prefer readable hour labels ("00–01") and queue headers ("1.1")
    const hourW = cssW < 340 ? 40 : (cssW < 420 ? 46 : 52);
    const dayH = cssW < 340 ? 20 : 22;
    const cellW = Math.max(22, Math.floor((cssW - hourW) / COLS));
    // Keep row height readable; allow natural page scroll rather than crushing 24 rows
    const cellH = Math.max(22, Math.min(cellW + 2, 28));
    const boardW = hourW + cellW * COLS;
    const boardH = dayH + cellH * ROWS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardCv.width = Math.round(boardW * dpr);
    boardCv.height = Math.round(boardH * dpr);
    boardCv.style.width = boardW + 'px';
    boardCv.style.height = boardH + 'px';
    boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    metrics = { cellW, cellH, ox: hourW, oy: dayH, dayH, hourW, boardW, boardH };
  }

  function drawBolt(ctx, x, y, s, color, crossed) {
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
    if (crossed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(5, 5.5);
      ctx.lineTo(19, 18.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintCell(ctx, c, r, kind) {
    const { cellW, cellH, ox, oy } = metrics;
    const x = ox + c * cellW;
    const y = oy + r * cellH;
    const boltSize = Math.min(cellW, cellH);
    const bx = x + (cellW - boltSize) / 2;
    const by = y + (cellH - boltSize) / 2;
    const inset = Math.max(2, boltSize * 0.16);

    if (kind === 'ghost') {
      ctx.strokeStyle = COL.ghost;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);
      return;
    }
    if (kind === 'settled') {
      ctx.fillStyle = COL.settled;
      ctx.fillRect(x, y, cellW, cellH);
      drawBolt(ctx, bx + inset, by + inset, boltSize - inset * 2, COL.boltWhite, true);
      return;
    }
    // active: dark cell + yellow (uncrossed) bolt
    ctx.fillStyle = COL.activeFill;
    ctx.fillRect(x, y, cellW, cellH);
    drawBolt(ctx, bx + inset, by + inset, boltSize - inset * 2, COL.boltYellow, false);
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

    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, boardW, boardH);

    // header band
    ctx.fillStyle = COL.header;
    ctx.fillRect(0, 0, boardW, dayH);
    ctx.fillRect(0, 0, hourW, boardH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const qFont = cellW >= 28 ? 11 : (cellW >= 24 ? 10 : 9);
    ctx.fillStyle = COL.label;
    ctx.font = '700 ' + qFont + 'px system-ui,sans-serif';
    for (let i = 0; i < COLS; i++) {
      ctx.fillText(QUEUES[i], ox + (i + 0.5) * cellW, dayH / 2);
    }

    // corner
    ctx.fillStyle = COL.labelDim;
    ctx.font = '700 ' + Math.max(8, qFont - 1) + 'px system-ui,sans-serif';
    ctx.fillText(L().corner, hourW / 2, dayH / 2);

    // hour labels — one range per row, never clipped (canvas height includes all 24)
    const hFont = Math.max(9, Math.min(11, Math.floor(cellH * 0.42)));
    ctx.font = '600 ' + hFont + 'px system-ui,sans-serif';
    ctx.fillStyle = COL.label;
    for (let r = 0; r < ROWS; r++) {
      ctx.fillText(hourLabel(r), hourW / 2, oy + r * cellH + cellH / 2);
    }

    // playfield grid
    ctx.strokeStyle = COL.gridSoft;
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
    // stronger separators between queue pairs (1.x, 2.x, …)
    ctx.strokeStyle = COL.grid;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + i * 2 * cellW + 0.5, 0);
      ctx.lineTo(ox + i * 2 * cellW + 0.5, oy + cellH * ROWS);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) paintCell(ctx, c, r, 'settled');
      }
    }

    if (piece && running && !paused) {
      const g = ghostRow();
      if (g.r !== piece.r) {
        for (const [rr, cc] of cellsOf(g.type, g.rot, g.r, g.c)) {
          if (rr >= 0) paintCell(ctx, cc, rr, 'ghost');
        }
      }
      for (const [rr, cc] of cellsOf(piece.type, piece.rot, piece.r, piece.c)) {
        if (rr >= 0) paintCell(ctx, cc, rr, 'active');
      }
    }
  }

  function drawNext() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = nextCv.clientWidth || 56;
    nextCv.width = Math.round(css * dpr);
    nextCv.height = Math.round(css * dpr);
    nextCv.style.width = css + 'px';
    nextCv.style.height = css + 'px';
    nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nextCtx.clearRect(0, 0, css, css);
    nextCtx.fillStyle = COL.bg;
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
      const x = ox + (c - minC) * cell;
      const y = oy + (r - minR) * cell;
      nextCtx.fillStyle = COL.activeFill;
      nextCtx.fillRect(x, y, cell, cell);
      const inset = Math.max(2, cell * 0.16);
      drawBolt(nextCtx, x + inset, y + inset, cell - inset * 2, COL.boltYellow, false);
    }
  }

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
      '<span><i class="sw empty"></i><em>' + LL.legendEmpty + '</em></span>' +
      '<span><i class="sw settled"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f2f5fa" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/><path stroke="#f2f5fa" stroke-width="2.4" stroke-linecap="round" d="M5 5.5 19 18.5"/></svg></i><em>' + LL.legendSettled + '</em></span>' +
      '<span><i class="sw active"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f5c518" d="M13.2 2.2 6.4 13.1h4.3l-1.6 8.7 8.2-12.4h-4.5z"/></svg></i><em>' + LL.legendActive + '</em></span>' +
      '<span><em>' + LL.legendQueues + '</em></span>' +
      '<span><em>' + LL.legendHours + '</em></span>';
  }

  function showOverlay() {
    const LL = L();
    $('overlay').classList.remove('hidden');
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

  function hideOverlay() { $('overlay').classList.add('hidden'); }

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

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!running || paused || over) { draw(); return; }
    const dt = Math.min(50, ts - lastTs);
    lastTs = ts;
    dropAcc += dt;
    const step = softDropping ? Math.min(80, gravityMs() / 8) : gravityMs();
    while (dropAcc >= step) {
      dropAcc -= step;
      if (!tryMove(1, 0)) { lockPiece(false); break; }
      else if (softDropping) score += 1;
    }
    updateHud();
    draw();
  }

  function onKey(e) {
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp')) return;
    const inOverlay = !$('overlay').classList.contains('hidden');
    if (inOverlay) {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startFromOverlay(); }
      return;
    }
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); tryMove(0, -1); draw(); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); tryMove(0, 1); draw(); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); softDropping = true; softStep(); updateHud(); draw(); break;
      case 'ArrowUp': case 'KeyW': case 'KeyX': e.preventDefault(); tryRotate(); draw(); break;
      case 'Space': e.preventDefault(); hardDrop(); updateHud(); draw(); break;
      case 'KeyP': case 'Escape': e.preventDefault(); togglePause(); break;
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
    fn(); draw(); updateHud();
    assign(setInterval(() => { fn(); draw(); updateHud(); }, 70));
  }
  function stopRepeat(id) { if (id) clearInterval(id); }

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
    if (!swipe.moved && Math.hypot(dx, dy) < 12) { tryRotate(); draw(); }
    else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) { hardDrop(); updateHud(); draw(); }
    swipe = null;
  });

  function applyLang() {
    updateHud();
    if (!$('overlay').classList.contains('hidden')) showOverlay();
    computeMetrics();
    drawNext();
    draw();
  }

  function relayout() {
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
  window.addEventListener('resize', relayout);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => relayout());
    ro.observe($('boardCard'));
    ro.observe($('wrap'));
  }

  window.__tetris = {
    ROWS, COLS, SHAPES, BAG, QUEUES,
    state: () => ({
      running, paused, over, score, lines, level,
      grid: grid.map((r) => r.slice()),
      piece: piece ? { ...piece } : null,
      nextType, gravityMs: gravityMs(),
      metrics: { ...metrics },
      hourLabels: Array.from({ length: ROWS }, (_, r) => hourLabel(r)),
      queues: QUEUES.slice(),
    }),
    relayout: () => relayout(),
    reset: () => { hideOverlay(); resetGame(); },
    move: (dr, dc) => tryMove(dr, dc),
    rotate: () => tryRotate(),
    hardDrop: () => hardDrop(),
    softDrop: () => softStep(),
    pause: () => togglePause(),
    setLang: (l) => { lang = l === 'en' ? 'en' : 'ua'; localStorage.setItem('tetris-lang', lang); applyLang(); },
    setGrid: (g) => { grid = g.map((r) => r.slice()); draw(); },
    setPiece: (p) => { piece = p; draw(); },
    clearLines: () => { clearLines(); updateHud(); draw(); },
    lock: () => lockPiece(false),
  };

  grid = emptyGrid();
  overlayMode = 'start';
  applyLang();
  requestAnimationFrame(() => { relayout(); showOverlay(); });
  requestAnimationFrame(frame);
})();
