/* One Day in Kyiv — «Розфарбуй тривоги»: pixel paint-by-numbers alert map */
(function () {
  'use strict';

  const ROUND_SEC = 60;
  const CHANGE_FRAC = 0.6;
  const WARN_SEC = 15;
  const URGENT_SEC = 5;
  const CHANGE_BANNER_MS = 900;
  const CHANGE_FADE_MS = 250;
  // Numbers / grid lines only when each on-screen cell is large enough (integer px).
  const MIN_NUM_PX = 12;
  const MIN_GRID_PX = 8;
  // Forgiving finger brush in CSS pixels.
  const BRUSH_CSS = 11;
  const COLOURS = {
    // hint = pale pastel paper tint (opaque) — never the dark fill colour
    1: { fill: '#3d5e38', nameUa: 'без тривоги', nameEn: 'no alert', swatch: '#5f9a52', hint: '#dde8d6', dot: '#5f9a52' },
    2: { fill: '#8a7428', nameUa: 'жовта', nameEn: 'yellow', swatch: '#d4ae3a', hint: '#f2ebcf', dot: '#c9a52e' },
    3: { fill: '#7a3030', nameUa: 'ракети', nameEn: 'missile', swatch: '#c44545', hint: '#f0e2e2', dot: '#c44545' },
    4: { fill: '#3f8f9e', nameUa: 'річка', nameEn: 'river', swatch: '#5eb8c9', hint: '#d9eef2', dot: '#3f8f9e' },
    5: { fill: '#8b939e', nameUa: 'місто', nameEn: 'town', swatch: '#b0b8c4', hint: '#e4e7ec', dot: '#8b939e' },
  };
  const EMPTY = '#eef1f4';
  const BG = '#0b1020';
  const GRID_LINE = '#cfd6df';

  const T = {
    ua: {
      title: 'Розфарбуй тривоги',
      menu: '☰ Меню',
      round: (n) => `Раунд ${n}`,
      progress: (a, b) => `${a}/${b}`,
      hint: 'Обери колір і веди пальцем. Два пальці — зсув/масштаб.',
      pause: 'Пауза',
      startT: 'Розфарбуй тривоги',
      startB: 'Карта тривог навколо Києва. Зафарбуй усі клітинки за номерами за 1 хвилину. Потім «зміна» — нові цілі на більшості карти.',
      go: 'Малювати',
      overT: 'Зміна застала!',
      overB: 'Карта була не готова, коли оновились цілі.',
      again: 'Ще раз',
      change: 'Зміна тривог!',
      score: (r, b, t) => `Раундів: ${r} · бонус часу: ${b} · разом: ${t}`,
    },
    en: {
      title: 'Colour the alerts',
      menu: '☰ Menu',
      round: (n) => `Round ${n}`,
      progress: (a, b) => `${a}/${b}`,
      hint: 'Pick a colour and drag to paint. Two fingers pan/zoom.',
      pause: 'Paused',
      startT: 'Colour the alerts',
      startB: 'Alert map around Kyiv. Paint every cell by number in 1 minute. Then a “change” reassigns most targets.',
      go: 'Paint',
      overT: 'Caught by the change!',
      overB: 'The map wasn’t finished when targets updated.',
      again: 'Play again',
      change: 'Alert change!',
      score: (r, b, t) => `Rounds: ${r} · time bonus: ${b} · total: ${t}`,
    },
  };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lang = localStorage.getItem('coloring-lang') || 'ua';
  let mapData = null;
  let gridData = null;
  let features = [];
  /** @type {{fi:number,col:number,row:number,painted:number}[]} */
  let cells = [];
  let cols = 0;
  let rows = 0;
  let cellW = 0;
  let cellH = 0;
  let state = null;
  let paused = false;
  let selected = 1;
  let last = performance.now();
  let uiAcc = 0;
  let changeFlashUntil = 0;
  let fullDirty = true;
  /** @type {Set<number>} */
  let dirtyCells = new Set();
  let paintDirty = false;
  let lastPaintClient = null;

  const canvas = $('board');
  const ctx = canvas.getContext('2d', { alpha: false });
  const viewport = $('mapViewport');
  // 1×1 pixel per cell; displayed with nearest-neighbour integer scale.
  const cellBuf = document.createElement('canvas');
  const cellBufCtx = cellBuf.getContext('2d', { alpha: false });
  let cellImg = null; // ImageData for fast pixel writes
  let hexRgb = {};
  let dpr = 1;
  let cssW = 1;
  let cssH = 1;

  let view = { zoom: 1, x: 0, y: 0 }; // zoom multiplies fit; x/y = CSS pan (integers)
  let pointers = new Map();
  let pinch0 = null;
  let paintPointerId = null;

  function parseHex(hex) {
    if (hexRgb[hex]) return hexRgb[hex];
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexRgb[hex] = rgb;
    return rgb;
  }

  function landColour() {
    return 1 + ((Math.random() * 3) | 0);
  }

  function targetFor(f) {
    if (f.kind === 'river') return 4;
    if (f.kind === 'town') return 5;
    return landColour();
  }

  function assignTargets(reassignIds) {
    const set = reassignIds ? new Set(reassignIds) : null;
    for (const f of features) {
      if (set && !set.has(f.id)) continue;
      f.target = targetFor(f);
    }
    if (set) {
      for (const c of cells) {
        if (set.has(features[c.fi].id)) c.painted = 0;
      }
    }
    fullDirty = true;
  }

  function cellTarget(c) {
    return features[c.fi].target;
  }

  function correctCount() {
    let n = 0;
    for (const c of cells) if (c.painted === cellTarget(c)) n++;
    return n;
  }

  function allCorrect() {
    for (const c of cells) if (c.painted !== cellTarget(c)) return false;
    return true;
  }

  function newRun() {
    for (const f of features) f.target = targetFor(f);
    for (const c of cells) c.painted = 0;
    state = {
      round: 1,
      timeLeft: ROUND_SEC,
      scoreRounds: 0,
      timeBonus: 0,
      over: false,
      started: true,
    };
    selected = 1;
    fitView();
    renderPalette();
    fullDirty = true;
    scheduleDraw();
    ui();
  }

  function doChange() {
    const land = features.filter((f) => f.kind === 'city' || f.kind === 'raion' || f.kind === 'oblast');
    const n = Math.max(1, Math.round(land.length * CHANGE_FRAC));
    for (let i = land.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = land[i]; land[i] = land[j]; land[j] = t;
    }
    const ids = land.slice(0, n).map((f) => f.id);
    assignTargets(ids);
    state.round++;
    state.scoreRounds++;
    state.timeLeft = ROUND_SEC;
    const bannerMs = reduceMotion() ? CHANGE_BANNER_MS : CHANGE_BANNER_MS;
    changeFlashUntil = performance.now() + bannerMs;
    const banner = $('changeBanner');
    banner.textContent = T[lang].change;
    if (reduceMotion()) {
      banner.style.transition = 'none';
    } else {
      banner.style.transition = `opacity ${CHANGE_FADE_MS}ms ease`;
    }
    banner.classList.add('show');
    fullDirty = true;
    scheduleDraw();
    ui();
  }

  function gameOver() {
    state.over = true;
    const total = state.scoreRounds + state.timeBonus;
    overlay(
      T[lang].overT,
      T[lang].overB,
      T[lang].again,
      T[lang].score(state.scoreRounds, state.timeBonus, total),
      true
    );
  }

  function overlay(title, body, btn, stats, showZsu) {
    $('oTitle').textContent = title;
    $('oBody').textContent = body;
    $('oBtn').textContent = btn;
    if (stats) {
      $('oStats').hidden = false;
      $('oStats').textContent = stats;
    } else {
      $('oStats').hidden = true;
    }
    $('overlay').classList.remove('hidden');
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(!!showZsu);
    if (typeof setGameNavToMenuVisible === 'function') setGameNavToMenuVisible(!!showZsu);
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
    if (typeof setGameNavToMenuVisible === 'function') setGameNavToMenuVisible(false);
  }

  function resizeCanvas() {
    const box = viewport.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, Math.round(box.width));
    cssH = Math.max(1, Math.round(box.height));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    // Draw in device pixels directly (no setTransform) so cell sizes stay integer.
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    fullDirty = true;
  }

  function initCellBuf() {
    cellBuf.width = cols;
    cellBuf.height = rows;
    cellImg = cellBufCtx.createImageData(cols, rows);
    // fill BG
    const [br, bg, bb] = parseHex(BG);
    const d = cellImg.data;
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4;
      d[o] = br; d[o + 1] = bg; d[o + 2] = bb; d[o + 3] = 255;
    }
  }

  function blankFill(c) {
    const kind = features[c.fi].kind;
    if (kind === 'river') return '#d2e8ee';
    if (kind === 'town') return '#dde1e7';
    if (kind === 'city') return '#e5ebe3';
    return EMPTY;
  }

  function cellFill(c) {
    if (c.painted) return COLOURS[c.painted].fill;
    if (features[c.fi].target === selected) return COLOURS[selected].hint;
    return blankFill(c);
  }

  function writeCellPixel(c) {
    const [r, g, b] = parseHex(cellFill(c));
    const o = (c.row * cols + c.col) * 4;
    cellImg.data[o] = r;
    cellImg.data[o + 1] = g;
    cellImg.data[o + 2] = b;
    cellImg.data[o + 3] = 255;
  }

  function rebuildCellBuf() {
    if (!cellImg) initCellBuf();
    const [br, bg, bb] = parseHex(BG);
    const d = cellImg.data;
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4;
      d[o] = br; d[o + 1] = bg; d[o + 2] = bb; d[o + 3] = 255;
    }
    for (let i = 0; i < cells.length; i++) writeCellPixel(cells[i]);
    cellBufCtx.putImageData(cellImg, 0, 0);
  }

  function scheduleDraw() {
    paintDirty = true;
  }

  /**
   * Uniform square cells in DEVICE pixels: every cell is exactly `cellDev`×`cellDev`.
   * CSS size is cellDev/dpr (may be fractional in CSS, but identical on screen).
   */
  function gridLayout() {
    const rect = viewport.getBoundingClientRect();
    const baseDev = Math.min((cssW * dpr) / cols, (cssH * dpr) / rows);
    const cellDev = Math.max(1, Math.round(baseDev * view.zoom));
    const mapDevW = cols * cellDev;
    const mapDevH = rows * cellDev;
    const originDevX = Math.round(view.x * dpr);
    const originDevY = Math.round(view.y * dpr);
    const cellCss = cellDev / dpr;
    return {
      rect,
      cssW,
      cssH,
      cellDev,
      cellCss,
      cellPx: cellCss, // alias for brush/hit tests in CSS space
      mapDevW,
      mapDevH,
      originDevX,
      originDevY,
      originX: originDevX / dpr,
      originY: originDevY / dpr,
      base: baseDev / dpr,
    };
  }

  function draw() {
    if (!gridData) return;
    if (canvas.width === 0) resizeCanvas();

    if (fullDirty || !cellImg) {
      rebuildCellBuf();
    } else if (dirtyCells.size) {
      for (const i of dirtyCells) writeCellPixel(cells[i]);
      cellBufCtx.putImageData(cellImg, 0, 0);
    }
    dirtyCells.clear();
    fullDirty = false;
    paintDirty = false;

    const layout = gridLayout();
    const {
      cellDev, cellCss, mapDevW, mapDevH, originDevX, originDevY,
    } = layout;

    ctx.imageSmoothingEnabled = false;
    if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
    if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nearest-neighbour blit — every cell is identically cellDev×cellDev device px.
    ctx.drawImage(
      cellBuf, 0, 0, cols, rows,
      originDevX, originDevY, mapDevW, mapDevH
    );

    // Optional uniform 1 device-px grid on integer boundaries when zoomed in.
    if (cellCss >= MIN_GRID_PX) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const x = originDevX + c * cellDev + 0.5;
        ctx.moveTo(x, originDevY);
        ctx.lineTo(x, originDevY + mapDevH);
      }
      for (let r = 0; r <= rows; r++) {
        const y = originDevY + r * cellDev + 0.5;
        ctx.moveTo(originDevX, y);
        ctx.lineTo(originDevX + mapDevW, y);
      }
      ctx.stroke();
    }

    if (cellCss >= 5) {
      const showNums = cellCss >= MIN_NUM_PX;
      if (showNums) {
        const fontPx = Math.max(8, Math.floor(cellCss * 0.55)) * dpr;
        ctx.font = `700 ${fontPx}px ui-sans-serif,system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      }
      for (const c of cells) {
        const cx = originDevX + c.col * cellDev + cellDev / 2;
        const cy = originDevY + c.row * cellDev + cellDev / 2;
        const target = cellTarget(c);
        if (!c.painted && target === selected) {
          const dotR = Math.max(1, Math.floor(cellDev * 0.16));
          ctx.fillStyle = COLOURS[selected].dot;
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        if (showNums && c.painted !== target) {
          ctx.lineWidth = Math.max(1, Math.floor(cellDev * 0.08));
          ctx.strokeStyle = '#f8fafcee';
          ctx.fillStyle = '#0f172a';
          const t = String(target);
          ctx.strokeText(t, cx, cy);
          ctx.fillText(t, cx, cy);
        }
      }
    }

    if (cellCss >= 6) {
      const labelPx = Math.max(9, Math.min(14, cellCss)) * dpr;
      ctx.font = `600 ${labelPx}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#0b1020ee';
      ctx.lineWidth = 3 * dpr;
      const scale = cellDev / cellW;
      for (const f of features) {
        if (f.kind !== 'town' || !f.label) continue;
        if (!f.major && cellCss < 10) continue;
        const lx = originDevX + f.cx * scale;
        const ly = originDevY + f.cy * scale + (f.major ? 10 : 8) * dpr;
        ctx.strokeText(f.label, lx, ly);
        ctx.fillText(f.label, lx, ly);
      }
    }
  }

  function renderPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    for (const id of [1, 2, 3, 4, 5]) {
      const c = COLOURS[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (selected === id ? ' on' : '');
      b.style.background = c.swatch;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', selected === id ? 'true' : 'false');
      b.innerHTML = `<span>${id}</span><small>${lang === 'ua' ? c.nameUa : c.nameEn}</small>`;
      b.onclick = () => {
        selected = id;
        renderPalette();
        fullDirty = true;
        scheduleDraw();
      };
      pal.appendChild(b);
    }
  }

  function ui() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    $('title').textContent = L.title;
    if (typeof setGameNavLang === 'function') setGameNavLang(lang);
    $('lang').textContent = lang.toUpperCase();
    $('pauseBtn').textContent = paused ? '▶' : '⏸';
    $('pauseTxt').textContent = L.pause;
    $('hint').textContent = L.hint;
    if (!state) {
      $('timer').textContent = ROUND_SEC.toFixed(1);
      $('timer').classList.remove('warn', 'urgent');
      $('round').textContent = '';
      $('progress').textContent = '';
      return;
    }
    const t = Math.max(0, state.timeLeft);
    $('timer').textContent = t.toFixed(1);
    $('timer').classList.toggle('warn', t <= WARN_SEC && t > URGENT_SEC);
    $('timer').classList.toggle('urgent', t <= URGENT_SEC);
    $('round').textContent = L.round(state.round);
    $('progress').textContent = L.progress(correctCount(), cells.length);
    if (changeFlashUntil && performance.now() > changeFlashUntil) {
      $('changeBanner').classList.remove('show');
      changeFlashUntil = 0;
    }
  }

  function applyView() {
    // Pan/zoom only changes blit scale — cell colours unchanged.
    scheduleDraw();
  }

  function fitView() {
    resizeCanvas();
    view.zoom = 1;
    const layout = gridLayout();
    view.x = Math.round((cssW - cols * layout.cellCss) / 2);
    view.y = Math.round((cssH - rows * layout.cellCss) / 2);
    fullDirty = true;
    applyView();
  }

  function clampView() {
    const maxZoom = Math.max(8, Math.ceil(Math.min(cssW, cssH) / 4));
    view.zoom = Math.min(maxZoom, Math.max(1, view.zoom));
    const layout = gridLayout();
    const mapCssW = cols * layout.cellCss;
    const mapCssH = rows * layout.cellCss;
    const maxX = cssW * 0.25;
    const maxY = cssH * 0.25;
    view.x = Math.round(Math.min(maxX, Math.max(cssW - mapCssW - maxX, view.x)));
    view.y = Math.round(Math.min(maxY, Math.max(cssH - mapCssH - maxY, view.y)));
  }

  let cellIndex = null;
  function buildCellIndex() {
    cellIndex = new Int32Array(cols * rows);
    cellIndex.fill(-1);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      cellIndex[c.row * cols + c.col] = i;
    }
  }

  function clientToCell(clientX, clientY) {
    const { rect, cellCss, originX, originY } = gridLayout();
    const lx = clientX - rect.left - originX;
    const ly = clientY - rect.top - originY;
    const col = Math.floor(lx / cellCss);
    const row = Math.floor(ly / cellCss);
    return { col, row, cellPx: cellCss, lx, ly };
  }

  function paintCellIndex(i) {
    if (i < 0 || !state || state.over || paused) return false;
    const c = cells[i];
    const target = cellTarget(c);
    if (target !== selected) return false;
    if (c.painted === target) return false;
    c.painted = selected;
    dirtyCells.add(i);
    scheduleDraw();
    return true;
  }

  function checkComplete() {
    if (allCorrect()) {
      state.timeBonus += Math.floor(state.timeLeft);
      doChange();
      return true;
    }
    return false;
  }

  /** Paint matching cells under a CSS-pixel brush around the finger. */
  function paintBrushAt(clientX, clientY) {
    if (!state || state.over || paused) return 0;
    const { col: hitCol, row: hitRow, cellPx, lx, ly } = clientToCell(clientX, clientY);
    const brushCells = BRUSH_CSS / cellPx;
    const brush2 = brushCells * brushCells;
    const rad = Math.ceil(brushCells);
    const col0 = Math.max(0, hitCol - rad);
    const col1 = Math.min(cols - 1, hitCol + rad);
    const row0 = Math.max(0, hitRow - rad);
    const row1 = Math.min(rows - 1, hitRow + rad);
    // Finger position in cell-space
    const fx = lx / cellPx;
    const fy = ly / cellPx;
    let n = 0;
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const dx = (col + 0.5) - fx;
        const dy = (row + 0.5) - fy;
        if (dx * dx + dy * dy > brush2) continue;
        const i = cellIndex[row * cols + col];
        if (paintCellIndex(i)) n++;
      }
    }
    return n;
  }

  /** Interpolate between pointer samples so fast swipes don't skip cells. */
  function paintStroke(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = BRUSH_CSS * 0.4;
    const steps = Math.max(1, Math.ceil(dist / step));
    let painted = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      painted += paintBrushAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
    if (painted) {
      ui();
      checkComplete();
    }
  }

  function paintAt(clientX, clientY) {
    if (!state || state.over || paused) return;
    if (lastPaintClient) {
      paintStroke(lastPaintClient.x, lastPaintClient.y, clientX, clientY);
    } else {
      const n = paintBrushAt(clientX, clientY);
      if (n) {
        ui();
        checkComplete();
      }
    }
    lastPaintClient = { x: clientX, y: clientY };
  }

  // one finger / mouse = paint; two fingers = pan + pinch zoom
  viewport.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      paintPointerId = null;
      lastPaintClient = null;
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const layout = gridLayout();
      pinch0 = {
        dist: Math.hypot(dx, dy) || 1,
        zoom: view.zoom,
        cellCss: layout.cellCss,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        vx: view.x,
        vy: view.y,
      };
    } else if (pointers.size === 1) {
      paintPointerId = e.pointerId;
      lastPaintClient = null;
      paintAt(e.clientX, e.clientY);
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinch0) {
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = viewport.getBoundingClientRect();
      view.zoom = pinch0.zoom * (dist / pinch0.dist);
      clampView();
      const layout = gridLayout();
      // Keep the map point under the original midpoint stable
      const localX = pinch0.midX - rect.left - pinch0.vx;
      const localY = pinch0.midY - rect.top - pinch0.vy;
      const mapCol = localX / pinch0.cellCss;
      const mapRow = localY / pinch0.cellCss;
      view.x = Math.round(midX - rect.left - mapCol * layout.cellCss);
      view.y = Math.round(midY - rect.top - mapRow * layout.cellCss);
      clampView();
      applyView();
    } else if (pointers.size === 1 && paintPointerId === e.pointerId) {
      // two-finger pan uses midpoint; one-finger paints
      if (prev && pointers.size === 1) {
        // no pan on one finger
      }
      paintAt(e.clientX, e.clientY);
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.pointerId === paintPointerId) {
      paintPointerId = null;
      lastPaintClient = null;
    }
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 1) {
      const [id, p] = [...pointers.entries()][0];
      paintPointerId = id;
      lastPaintClient = null;
      paintAt(p.x, p.y);
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('lostpointercapture', endPointer);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const before = gridLayout();
    const localX = e.clientX - rect.left - before.originX;
    const localY = e.clientY - rect.top - before.originY;
    const mapCol = localX / before.cellCss;
    const mapRow = localY / before.cellCss;
    view.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    clampView();
    const after = gridLayout();
    view.x = Math.round(e.clientX - rect.left - mapCol * after.cellCss);
    view.y = Math.round(e.clientY - rect.top - mapRow * after.cellCss);
    clampView();
    applyView();
  }, { passive: false });

  $('oBtn').onclick = () => {
    hideOverlay();
    newRun();
    paused = false;
    $('pause').classList.add('hidden');
  };
  $('lang').onclick = () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('coloring-lang', lang);
    renderPalette();
    ui();
    if (!$('overlay').classList.contains('hidden')) {
      if (state && state.over) {
        const total = state.scoreRounds + state.timeBonus;
        overlay(T[lang].overT, T[lang].overB, T[lang].again, T[lang].score(state.scoreRounds, state.timeBonus, total), true);
      } else {
        overlay(T[lang].startT, T[lang].startB, T[lang].go, null, false);
      }
    }
  };
  $('pauseBtn').onclick = () => {
    if (!state || state.over) return;
    if (!$('overlay').classList.contains('hidden')) return;
    paused = !paused;
    $('pause').classList.toggle('hidden', !paused);
    ui();
  };
  $('pause').onclick = () => $('pauseBtn').click();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state && state.started && !state.over && !paused && $('overlay').classList.contains('hidden')) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        if (allCorrect()) {
          doChange();
        } else {
          gameOver();
        }
      }
      uiAcc += dt;
      if (uiAcc > 0.1) {
        uiAcc = 0;
        ui();
      }
    } else if (changeFlashUntil) {
      ui();
    }
    if (paintDirty || fullDirty || dirtyCells.size) draw();
    requestAnimationFrame(frame);
  }

  window.__coloring = {
    state: () => state && {
      round: state.round,
      timeLeft: state.timeLeft,
      over: state.over,
      correct: correctCount(),
      total: cells.length,
      scoreRounds: state.scoreRounds,
      timeBonus: state.timeBonus,
      selected,
    },
    select: (n) => { selected = n; renderPalette(); fullDirty = true; scheduleDraw(); },
    paintId: (id) => {
      const fi = features.findIndex((x) => x.id === id);
      if (fi < 0 || !state || state.over) return;
      let any = false;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].fi !== fi) continue;
        if (paintCellIndex(i)) any = true;
      }
      if (any) {
        ui();
        checkComplete();
      }
    },
    paintCell: (i) => {
      if (paintCellIndex(i)) {
        ui();
        checkComplete();
      }
    },
    paintAt: (x, y) => {
      lastPaintClient = null;
      paintAt(x, y);
    },
    paintCorrectAll: () => {
      for (const c of cells) c.painted = cellTarget(c);
      fullDirty = true;
      scheduleDraw();
      ui();
    },
    forceChange: () => { if (state && !state.over) doChange(); },
    forceOver: () => { if (state) gameOver(); },
    features: () => features.map((f) => ({ id: f.id, kind: f.kind, target: f.target })),
    cells: () => cells.map((c, i) => ({
      i, fi: c.fi, id: features[c.fi].id, col: c.col, row: c.row,
      target: cellTarget(c), painted: c.painted,
    })),
  };

  Promise.all([
    fetch('map.json').then((r) => r.json()),
    fetch('grid.json').then((r) => r.json()),
  ])
    .then(([map, grid]) => {
      mapData = map;
      gridData = grid;
      features = map.features.map((f) => ({ ...f, target: 0 }));
      cols = grid.cols;
      rows = grid.rows;
      cellW = grid.cellW;
      cellH = grid.cellH;
      cells = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const fi = grid.cells[row * cols + col];
          if (fi < 0) continue;
          cells.push({ fi, col, row, painted: 0 });
        }
      }
      buildCellIndex();
      $('attr').textContent = mapData.attribution || '';
      renderPalette();
      fitView();
      window.addEventListener('resize', () => fitView());
      ui();
      overlay(T[lang].startT, T[lang].startB, T[lang].go, null, false);
      requestAnimationFrame(frame);
    })
    .catch((err) => {
      console.error(err);
      overlay('Error', String(err), 'OK', null, false);
    });
})();
