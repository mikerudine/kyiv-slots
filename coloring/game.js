/* One Day in Kyiv — «Розфарбуй тривоги»: pixel paint-by-numbers alert map */
(function () {
  'use strict';

  const ROUND_SEC = 60;
  const CHANGE_FRAC = 0.6;
  const WARN_SEC = 15;
  const URGENT_SEC = 5;
  const CHANGE_BANNER_MS = 900;
  const CHANGE_FADE_MS = 250;
  // Numbers only when zoomed enough (~3×+ on a phone with the fine grid).
  const MIN_NUM_CSS = 12;
  const MIN_GRID_CSS = 7;
  // Forgiving finger brush in CSS pixels (map-space radius derived from zoom).
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

  let view = { x: 0, y: 0, s: 1 };
  let pointers = new Map();
  let pinch0 = null;
  let paintPointerId = null;

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fullDirty = true;
  }

  function mapLayout() {
    const rect = viewport.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const vb = gridData.viewBox;
    const mapW = vb[2];
    const mapH = vb[3];
    const fit = Math.min(cssW / mapW, cssH / mapH);
    const ox = (cssW - mapW * fit) / 2;
    const oy = (cssH - mapH * fit) / 2;
    return { rect, cssW, cssH, mapW, mapH, fit, ox, oy };
  }

  function scheduleDraw() {
    paintDirty = true;
  }

  function blankFill(c) {
    // Kind-based pale paper so rivers / towns / city read in the silhouette
    // even before paint (static — no animation).
    const kind = features[c.fi].kind;
    if (kind === 'river') return '#d2e8ee';
    if (kind === 'town') return '#dde1e7';
    if (kind === 'city') return '#e5ebe3';
    return EMPTY;
  }

  function cellFill(c) {
    if (c.painted) return COLOURS[c.painted].fill;
    // Selected-colour blanks: light pastel (never the dark fill colour)
    if (features[c.fi].target === selected) return COLOURS[selected].hint;
    return blankFill(c);
  }

  function beginMapTransform(layout) {
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.s, view.s);
    ctx.translate(layout.ox, layout.oy);
    ctx.scale(layout.fit, layout.fit);
  }

  function paintCellRect(c, cellCss) {
    const x = c.col * cellW;
    const y = c.row * cellH;
    ctx.fillStyle = cellFill(c);
    ctx.fillRect(x, y, cellW + 0.35, cellH + 0.35);
    // Subtle static dot on selected-colour blanks (readable without dark fill)
    if (!c.painted && cellTarget(c) === selected && cellCss >= 5) {
      const dotR = Math.min(cellW, cellH) * 0.18;
      ctx.fillStyle = COLOURS[selected].dot;
      ctx.beginPath();
      ctx.arc(x + cellW / 2, y + cellH / 2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFull() {
    const layout = mapLayout();
    const { cssW, cssH, fit } = layout;
    if (canvas.width === 0) resizeCanvas();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cssW, cssH);

    beginMapTransform(layout);

    const cellCss = cellW * fit * view.s;
    const showNums = cellCss >= MIN_NUM_CSS;
    const showGrid = cellCss >= MIN_GRID_CSS;

    for (let i = 0; i < cells.length; i++) paintCellRect(cells[i], cellCss);

    if (showGrid) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = Math.max(0.25, 0.55 / (fit * view.s));
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const x = c * cellW;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rows * cellH);
      }
      for (let r = 0; r <= rows; r++) {
        const y = r * cellH;
        ctx.moveTo(0, y);
        ctx.lineTo(cols * cellW, y);
      }
      ctx.stroke();
    }

    if (showNums) {
      const fontPx = Math.min(cellH * 0.55, cellW * 0.55);
      ctx.font = `700 ${fontPx}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of cells) {
        if (c.painted === cellTarget(c)) continue;
        const x = c.col * cellW + cellW / 2;
        const y = c.row * cellH + cellH / 2;
        ctx.lineWidth = Math.max(1.2, fontPx * 0.16);
        ctx.strokeStyle = '#f8fafcee';
        ctx.fillStyle = '#0f172a';
        const t = String(cellTarget(c));
        ctx.strokeText(t, x, y);
        ctx.fillText(t, x, y);
      }
    }

    // Town labels: majors at modest zoom; all when zoomed in
    const labelZoom = view.s * fit;
    if (labelZoom > 0.45) {
      const labelPx = Math.max(8, 10 / Math.max(view.s, 0.01));
      ctx.font = `600 ${labelPx}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#0b1020ee';
      ctx.lineWidth = Math.max(2, 2.5 / view.s);
      for (const f of features) {
        if (f.kind !== 'town' || !f.label) continue;
        if (!f.major && labelZoom < 0.7) continue;
        const ly = f.cy + (f.major ? 14 : 12);
        ctx.strokeText(f.label, f.cx, ly);
        ctx.fillText(f.label, f.cx, ly);
      }
    }

    ctx.restore();
    dirtyCells.clear();
    fullDirty = false;
    paintDirty = false;
  }

  function drawDirtyOnly() {
    if (!dirtyCells.size) {
      paintDirty = false;
      return;
    }
    const layout = mapLayout();
    const cellCss = cellW * layout.fit * view.s;
    beginMapTransform(layout);
    for (const i of dirtyCells) paintCellRect(cells[i], cellCss);
    ctx.restore();
    dirtyCells.clear();
    paintDirty = false;
  }

  function draw() {
    if (!gridData) return;
    if (fullDirty) drawFull();
    else if (dirtyCells.size) drawDirtyOnly();
    else paintDirty = false;
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
    fullDirty = true;
    scheduleDraw();
  }

  function fitView() {
    const rect = viewport.getBoundingClientRect();
    view = { x: 0, y: 0, s: 1.15 };
    view.x = (rect.width - rect.width * view.s) / 2;
    view.y = (rect.height - rect.height * view.s) / 2;
    resizeCanvas();
    applyView();
  }

  function clampView() {
    const rect = viewport.getBoundingClientRect();
    const minS = 1;
    const maxS = 8;
    view.s = Math.min(maxS, Math.max(minS, view.s));
    const w = rect.width * view.s;
    const h = rect.height * view.s;
    const maxX = rect.width * 0.25;
    const maxY = rect.height * 0.25;
    view.x = Math.min(maxX, Math.max(rect.width - w - maxX, view.x));
    view.y = Math.min(maxY, Math.max(rect.height - h - maxY, view.y));
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

  function clientToMap(clientX, clientY) {
    const { rect, mapW, mapH, fit, ox, oy } = mapLayout();
    const lx = (clientX - rect.left - view.x) / view.s;
    const ly = (clientY - rect.top - view.y) / view.s;
    return {
      mx: (lx - ox) / fit,
      my: (ly - oy) / fit,
      mapW,
      mapH,
      fit,
    };
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
    const { mx, my, mapW, mapH, fit } = clientToMap(clientX, clientY);
    const brushMap = BRUSH_CSS / (fit * view.s);
    const brush2 = brushMap * brushMap;
    const col0 = Math.max(0, ((mx - brushMap) / cellW) | 0);
    const col1 = Math.min(cols - 1, ((mx + brushMap) / cellW) | 0);
    const row0 = Math.max(0, ((my - brushMap) / cellH) | 0);
    const row1 = Math.min(rows - 1, ((my + brushMap) / cellH) | 0);
    let n = 0;
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const cx = (col + 0.5) * cellW;
        const cy = (row + 0.5) * cellH;
        const dx = cx - mx;
        const dy = cy - my;
        if (dx * dx + dy * dy > brush2) continue;
        if (mx < -brushMap || my < -brushMap || mx > mapW + brushMap || my > mapH + brushMap) continue;
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
      pinch0 = {
        dist: Math.hypot(dx, dy) || 1,
        s: view.s,
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
      const scale = pinch0.s * (dist / pinch0.dist);
      const lx = (pinch0.midX - rect.left - pinch0.vx) / pinch0.s;
      const ly = (pinch0.midY - rect.top - pinch0.vy) / pinch0.s;
      view.s = scale;
      view.x = midX - rect.left - lx * view.s;
      view.y = midY - rect.top - ly * view.s;
      clampView();
      applyView();
    } else if (pointers.size === 1 && paintPointerId === e.pointerId) {
      void prev;
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
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const lx = (e.clientX - rect.left - view.x) / view.s;
    const ly = (e.clientY - rect.top - view.y) / view.s;
    view.s *= factor;
    clampView();
    view.x = e.clientX - rect.left - lx * view.s;
    view.y = e.clientY - rect.top - ly * view.s;
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
