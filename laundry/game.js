/* One Day in Kyiv — laundry match-3 v1 (washing machine drum) */
(function () {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  function resizeCanvas() {
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

  const COLS = 7, ROWS = 7;
  const TYPES = 6; // sock, tee, jeans, undies, towel, stain
  const TYPE_NAMES = ['sock', 'tee', 'jeans', 'undies', 'towel', 'stain'];
  const COLORS = ['#38bdf8', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa', '#f87171'];
  const COLORS_DK = ['#0369a1', '#9d174d', '#1d4ed8', '#b45309', '#6d28d9', '#b91c1c'];

  // Board geometry inside drum
  const DRUM_CX = W / 2;
  const DRUM_CY = H * 0.52;
  const DRUM_R = 148;
  const CELL = 34;
  const BOARD_W = COLS * CELL;
  const BOARD_H = ROWS * CELL;
  const BOARD_X = DRUM_CX - BOARD_W / 2;
  const BOARD_Y = DRUM_CY - BOARD_H / 2;

  const MOVES0 = 25;
  const TARGET0 = 1800;
  const SWAP_MS = 0.14;
  const FALL_MS = 0.18;
  const CLEAR_MS = 0.16;
  const MAX_WAVES = 25;

  const I18N = {
    ua: {
      title: 'Стирка',
      hint: 'Поміняй сусідні · 3+ в ряд · капсула / ополіскувач',
      score: (s, t) => `${s | 0} / ${t | 0}`,
      moves: (n) => `хода: ${n}`,
      overlayTitle: 'Пральна машина',
      overlayBody: 'Збери 3+ однакових речей у барабані. 4 — капсула порошку (ряд), 5 — ополіскувач (колір). Інколи світло гасне — зачекай або тисни «Генератор».',
      start: 'Старт', again: 'Ще раз',
      winTitle: 'Чиста білизна!', loseTitle: 'Не допрало',
      overBody: (s, t) => `Рахунок ${s | 0} · ціль ${t | 0}`,
      pause: 'Пауза', pauseBody: 'Торкніться, щоб продовжити',
      outage: '💡 Світла нема',
      gen: 'Генератор',
    },
    en: {
      title: 'Laundry',
      hint: 'Swap adjacent · match 3+ · powder / softener',
      score: (s, t) => `${s | 0} / ${t | 0}`,
      moves: (n) => `moves: ${n}`,
      overlayTitle: 'Washing machine',
      overlayBody: 'Match 3+ laundry items in the drum. 4 → powder capsule (row), 5 → softener (color). Occasional blackout — wait or tap Generator.',
      start: 'Start', again: 'Again',
      winTitle: 'Fresh laundry!', loseTitle: 'Still dirty',
      overBody: (s, t) => `Score ${s | 0} · target ${t | 0}`,
      pause: 'Paused', pauseBody: 'Tap to resume',
      outage: '💡 Blackout',
      gen: 'Generator',
    },
  };

  let lang = localStorage.getItem('laundry-lang') || 'ua';
  const t = () => I18N[lang];

  let running = false, dead = false, won = false, paused = false;
  let score = 0, moves = MOVES0, target = TARGET0;
  let time = 0;
  let board = []; // [r][c] = {type, special:0|1|2, id, fall, clear, x,y}
  let selected = null; // {r,c}
  let busy = false;
  let anims = []; // active tween helpers
  let spin = 0; // drum spin for cascades
  let spinTarget = 0;
  let outage = false, outageTimer = 0, nextOutageIn = 28;
  let outageAnnounce = 0;
  let genPulse = 0;
  let nextId = 1;

  const pauseBtn = document.getElementById('pauseBtn');
  const pauseOverlay = document.getElementById('pauseOverlay');

  function applyLang() {
    const L = t();
    document.getElementById('tTitle').textContent = L.title;
    document.getElementById('hint').textContent = L.hint;
    document.getElementById('lang').textContent = lang.toUpperCase();
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    document.getElementById('pauseTitle').textContent = L.pause;
    document.getElementById('pauseBody').textContent = L.pauseBody;
    if (!running) {
      document.getElementById('oTitle').textContent = dead ? (won ? L.winTitle : L.loseTitle) : L.overlayTitle;
      document.getElementById('oBody').textContent = dead ? L.overBody(score, target) : L.overlayBody;
      document.getElementById('oBtn').textContent = dead ? L.again : L.start;
      if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(dead);
    }
    syncHud();
  }
  document.getElementById('lang').addEventListener('click', () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('laundry-lang', lang);
    applyLang();
  });

  function syncHud() {
    document.getElementById('scoreLine').textContent = t().score(score, target);
    document.getElementById('movesLine').textContent = t().moves(moves);
  }
  function syncPauseBtn() {
    if (running && !dead) pauseBtn.classList.remove('hidden');
    else pauseBtn.classList.add('hidden');
  }
  function setPaused(v) {
    if (!running || dead) return;
    paused = !!v;
    if (paused) { pauseOverlay.classList.add('show'); applyLang(); }
    else { pauseOverlay.classList.remove('show'); last = performance.now(); }
  }
  function togglePause() { if (!running || dead) return; setPaused(!paused); }
  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  pauseOverlay.addEventListener('click', () => { if (paused) setPaused(false); });

  function cellAt(r, c) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return board[r][c];
  }
  function posOf(r, c) {
    return { x: BOARD_X + c * CELL + CELL / 2, y: BOARD_Y + r * CELL + CELL / 2 };
  }
  function randType() { return (Math.random() * TYPES) | 0; }

  function makeTile(type, special) {
    return {
      type: type == null ? randType() : type,
      special: special || 0, // 0 normal, 1 row powder, 2 color softener
      id: nextId++,
      fall: 0, clear: 0, scale: 1,
      ox: 0, oy: 0, // swap offset
    };
  }

  function fillBoardNoMatches() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        let typ, guard = 0;
        do {
          typ = randType();
          guard++;
        } while (guard < 40 && wouldMatchAt(r, c, typ));
        board[r][c] = makeTile(typ);
      }
    }
  }
  function wouldMatchAt(r, c, typ) {
    // horizontal
    if (c >= 2 && board[r][c - 1] && board[r][c - 2] &&
        board[r][c - 1].type === typ && board[r][c - 2].type === typ) return true;
    // vertical
    if (r >= 2 && board[r - 1][c] && board[r - 2][c] &&
        board[r - 1][c].type === typ && board[r - 2][c].type === typ) return true;
    return false;
  }

  function findMatches() {
    const marks = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const runs = [];
    // rows
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const same = c < COLS && board[r][c] && board[r][c - 1] &&
          board[r][c].type === board[r][c - 1].type &&
          board[r][c].clear === 0 && board[r][c - 1].clear === 0;
        if (same) run++;
        else {
          if (run >= 3) { const rc = []; for (let k = 0; k < run; k++) { marks[r][c - 1 - k] = Math.max(marks[r][c - 1 - k], run); rc.push({ r, c: c - 1 - k }); } runs.push(rc); }
          run = 1;
        }
      }
    }
    // cols
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const same = r < ROWS && board[r][c] && board[r - 1][c] &&
          board[r][c].type === board[r - 1][c].type &&
          board[r][c].clear === 0 && board[r - 1][c].clear === 0;
        if (same) run++;
        else {
          if (run >= 3) { const rc = []; for (let k = 0; k < run; k++) { marks[r - 1 - k][c] = Math.max(marks[r - 1 - k][c], run); rc.push({ r: r - 1 - k, c }); } runs.push(rc); }
          run = 1;
        }
      }
    }
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (marks[r][c] >= 3) cells.push({ r, c, run: marks[r][c] });
    }
    return { marks, cells, runs };
  }

  function hasAnyMove() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && swapCreatesMatch(r, c, r, c + 1)) return true;
      if (r + 1 < ROWS && swapCreatesMatch(r, c, r + 1, c)) return true;
    }
    return false;
  }
  function swapCreatesMatch(r1, c1, r2, c2) {
    const a = board[r1][c1], b = board[r2][c2];
    if (!a || !b) return false;
    board[r1][c1] = b; board[r2][c2] = a;
    const m = findMatches().cells.length > 0;
    board[r1][c1] = a; board[r2][c2] = b;
    return m;
  }

  function shuffleBoard() {
    const types = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c]) types.push({ type: board[r][c].type, special: board[r][c].special });
    }
    for (let i = types.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }
    let k = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t0 = types[k++];
      board[r][c] = makeTile(t0.type, t0.special);
    }
  }

  function resetGame() {
    running = false; dead = false; won = false; paused = false;
    pauseOverlay.classList.remove('show');
    score = 0; moves = MOVES0; target = TARGET0;
    time = 0; selected = null; busy = false; anims = [];
    spin = 0; spinTarget = 0;
    outage = false; outageTimer = 0; nextOutageIn = 22 + Math.random() * 16;
    outageAnnounce = 0; genPulse = 0;
    fillBoardNoMatches();
    let tries = 0;
    while (!hasAnyMove() && tries++ < 30) shuffleBoard();
    syncPauseBtn(); applyLang(); syncHud();
  }

  function endGame(didWin) {
    running = false; dead = true; won = !!didWin; paused = false;
    pauseOverlay.classList.remove('show');
    busy = false; selected = null;
    syncPauseBtn(); applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function trySelect(r, c) {
    if (!running || paused || dead || busy || outage) return;
    if (!cellAt(r, c)) return;
    if (!selected) { selected = { r, c }; return; }
    if (selected.r === r && selected.c === c) { selected = null; return; }
    if (adjacent(selected, { r, c })) {
      const from = selected; selected = null;
      attemptSwap(from.r, from.c, r, c);
    } else {
      selected = { r, c };
    }
  }

  function attemptSwap(r1, c1, r2, c2) {
    if (busy || outage) return false;
    const a = board[r1][c1], b = board[r2][c2];
    if (!a || !b) return false;
    // special activation: swap special with anything triggers it after swap if no match? Standard: 4/5 create specials on clear
    // If swapping two specials or special+tile — still require match OR activate special on destination
    busy = true;
    const p1 = posOf(r1, c1), p2 = posOf(r2, c2);
    a.ox = 0; a.oy = 0; b.ox = 0; b.oy = 0;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    let u = 0;
    function stepSwap(dt) {
      u += dt / SWAP_MS;
      const t0 = Math.min(1, u);
      const e = t0 * t0 * (3 - 2 * t0);
      a.ox = dx * e; a.oy = dy * e;
      b.ox = -dx * e; b.oy = -dy * e;
      if (t0 >= 1) {
        board[r1][c1] = b; board[r2][c2] = a;
        a.ox = a.oy = b.ox = b.oy = 0;
        const matched = findMatches().cells.length > 0;
        const specialHit = (a.special > 0) || (b.special > 0);
        if (!matched && !specialHit) {
          // invalid — snap back
          board[r1][c1] = a; board[r2][c2] = b;
          a.ox = a.oy = b.ox = b.oy = 0;
          busy = false;
          return false;
        }
        moves = Math.max(0, moves - 1);
        syncHud();
        // After swap: a sits at (r2,c2), b at (r1,c1)
        resolveBoard(!matched && specialHit ? [{ r: r2, c: c2 }, { r: r1, c: c1 }] : null);
        return false;
      }
      return true;
    }
    anims.push(stepSwap);
    return true;
  }

  function resolveBoard(forceSpecialCells) {
    busy = true;
    spinTarget = spin + Math.PI * 0.35;

    let waves = 0;
    function cascade() {
      waves++;
      if (waves > MAX_WAVES) {
        // safety: never loop forever — rebuild a clean board and settle
        fillBoardNoMatches();
        let tries = 0;
        while (!hasAnyMove() && tries++ < 30) shuffleBoard();
        afterSettle();
        return;
      }
      const { cells, runs } = findMatches();
      // Also expand specials that are in the match set
      const clearSet = new Set(cells.map((p) => p.r + ',' + p.c));
      // Forced special activation (swap special without a 3-match)
      if (forceSpecialCells) {
        for (const p of forceSpecialCells) {
          const tile = cellAt(p.r, p.c);
          if (tile && tile.special > 0) clearSet.add(p.r + ',' + p.c);
        }
        forceSpecialCells = null; // only first wave
      }
      // create specials for runs of 4/5 before clearing
      const specialSpawns = [];
      // ONE special per run of 4/5 (at its middle cell), not one per cell —
      // otherwise the spawned specials re-form the same run and cascade forever.
      for (const run of runs) {
        if (run.length < 4) continue;
        const mid = run[(run.length / 2) | 0];
        const tile = board[mid.r][mid.c];
        if (!tile) continue;
        specialSpawns.push({ r: mid.r, c: mid.c, special: run.length >= 5 ? 2 : 1, type: tile.type });
      }
      // activate any specials in clear set
      const queue = [...cells, ...[...clearSet].map((k) => { const [r, c] = k.split(',').map(Number); return { r, c }; })];
      const seen = new Set(clearSet);
      while (queue.length) {
        const p = queue.pop();
        const tile = board[p.r][p.c];
        if (!tile) continue;
        if (tile.special === 1) {
          for (let c = 0; c < COLS; c++) {
            const key = p.r + ',' + c;
            if (!seen.has(key)) { seen.add(key); queue.push({ r: p.r, c }); }
          }
        } else if (tile.special === 2) {
          const typ = tile.type;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].type === typ) {
              const key = r + ',' + c;
              if (!seen.has(key)) { seen.add(key); queue.push({ r, c }); }
            }
          }
        }
      }

      if (seen.size === 0) {
        afterSettle();
        return;
      }

      let pts = 0;
      seen.forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        const tile = board[r][c];
        if (!tile) return;
        pts += 40 + (tile.special ? 30 : 0);
        tile.clear = 0.001;
      });
      score += pts;
      syncHud();
      spinTarget = spin + Math.PI * (0.25 + seen.size * 0.02);

      let u = 0;
      anims.push(function clearAnim(dt) {
        u += dt / CLEAR_MS;
        const t0 = Math.min(1, u);
        seen.forEach((key) => {
          const [r, c] = key.split(',').map(Number);
          const tile = board[r][c];
          if (tile) { tile.clear = t0; tile.scale = 1 - t0; }
        });
        if (t0 >= 1) {
          // remove & spawn specials at first spawn cell still in set
          const usedSpawn = new Set();
          for (const sp of specialSpawns) {
            const key = sp.r + ',' + sp.c;
            if (!seen.has(key) || usedSpawn.has(key)) continue;
            usedSpawn.add(key);
            board[sp.r][sp.c] = makeTile(sp.type, sp.special);
            seen.delete(key);
          }
          seen.forEach((key) => {
            const [r, c] = key.split(',').map(Number);
            board[r][c] = null;
          });
          applyGravityThenRefill(cascade);
          return false;
        }
        return true;
      });
    }

    cascade();
  }

  function applyGravityThenRefill(done) {
    // compact columns
    const falls = [];
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (r !== write) {
            board[write][c] = board[r][c];
            board[r][c] = null;
            const tile = board[write][c];
            const from = posOf(r, c), to = posOf(write, c);
            tile.oy = from.y - to.y;
            falls.push(tile);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const tile = makeTile();
        board[r][c] = tile;
        const to = posOf(r, c);
        tile.oy = BOARD_Y - CELL * (write - r + 2) - to.y;
        falls.push(tile);
      }
    }
    if (!falls.length) { done(); return; }
    let u = 0;
    anims.push(function fallAnim(dt) {
      u += dt / FALL_MS;
      const t0 = Math.min(1, u);
      const e = t0 * t0 * (3 - 2 * t0);
      for (const tile of falls) {
        // oy goes from start offset to 0
        if (tile._fall0 == null) tile._fall0 = tile.oy;
        tile.oy = tile._fall0 * (1 - e);
      }
      if (t0 >= 1) {
        for (const tile of falls) { tile.oy = 0; tile._fall0 = null; }
        done();
        return false;
      }
      return true;
    });
  }

  function shuffleClean() {
    for (let i = 0; i < 40; i++) {
      shuffleBoard();
      if (!findMatches().cells.length && hasAnyMove()) return;
    }
    fillBoardNoMatches();
    let tries = 0;
    while (!hasAnyMove() && tries++ < 30) shuffleBoard();
  }
  function afterSettle() {
    if (score >= target) { busy = false; endGame(true); return; }
    if (moves <= 0) { busy = false; endGame(false); return; }
    if (findMatches().cells.length) { resolveBoard(null); return; }
    if (!hasAnyMove()) shuffleClean();
    busy = false;
  }

  // ---- input ----
  function hitCell(mx, my) {
    // only inside drum circle roughly
    const dx = mx - DRUM_CX, dy = my - DRUM_CY;
    if (dx * dx + dy * dy > (DRUM_R - 8) * (DRUM_R - 8)) return null;
    const c = Math.floor((mx - BOARD_X) / CELL);
    const r = Math.floor((my - BOARD_Y) / CELL);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return { r, c };
  }

  // Generator button rect (during outage)
  function genRect() {
    return { x: W / 2 - 70, y: H - 86, w: 140, h: 40 };
  }
  function hitGen(mx, my) {
    const g = genRect();
    return mx >= g.x && mx <= g.x + g.w && my >= g.y && my <= g.y + g.h;
  }

  let pointer = { down: false, x: 0, y: 0, sr: -1, sc: -1 };

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  function onDown(e) {
    e.preventDefault();
    if (!running || paused || dead) return;
    const p = canvasPos(e.touches ? e.touches[0] : e);
    pointer.down = true; pointer.x = p.x; pointer.y = p.y;
    if (outage && hitGen(p.x, p.y)) {
      clearOutage();
      return;
    }
    const cell = hitCell(p.x, p.y);
    if (cell) { pointer.sr = cell.r; pointer.sc = cell.c; }
    else { pointer.sr = pointer.sc = -1; }
  }
  function onMove(e) {
    if (!pointer.down) return;
    const p = canvasPos(e.touches ? e.touches[0] : e);
    pointer.x = p.x; pointer.y = p.y;
  }
  function onUp(e) {
    if (!pointer.down) return;
    pointer.down = false;
    if (!running || paused || dead || busy) return;
    if (outage) return;
    const p = canvasPos(e.changedTouches ? e.changedTouches[0] : e);
    const cell = hitCell(p.x, p.y);
    if (pointer.sr >= 0) {
      const dx = p.x - (BOARD_X + pointer.sc * CELL + CELL / 2);
      const dy = p.y - (BOARD_Y + pointer.sr * CELL + CELL / 2);
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        // swipe
        let tr = pointer.sr, tc = pointer.sc;
        if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
        else tr += dy > 0 ? 1 : -1;
        if (cellAt(tr, tc)) {
          selected = null;
          attemptSwap(pointer.sr, pointer.sc, tr, tc);
          return;
        }
      }
      // tap
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
    if (e.code === 'Enter' && !running) document.getElementById('oBtn').click();
    if (e.code === 'KeyG' && outage) clearOutage();
  });

  document.getElementById('oBtn').addEventListener('click', () => {
    resetGame(); running = true;
    document.getElementById('overlay').classList.add('hidden');
    syncPauseBtn(); applyLang();
  });

  function clearOutage() {
    outage = false; outageTimer = 0; outageAnnounce = 0;
    nextOutageIn = 18 + Math.random() * 16;
    genPulse = 0;
  }
  function forceOutage(secs) {
    outage = true;
    outageTimer = secs == null ? 6 : secs;
    outageAnnounce = 2.2;
    selected = null;
  }

  // ---- draw helpers ----
  function drawMachine() {
    // body
    const bx = 28, by = 70, bw = W - 56, bh = H - 130;
    const grd = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    grd.addColorStop(0, '#1e293b');
    grd.addColorStop(0.5, '#0f172a');
    grd.addColorStop(1, '#020617');
    ctx.fillStyle = grd;
    roundRect(bx, by, bw, bh, 28);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // top panel
    ctx.fillStyle = '#334155';
    roundRect(bx + 16, by + 14, bw - 32, 56, 12);
    ctx.fill();
    // display
    ctx.fillStyle = outage ? '#111827' : '#0ea5e9';
    roundRect(bx + 28, by + 26, 84, 32, 6);
    ctx.fill();
    ctx.fillStyle = outage ? '#64748b' : '#ecfeff';
    ctx.font = 'bold 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(outage ? '----' : (score | 0), bx + 70, by + 47);
    // knobs
    drawKnob(bx + bw - 70, by + 42, outage ? '#1f2937' : '#94a3b8');
    drawKnob(bx + bw - 38, by + 42, outage ? '#1f2937' : '#fbbf24');
    // brand
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px system-ui,sans-serif';
    ctx.fillText('KYIV WASH', bx + bw / 2, by + 50);
    ctx.textAlign = 'left';
  }
  function drawKnob(x, y, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y); ctx.stroke();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDrum() {
    // outer ring
    ctx.save();
    ctx.translate(DRUM_CX, DRUM_CY);
    ctx.rotate(spin * 0.15);
    const ring = ctx.createRadialGradient(0, 0, DRUM_R - 18, 0, 0, DRUM_R + 10);
    ring.addColorStop(0, '#64748b');
    ring.addColorStop(0.7, '#334155');
    ring.addColorStop(1, '#0f172a');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(0, 0, DRUM_R + 8, 0, Math.PI * 2); ctx.fill();
    // glass
    ctx.fillStyle = outage ? '#020617' : '#0b1224';
    ctx.beginPath(); ctx.arc(0, 0, DRUM_R - 6, 0, Math.PI * 2); ctx.fill();
    // rim highlight
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, DRUM_R - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e2e8f066';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, DRUM_R + 6, -0.8, 0.4); ctx.stroke();
    // hinge
    ctx.rotate(-spin * 0.15);
    ctx.fillStyle = '#475569';
    ctx.fillRect(DRUM_R - 2, -18, 14, 36);
    ctx.restore();

    // clip board to drum
    ctx.save();
    ctx.beginPath();
    ctx.arc(DRUM_CX, DRUM_CY, DRUM_R - 10, 0, Math.PI * 2);
    ctx.clip();

    // water tint
    ctx.fillStyle = outage ? '#020617cc' : '#0c4a6e33';
    ctx.fillRect(BOARD_X - 20, BOARD_Y - 20, BOARD_W + 40, BOARD_H + 40);

    // faint grid
    if (!outage) {
      ctx.strokeStyle = '#1e3a5f55';
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
    }

    // tiles
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = board[r][c];
      if (!tile) continue;
      const p = posOf(r, c);
      drawTile(tile, p.x + tile.ox, p.y + tile.oy, selected && selected.r === r && selected.c === c);
    }
    ctx.restore();

    // glass reflection
    ctx.save();
    ctx.beginPath();
    ctx.arc(DRUM_CX, DRUM_CY, DRUM_R - 10, 0, Math.PI * 2);
    ctx.clip();
    const gloss = ctx.createLinearGradient(DRUM_CX - 80, DRUM_CY - 120, DRUM_CX + 40, DRUM_CY);
    gloss.addColorStop(0, 'rgba(255,255,255,0.14)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(DRUM_CX - DRUM_R, DRUM_CY - DRUM_R, DRUM_R * 2, DRUM_R * 1.2);
    if (outage) {
      ctx.fillStyle = 'rgba(2,6,23,0.55)';
      ctx.fillRect(DRUM_CX - DRUM_R, DRUM_CY - DRUM_R, DRUM_R * 2, DRUM_R * 2);
    }
    ctx.restore();
  }

  function drawTile(tile, x, y, sel) {
    const s = CELL * 0.86 * (tile.scale == null ? 1 : tile.scale);
    ctx.save();
    ctx.translate(x, y);
    if (outage) ctx.globalAlpha = 0.4;
    // bg
    ctx.fillStyle = COLORS_DK[tile.type];
    roundRect(-s / 2, -s / 2, s, s, 8);
    ctx.fill();
    ctx.fillStyle = COLORS[tile.type];
    roundRect(-s / 2 + 2, -s / 2 + 2, s - 4, s * 0.45, 6);
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 3;
      roundRect(-s / 2 - 1, -s / 2 - 1, s + 2, s + 2, 9);
      ctx.stroke();
    }
    // icon
    drawIcon(tile.type, s * 0.55);
    // special badge
    if (tile.special === 1) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.28, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0ea5e9';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('≡', s * 0.28, -s * 0.24);
    } else if (tile.special === 2) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.28, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✦', s * 0.28, -s * 0.24);
    }
    ctx.restore();
  }

  function drawIcon(type, size) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const h = size / 2;
    if (type === 0) { // sock
      ctx.beginPath();
      ctx.moveTo(-h * 0.3, -h * 0.7);
      ctx.lineTo(h * 0.2, -h * 0.7);
      ctx.lineTo(h * 0.25, h * 0.1);
      ctx.quadraticCurveTo(h * 0.7, h * 0.2, h * 0.55, h * 0.65);
      ctx.lineTo(-h * 0.05, h * 0.7);
      ctx.quadraticCurveTo(-h * 0.2, h * 0.25, -h * 0.3, h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(-h * 0.28, -h * 0.7, h * 0.48, h * 0.22);
    } else if (type === 1) { // tee
      ctx.beginPath();
      ctx.moveTo(-h * 0.55, -h * 0.35);
      ctx.lineTo(-h * 0.2, -h * 0.55);
      ctx.lineTo(0, -h * 0.35);
      ctx.lineTo(h * 0.2, -h * 0.55);
      ctx.lineTo(h * 0.55, -h * 0.35);
      ctx.lineTo(h * 0.35, -h * 0.15);
      ctx.lineTo(h * 0.35, h * 0.6);
      ctx.lineTo(-h * 0.35, h * 0.6);
      ctx.lineTo(-h * 0.35, -h * 0.15);
      ctx.closePath();
      ctx.fill();
    } else if (type === 2) { // jeans
      ctx.fillRect(-h * 0.4, -h * 0.65, h * 0.8, h * 0.35);
      ctx.fillRect(-h * 0.4, -h * 0.3, h * 0.32, h * 0.95);
      ctx.fillRect(h * 0.08, -h * 0.3, h * 0.32, h * 0.95);
      ctx.strokeStyle = '#1e3a8a';
      ctx.beginPath(); ctx.moveTo(0, -h * 0.3); ctx.lineTo(0, h * 0.65); ctx.stroke();
    } else if (type === 3) { // undies
      ctx.beginPath();
      ctx.moveTo(-h * 0.55, -h * 0.2);
      ctx.lineTo(h * 0.55, -h * 0.2);
      ctx.lineTo(h * 0.45, h * 0.55);
      ctx.lineTo(h * 0.1, h * 0.2);
      ctx.lineTo(-h * 0.1, h * 0.2);
      ctx.lineTo(-h * 0.45, h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-h * 0.5, -h * 0.28, h, h * 0.16);
    } else if (type === 4) { // towel
      ctx.fillRect(-h * 0.55, -h * 0.45, h * 1.1, h * 0.9);
      ctx.strokeStyle = '#ddd6fe';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-h * 0.5, i * h * 0.15);
        ctx.lineTo(h * 0.5, i * h * 0.15);
        ctx.stroke();
      }
    } else { // stain blob
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(0, 0, h * 0.55, h * 0.4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fecaca';
      ctx.beginPath(); ctx.arc(-h * 0.15, -h * 0.1, h * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawOutageUI() {
    if (!outage) return;
    if (outageAnnounce > 0) {
      const a = Math.min(1, outageAnnounce / 0.35);
      ctx.fillStyle = `rgba(17,24,39,${0.88 * a})`;
      const tw = 180;
      ctx.fillRect((W - tw) / 2, 150, tw, 30);
      ctx.fillStyle = `rgba(254,243,199,${a})`;
      ctx.font = 'bold 14px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t().outage, W / 2, 170);
    }
    // generator button
    const g = genRect();
    genPulse += 0.08;
    const pulse = 0.7 + Math.sin(genPulse) * 0.3;
    ctx.fillStyle = `rgba(250,204,21,${0.75 + pulse * 0.2})`;
    roundRect(g.x, g.y, g.w, g.h, 14);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ ' + t().gen, g.x + g.w / 2, g.y + 26);
    ctx.textAlign = 'left';
    // chip
    ctx.fillStyle = '#111827cc';
    ctx.fillRect(10, H - 36, 130, 24);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 12px system-ui,sans-serif';
    ctx.fillText(t().outage, 18, H - 19);
  }

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#020617');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBg();
    drawMachine();
    drawDrum();
    drawOutageUI();
  }

  function update(dt) {
    if (!running || paused) return;
    time += dt;
    if (outageAnnounce > 0) outageAnnounce -= dt;

    // anims
    for (let i = anims.length - 1; i >= 0; i--) {
      if (!anims[i](dt)) anims.splice(i, 1);
    }

    // spin ease
    if (spin < spinTarget) {
      spin += (spinTarget - spin) * Math.min(1, dt * 4);
    }

    // outage schedule
    if (!busy) {
      if (outage) {
        outageTimer -= dt;
        if (outageTimer <= 0) clearOutage();
      } else if (time > 16) {
        nextOutageIn -= dt;
        if (nextOutageIn <= 0) forceOutage(5 + Math.random() * 3);
      }
    }
  }

  let last = performance.now();
  let frames = 0, fpsT = 0, fps = 0;
  const fpsSamples = [];

  window.__laundry = {
    getFps: () => fps,
    getFpsSamples: () => fpsSamples.slice(),
    start: () => document.getElementById('oBtn').click(),
    setPaused: (v) => setPaused(!!v),
    getState: () => ({
      score, moves, target, running, dead, won, paused, busy, outage, time, W, H,
      hasMove: hasAnyMove(), selected,
    }),
    forceOutage: (s) => forceOutage(s),
    clearOutage: () => clearOutage(),
    findMove: () => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS && swapCreatesMatch(r, c, r, c + 1)) return { r1: r, c1: c, r2: r, c2: c + 1 };
        if (r + 1 < ROWS && swapCreatesMatch(r, c, r + 1, c)) return { r1: r, c1: c, r2: r + 1, c2: c };
      }
      return null;
    },
    setMoves: (n) => { moves = n; syncHud(); },
    setTarget: (n) => { target = n; syncHud(); },
    // engineer a cascade: put a 3-in-col of one type above a gap so it falls into a match; kind 1/2 = include specials
    injectCascade: (kind) => {
      if (busy) return false;
      const c = (Math.random() * COLS) | 0, typ = randType();
      for (let r = 0; r < 4; r++) board[r][c] = makeTile(typ, r === 1 && kind ? kind : 0);
      for (let r = 4; r < ROWS; r++) board[r][(c + 1) % COLS] = makeTile(typ, r === 5 && kind === 2 ? 2 : 0);
      resolveBoard(null); return true;
    },
    debug: () => ({ busy, anims: anims.length, score, board: board.map((row) => row.map((t) => t ? t.type + (t.special ? '*' + t.special : '') + (t.clear ? '!' : '') : '.').join(' ')) }),
    playMove: (m) => {
      if (!m) m = window.__laundry.findMove();
      if (!m) return false;
      return attemptSwap(m.r1, m.c1, m.r2, m.c2);
    },
  };

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      fps = Math.round(frames / fpsT);
      fpsSamples.push(fps);
      if (fpsSamples.length > 40) fpsSamples.shift();
      document.getElementById('fps').textContent = fps + ' fps';
      frames = 0; fpsT = 0;
    }
    requestAnimationFrame(frame);
  }

  resetGame();
  applyLang();
  draw();
  requestAnimationFrame(frame);
})();
