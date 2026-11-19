/* One Day in Kyiv — «Розфарбуй тривоги»: paint-by-numbers alert map */
(function () {
  'use strict';

  const ROUND_SEC = 20;
  const CHANGE_FRAC = 0.6;
  const COLOURS = {
    1: { fill: '#3d5e38', nameUa: 'без тривоги', nameEn: 'no alert', swatch: '#5f9a52' },
    2: { fill: '#8a7428', nameUa: 'жовта', nameEn: 'yellow', swatch: '#d4ae3a' },
    3: { fill: '#7a3030', nameUa: 'ракети', nameEn: 'missile', swatch: '#c44545' },
    4: { fill: '#3f8f9e', nameUa: 'річка', nameEn: 'river', swatch: '#5eb8c9' },
    5: { fill: '#8b939e', nameUa: 'місто', nameEn: 'town', swatch: '#b0b8c4' },
  };
  // Classic paint-by-numbers blank: light paper, not dark (dark looked like «no alert»)
  const EMPTY = '#eef1f4';
  const EMPTY_STROKE = '#1e293b';

  const T = {
    ua: {
      title: 'Розфарбуй тривоги',
      menu: '☰ Меню',
      round: (n) => `Раунд ${n}`,
      progress: (a, b) => `${a}/${b}`,
      hint: 'Обери колір і тицяй регіони. Щипок — масштаб.',
      pause: 'Пауза',
      startT: 'Розфарбуй тривоги',
      startB: 'Карта тривог навколо Києва. Зафарбуй усі регіони за номерами за ~20 с. Потім «зміна» — нові цілі на більшості карти.',
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
      hint: 'Pick a colour and tap regions. Pinch to zoom.',
      pause: 'Paused',
      startT: 'Colour the alerts',
      startB: 'Alert map around Kyiv. Paint every region by number in ~20s. Then a “change” reassigns most targets.',
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
  let features = [];
  let state = null;
  let paused = false;
  let selected = 1;
  let last = performance.now();
  let uiAcc = 0;
  let changeFlashUntil = 0;

  // pan/zoom
  const world = $('mapWorld');
  const viewport = $('mapViewport');
  let view = { x: 0, y: 0, s: 1 };
  let pointers = new Map();
  let pinch0 = null;
  let didPan = false;

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
      // after a change, wipe paint on reassigned features so they must be redone
      if (set) f.painted = 0;
    }
  }

  function correctCount() {
    let n = 0;
    for (const f of features) if (f.painted === f.target) n++;
    return n;
  }

  function allCorrect() {
    return features.every((f) => f.painted === f.target);
  }

  function newRun() {
    for (const f of features) {
      f.painted = 0;
      f.target = targetFor(f);
    }
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
    paintAll();
    ui();
  }

  function doChange() {
    const land = features.filter((f) => f.kind === 'city' || f.kind === 'raion' || f.kind === 'oblast');
    const n = Math.max(1, Math.round(land.length * CHANGE_FRAC));
    // shuffle
    for (let i = land.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = land[i]; land[i] = land[j]; land[j] = t;
    }
    const ids = land.slice(0, n).map((f) => f.id);
    assignTargets(ids);
    state.round++;
    state.scoreRounds++;
    state.timeLeft = ROUND_SEC;
    changeFlashUntil = performance.now() + (reduceMotion() ? 900 : 1600);
    $('changeBanner').textContent = T[lang].change;
    $('changeBanner').classList.add('show');
    paintAll();
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
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
  }

  function fillFor(f) {
    if (!f.painted) return EMPTY;
    return COLOURS[f.painted].fill;
  }

  function paintFeature(f) {
    const el = document.getElementById('f-' + f.id);
    if (el) {
      el.setAttribute('fill', fillFor(f));
      // Keep a clear dark outline so light blanks and painted fills both read
      if (f.kind === 'town' || f.kind === 'river') {
        el.setAttribute('stroke', EMPTY_STROKE);
      }
    }
    const num = document.getElementById('n-' + f.id);
    if (num) {
      const show = f.painted !== f.target;
      num.style.display = show ? '' : 'none';
      if (show) num.textContent = String(f.target);
    }
  }

  function paintAll() {
    for (const f of features) paintFeature(f);
  }

  function buildSvg() {
    const region = $('regionLayer');
    const river = $('riverLayer');
    const town = $('townLayer');
    const nums = $('numLayer');
    const labels = $('labelLayer');
    region.innerHTML = river.innerHTML = town.innerHTML = nums.innerHTML = labels.innerHTML = '';

    const order = { oblast: 0, raion: 1, city: 2 };
    const regions = features
      .filter((f) => f.layer === 'region')
      .slice()
      .sort((a, b) => (order[a.kind] || 0) - (order[b.kind] || 0));

    for (const f of regions) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('id', 'f-' + f.id);
      p.setAttribute('d', f.path);
      p.setAttribute('fill', EMPTY);
      p.classList.add(f.kind);
      p.dataset.id = f.id;
      region.appendChild(p);

      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('id', 'n-' + f.id);
      t.setAttribute('x', f.cx);
      t.setAttribute('y', f.cy);
      t.textContent = '1';
      if (f.kind === 'oblast') t.classList.add('small');
      nums.appendChild(t);
    }

    for (const f of features.filter((x) => x.layer === 'river')) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('id', 'f-' + f.id);
      p.setAttribute('d', f.path);
      p.setAttribute('fill', EMPTY);
      p.dataset.id = f.id;
      river.appendChild(p);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('id', 'n-' + f.id);
      t.setAttribute('x', f.cx);
      t.setAttribute('y', f.cy);
      t.classList.add('small');
      t.textContent = '4';
      nums.appendChild(t);
    }

    for (const f of features.filter((x) => x.layer === 'town')) {
      // Visible dot + larger invisible hit circle for phone taps
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('id', 'f-' + f.id);
      hit.setAttribute('cx', f.cx);
      hit.setAttribute('cy', f.cy);
      hit.setAttribute('r', f.major ? 16 : 13);
      hit.setAttribute('fill', EMPTY);
      hit.setAttribute('stroke', EMPTY_STROKE);
      hit.setAttribute('stroke-width', '2');
      hit.dataset.id = f.id;
      town.appendChild(hit);

      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('id', 'n-' + f.id);
      t.setAttribute('x', f.cx);
      t.setAttribute('y', f.cy);
      t.classList.add('small');
      t.textContent = '5';
      nums.appendChild(t);

      const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lab.setAttribute('x', f.cx);
      lab.setAttribute('y', f.cy + (f.major ? 18 : 15));
      lab.textContent = f.label;
      if (f.major) lab.classList.add('major');
      labels.appendChild(lab);
    }

    $('mapSvg').setAttribute('viewBox', mapData.viewBox.join(' '));
    $('attr').textContent = mapData.attribution || '';
  }

  function renderPalette() {
    const L = T[lang];
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
      };
      pal.appendChild(b);
    }
    void L;
  }

  function ui() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    $('title').textContent = L.title;
    $('menu').textContent = L.menu;
    $('lang').textContent = lang.toUpperCase();
    $('pauseBtn').textContent = paused ? '▶' : '⏸';
    $('pauseTxt').textContent = L.pause;
    $('hint').textContent = L.hint;
    if (!state) {
      $('timer').textContent = ROUND_SEC.toFixed(1);
      $('round').textContent = '';
      $('progress').textContent = '';
      return;
    }
    const t = Math.max(0, state.timeLeft);
    $('timer').textContent = t.toFixed(1);
    $('timer').classList.toggle('warn', t <= 8 && t > 3);
    $('timer').classList.toggle('urgent', t <= 3);
    $('round').textContent = L.round(state.round);
    $('progress').textContent = L.progress(correctCount(), features.length);
    if (changeFlashUntil && performance.now() > changeFlashUntil) {
      $('changeBanner').classList.remove('show');
      changeFlashUntil = 0;
    }
  }

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  }

  function fitView() {
    const rect = viewport.getBoundingClientRect();
    // slight zoom-in so Kyiv area is more tappable on phones
    const s = Math.max(rect.width, 1) / Math.max(rect.width, 1);
    view = { x: 0, y: 0, s: 1.15 };
    // center
    view.x = (rect.width - rect.width * view.s) / 2;
    view.y = (rect.height - rect.height * view.s) / 2;
    applyView();
  }

  function clampView() {
    const rect = viewport.getBoundingClientRect();
    const minS = 1, maxS = 4.5;
    view.s = Math.min(maxS, Math.max(minS, view.s));
    const w = rect.width * view.s, h = rect.height * view.s;
    // allow some overscroll but keep map mostly visible
    const maxX = rect.width * 0.25;
    const maxY = rect.height * 0.25;
    view.x = Math.min(maxX, Math.max(rect.width - w - maxX, view.x));
    view.y = Math.min(maxY, Math.max(rect.height - h - maxY, view.y));
  }

  function hitFeature(clientX, clientY) {
    // prefer towns/rivers via elementsFromPoint order
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (el && el.dataset && el.dataset.id) {
        return features.find((f) => f.id === el.dataset.id) || null;
      }
    }
    return null;
  }

  function paintAt(clientX, clientY) {
    if (!state || state.over || paused) return;
    const f = hitFeature(clientX, clientY);
    if (!f) return;
    f.painted = selected;
    paintFeature(f);
    ui();
    if (allCorrect()) {
      // finish early: bank leftover time as bonus, then change
      state.timeBonus += Math.floor(state.timeLeft);
      doChange();
    }
  }

  // pointers for pan/zoom + tap
  viewport.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    didPan = false;
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      pinch0 = {
        dist: Math.hypot(dx, dy) || 1,
        s: view.s,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        vx: view.x,
        vy: view.y,
      };
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0) {
      const pts = [...pointers.values()];
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = viewport.getBoundingClientRect();
      const scale = pinch0.s * (dist / pinch0.dist);
      // zoom around midpoint
      const lx = (pinch0.midX - rect.left - pinch0.vx) / pinch0.s;
      const ly = (pinch0.midY - rect.top - pinch0.vy) / pinch0.s;
      view.s = scale;
      view.x = midX - rect.left - lx * view.s;
      view.y = midY - rect.top - ly * view.s;
      clampView();
      applyView();
      didPan = true;
    } else if (pointers.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.hypot(dx, dy) > 3) didPan = true;
      if (didPan) {
        view.x += dx;
        view.y += dy;
        clampView();
        applyView();
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasPinch = pointers.size >= 2;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (!wasPinch && !didPan && pointers.size === 0) {
      paintAt(e.clientX, e.clientY);
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
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
    requestAnimationFrame(frame);
  }

  window.__coloring = {
    state: () => state && {
      round: state.round,
      timeLeft: state.timeLeft,
      over: state.over,
      correct: correctCount(),
      total: features.length,
      scoreRounds: state.scoreRounds,
      timeBonus: state.timeBonus,
    },
    select: (n) => { selected = n; renderPalette(); },
    paintId: (id) => {
      const f = features.find((x) => x.id === id);
      if (!f || !state || state.over) return;
      f.painted = selected;
      paintFeature(f);
      ui();
      if (allCorrect()) {
        state.timeBonus += Math.floor(state.timeLeft);
        doChange();
      }
    },
    paintCorrectAll: () => {
      for (const f of features) f.painted = f.target;
      paintAll();
      ui();
    },
    forceChange: () => { if (state && !state.over) doChange(); },
    forceOver: () => { if (state) gameOver(); },
    features: () => features.map((f) => ({ id: f.id, kind: f.kind, target: f.target, painted: f.painted })),
  };

  fetch('map.json')
    .then((r) => r.json())
    .then((data) => {
      mapData = data;
      features = data.features.map((f) => ({ ...f, painted: 0, target: 0 }));
      buildSvg();
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
