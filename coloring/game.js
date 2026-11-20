/* One Day in Kyiv — «Розфарбуй тривоги»: pixel paint-by-numbers alert map */
(function () {
  'use strict';

  const ROUND_SEC = 60;
  const CHANGE_FRAC = 0.6;
  const WARN_SEC = 15;
  const URGENT_SEC = 5;
  const CHANGE_BANNER_MS = 900;
  const CHANGE_FADE_MS = 250;
  const MIN_NUM_CSS = 14;
  const COLOURS = {
    1: { fill: '#3d5e38', nameUa: 'без тривоги', nameEn: 'no alert', swatch: '#5f9a52', hint: 'rgba(95,154,82,0.28)' },
    2: { fill: '#8a7428', nameUa: 'жовта', nameEn: 'yellow', swatch: '#d4ae3a', hint: 'rgba(212,174,58,0.30)' },
    3: { fill: '#7a3030', nameUa: 'ракети', nameEn: 'missile', swatch: '#c44545', hint: 'rgba(196,69,69,0.28)' },
    4: { fill: '#3f8f9e', nameUa: 'річка', nameEn: 'river', swatch: '#5eb8c9', hint: 'rgba(94,184,201,0.30)' },
    5: { fill: '#8b939e', nameUa: 'місто', nameEn: 'town', swatch: '#b0b8c4', hint: 'rgba(176,184,196,0.32)' },
  };
  const EMPTY = '#eef1f4';
  const BG = '#0b1020';
  const GRID_LINE = '#d4dae3';

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
  let dirty = true;

  const canvas = $('board');
  const ctx = canvas.getContext('2d', { alpha: false });
  const viewport = $('mapViewport');

  let view = { x: 0, y: 0, s: 1 };
  let pointers = new Map();
  let pinch0 = null;
  let paintPointerId = null;
  let lastPaintKey = -1;

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
    dirty = true;
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
    dirty = true;
    draw();
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
    dirty = true;
    draw();
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
    dirty = true;
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

  function draw() {
    if (!gridData) return;
    const { cssW, cssH, fit, ox, oy } = mapLayout();
    if (canvas.width === 0) resizeCanvas();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cssW, cssH);

    // Pan/zoom only in canvas (no CSS transform) so zoom stays crisp.
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.s, view.s);
    ctx.translate(ox, oy);
    ctx.scale(fit, fit);

    const cellCss = cellW * fit * view.s;
    const showNums = cellCss >= MIN_NUM_CSS;
    const hint = COLOURS[selected].hint;

    for (const c of cells) {
      const x = c.col * cellW;
      const y = c.row * cellH;
      const target = cellTarget(c);
      let fill;
      if (c.painted) {
        fill = COLOURS[c.painted].fill;
      } else if (target === selected) {
        fill = hint;
      } else {
        fill = EMPTY;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    }

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = Math.max(0.4, 0.8 / (fit * view.s));
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

    if (showNums) {
      const fontPx = Math.min(cellH * 0.55, cellW * 0.55);
      ctx.font = `700 ${fontPx}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of cells) {
        const target = cellTarget(c);
        if (c.painted === target) continue;
        const x = c.col * cellW + cellW / 2;
        const y = c.row * cellH + cellH / 2;
        ctx.lineWidth = Math.max(1.5, fontPx * 0.18);
        ctx.strokeStyle = '#f8fafcee';
        ctx.fillStyle = '#0f172a';
        const t = String(target);
        ctx.strokeText(t, x, y);
        ctx.fillText(t, x, y);
      }
    }

    if (view.s * fit > 0.55) {
      const labelPx = Math.max(9, 11 / Math.max(view.s, 0.01));
      ctx.font = `600 ${labelPx}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#0b1020ee';
      ctx.lineWidth = Math.max(2, 3 / view.s);
      for (const f of features) {
        if (f.kind !== 'town' || !f.label) continue;
        const ly = f.cy + (f.major ? 14 : 12);
        ctx.strokeText(f.label, f.cx, ly);
        ctx.fillText(f.label, f.cx, ly);
      }
    }

    ctx.restore();
    dirty = false;
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
        dirty = true;
        draw();
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
    dirty = true;
  }

  function fitView() {
    const rect = viewport.getBoundingClientRect();
    view = { x: 0, y: 0, s: 1.15 };
    view.x = (rect.width - rect.width * view.s) / 2;
    view.y = (rect.height - rect.height * view.s) / 2;
    resizeCanvas();
    applyView();
    draw();
  }

  function clampView() {
    const rect = viewport.getBoundingClientRect();
    const minS = 1;
    const maxS = 5.5;
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

  function hitCellFast(clientX, clientY) {
    const { rect, mapW, mapH, fit, ox, oy } = mapLayout();
    const lx = (clientX - rect.left - view.x) / view.s;
    const ly = (clientY - rect.top - view.y) / view.s;
    const mx = (lx - ox) / fit;
    const my = (ly - oy) / fit;
    if (mx < 0 || my < 0 || mx >= mapW || my >= mapH) return -1;
    const col = Math.min(cols - 1, Math.max(0, (mx / cellW) | 0));
    const row = Math.min(rows - 1, Math.max(0, (my / cellH) | 0));
    return cellIndex[row * cols + col];
  }

  function paintCellIndex(i) {
    if (i < 0 || !state || state.over || paused) return false;
    const c = cells[i];
    const target = cellTarget(c);
    if (target !== selected) return false;
    if (c.painted === target) return false;
    c.painted = selected;
    dirty = true;
    return true;
  }

  function afterPaint() {
    draw();
    ui();
    if (allCorrect()) {
      state.timeBonus += Math.floor(state.timeLeft);
      doChange();
    }
  }

  function paintAt(clientX, clientY) {
    if (!state || state.over || paused) return;
    const i = hitCellFast(clientX, clientY);
    if (i < 0) return;
    if (i === lastPaintKey) return;
    lastPaintKey = i;
    if (paintCellIndex(i)) afterPaint();
  }

  // one finger / mouse = paint; two fingers = pan + pinch zoom
  viewport.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      paintPointerId = null;
      lastPaintKey = -1;
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
      lastPaintKey = -1;
      paintAt(e.clientX, e.clientY);
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
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
      // two-finger pan follows midpoint delta + pinch zoom
      const midDx = midX - pinch0.midX;
      const midDy = midY - pinch0.midY;
      view.s = scale;
      view.x = midX - rect.left - lx * view.s;
      view.y = midY - rect.top - ly * view.s;
      // incorporate pan relative to original mid (already in midX/midY)
      void midDx; void midDy;
      clampView();
      applyView();
      draw();
    } else if (pointers.size === 1 && paintPointerId === e.pointerId) {
      paintAt(e.clientX, e.clientY);
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.pointerId === paintPointerId) {
      paintPointerId = null;
      lastPaintKey = -1;
    }
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 1) {
      // remaining finger becomes paint
      const [id, p] = [...pointers.entries()][0];
      paintPointerId = id;
      lastPaintKey = -1;
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
    draw();
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
    if (dirty) draw();
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
    select: (n) => { selected = n; renderPalette(); dirty = true; draw(); },
    paintId: (id) => {
      const fi = features.findIndex((x) => x.id === id);
      if (fi < 0 || !state || state.over) return;
      let any = false;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].fi !== fi) continue;
        if (paintCellIndex(i)) any = true;
      }
      if (any) afterPaint();
    },
    paintCell: (i) => {
      if (paintCellIndex(i)) afterPaint();
    },
    paintAt: (x, y) => paintAt(x, y),
    paintCorrectAll: () => {
      for (const c of cells) c.painted = cellTarget(c);
      dirty = true;
      draw();
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
