/* One Day in Kyiv — «Знайди річ»: hidden objects in a messy room, with blackouts */
(function () {
  'use strict';
  const W = 120, H = 170; // low-res, upscaled with pixelated rendering
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const $ = (id) => document.getElementById(id);
  const T = {
    ua: { title: 'Знайди річ', menu: '☰ Меню', find: 'Знайди:', time: '⏱', found: 'знайдено', hint: 'Тицяй на речі в бардаку', dark: '🔦 Світло вимкнули! Шукай ліхтариком', pause: 'Пауза',
      startT: 'Знайди річ', startB: 'У кімнаті бардак. Знайди 6 речей, поки знову не вимкнули світло… хоча вимкнуть.', go: 'Шукати', win: 'Все знайдено! 🎉', winB: (t, m) => `Час: ${t}. Промахів: ${m}.`, again: 'Ще раз' },
    en: { title: 'Find it', menu: '☰ Menu', find: 'Find:', time: '⏱', found: 'found', hint: 'Tap the items in the mess', dark: '🔦 Blackout! Search with the flashlight', pause: 'Paused',
      startT: 'Find it', startB: 'The room is a mess. Find 6 things before the power goes out again… it will.', go: 'Search', win: 'Found everything! 🎉', winB: (t, m) => `Time: ${t}. Misses: ${m}.`, again: 'Play again' },
  };
  const ITEMS = [
    { id: 'pled', ua: 'плед', en: 'blanket', w: 22, h: 12 },
    { id: 'pb', ua: 'павербанк', en: 'power bank', w: 9, h: 6 },
    { id: 'garl', ua: 'гірлянда', en: 'fairy lights', w: 20, h: 7 },
    { id: 'bat', ua: 'батарейки', en: 'batteries', w: 8, h: 6 },
    { id: 'pil', ua: 'подушка', en: 'pillow', w: 15, h: 9 },
    { id: 'plug', ua: 'зарядка для павербанка', en: 'power bank charger', w: 8, h: 7 },
  ];
  let lang = localStorage.getItem('findit-lang') || 'ua';
  let seed = 1, rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let st = null, paused = false, ptr = { x: W / 2, y: H / 2, on: false }, last = performance.now();

  function newGame() {
    seed = 1 + ((Math.random() * 1e9) | 0);
    const placed = [];
    const spots = [];
    for (const it of ITEMS) {
      let x, y, k = 0;
      do { x = 4 + rnd() * (W - it.w - 8); y = 60 + rnd() * (H - it.h - 66); k++; }
      while (k < 200 && placed.some((p) => x < p.x + p.w + 4 && x + it.w + 4 > p.x && y < p.y + p.h + 4 && y + it.h + 4 > p.y));
      placed.push({ ...it, x: Math.round(x), y: Math.round(y), got: false, flash: 0 });
    }
    // clutter: socks, books, boxes, clothes; some partly cover items (never more than ~half)
    const clutter = [];
    const COLS = ['#7c3aed', '#be123c', '#0e7490', '#a16207', '#4d7c0f', '#9ca3af', '#c2410c', '#1d4ed8', '#f9a8d4', '#57534e'];
    for (let i = 0; i < 55; i++) {
      const w = 5 + rnd() * 16, h = 3 + rnd() * 9;
      clutter.push({ x: rnd() * (W - w), y: 52 + rnd() * (H - h - 54), w, h, c: COLS[(rnd() * COLS.length) | 0], t: (rnd() * 3) | 0 });
    }
    for (const p of placed) { // one cover piece per item over ~40% of it
      const side = rnd() < 0.5;
      clutter.push({ x: p.x + (side ? p.w * 0.55 : -p.w * 0.1), y: p.y + (rnd() < 0.5 ? -2 : p.h * 0.45), w: p.w * 0.55, h: p.h * 0.6, c: COLS[(rnd() * COLS.length) | 0], t: 1, cover: true });
    }
    st = { items: placed, clutter, t: 0, misses: 0, over: false, dark: 0, nextDark: 12 + Math.random() * 8, started: true };
  }

  // ---- drawing ----
  function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function room() {
    px(0, 0, W, 52, '#3b3f5c'); // wall
    for (let i = 0; i < 6; i++) px(8 + i * 19, 6 + (i % 2) * 3, 1, 1, '#4b5072'); // wall specks (static)
    px(78, 8, 30, 22, '#0f172a'); px(79, 9, 28, 20, '#1e3a5f'); px(92, 9, 1, 20, '#0f172a'); px(79, 18, 28, 1, '#0f172a'); // window, night
    px(84, 12, 2, 2, '#fde68a'); // a star / far window
    px(10, 10, 22, 14, '#6b4f3a'); px(11, 11, 20, 12, '#d6b48a'); // poster
    px(0, 52, W, H - 52, '#5b4636'); // floor
    for (let y = 60; y < H; y += 14) px(0, y, W, 1, '#4e3b2d'); // plank seams (static)
    px(4, 40, 44, 22, '#334155'); px(4, 36, 44, 6, '#475569'); // bed
    px(70, 44, 44, 12, '#7c2d12'); px(72, 56, 3, 8, '#451a03'); px(109, 56, 3, 8, '#451a03'); // table
    px(56, 22, 14, 30, '#78350f'); for (let i = 0; i < 4; i++) px(57, 25 + i * 7, 12, 1, '#451a03'); // shelf
  }
  function drawItem(p) {
    const { x, y, w, h } = p;
    switch (p.id) {
      case 'pled': px(x, y, w, h, '#b91c1c'); for (let i = 0; i < w; i += 4) px(x + i, y, 2, h, '#f59e0b'); px(x, y + h - 2, w, 2, '#7f1d1d'); break;
      case 'pb': px(x, y, w, h, '#111827'); px(x + 1, y + 1, w - 2, h - 2, '#374151'); px(x + 2, y + 2, 1, 1, '#22d3ee'); px(x + 4, y + 2, 1, 1, '#22d3ee'); break;
      case 'garl': for (let i = 0; i < w; i++) px(x + i, y + 3 + Math.round(Math.sin(i / 2) * 2), 1, 1, '#166534'); ['#fde047', '#f472b6', '#60a5fa', '#4ade80', '#fb923c'].forEach((c, i) => px(x + 1 + i * 4, y + 2 + (i % 2) * 2, 2, 2, c)); break;
      case 'bat': px(x, y, 3, h, '#a16207'); px(x, y, 3, 2, '#e5e7eb'); px(x + 4, y, 3, h, '#a16207'); px(x + 4, y, 3, 2, '#e5e7eb'); break;
      case 'pil': px(x, y, w, h, '#e0e7ff'); px(x + 1, y + 1, w - 2, h - 2, '#c7d2fe'); px(x + w / 2 - 1, y + h / 2 - 1, 2, 2, '#a5b4fc'); break;
      case 'plug': px(x + 2, y, 4, 4, '#f8fafc'); px(x + 3, y + 4, 1, 3, '#f8fafc'); px(x + 2, y - 1, 1, 1, '#cbd5e1'); px(x + 5, y - 1, 1, 1, '#cbd5e1'); px(x, y + 6, 8, 1, '#64748b'); break;
    }
  }
  function drawClutter(c) {
    if (c.t === 0) { px(c.x, c.y, c.w, c.h, c.c); px(c.x, c.y, c.w, 1, '#00000033'); } // box/book
    else if (c.t === 1) { px(c.x, c.y, c.w, c.h, c.c); px(c.x + 1, c.y + c.h - 1, c.w - 2, 1, '#0000004d'); } // clothes
    else { px(c.x, c.y, c.w * 0.4, c.h, c.c); px(c.x, c.y + c.h - 2, c.w * 0.6, 2, c.c); } // sock-ish
  }
  function draw() {
    room();
    for (const c of st.clutter) if (!c.cover && c.y < 90) drawClutter(c);
    for (const p of st.items) if (!p.got) drawItem(p);
    for (const c of st.clutter) if (c.cover || c.y >= 90) drawClutter(c);
    for (const p of st.items) if (p.got && p.flash > 0) { ctx.strokeStyle = `rgba(74,222,128,${p.flash})`; ctx.lineWidth = 1; ctx.strokeRect(p.x - 1.5, p.y - 1.5, p.w + 3, p.h + 3); }
    if (st.dark > 0) { // blackout: darkness everywhere except a flashlight circle
      ctx.save(); ctx.fillStyle = 'rgba(2,4,10,0.97)'; ctx.beginPath(); ctx.rect(0, 0, W, H);
      ctx.arc(ptr.x, ptr.y, 16, 0, Math.PI * 2, true); ctx.fill('evenodd');
      const g = ctx.createRadialGradient(ptr.x, ptr.y, 6, ptr.x, ptr.y, 16); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(2,4,10,0.85)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  // ---- UI ----
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function ui() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    $('title').textContent = L.title; $('menu').textContent = L.menu; $('lang').textContent = lang.toUpperCase();
    $('pauseBtn').textContent = paused ? '▶' : '⏸'; $('pauseTxt').textContent = L.pause;
    $('timer').textContent = L.time + ' ' + fmt(st ? st.t : 0);
    const n = st ? st.items.filter((p) => p.got).length : 0; $('score').textContent = `${n}/6 ${L.found}`;
    $('list').innerHTML = ITEMS.map((it, i) => `<div class="${st && st.items[i].got ? 'got' : ''}">${st && st.items[i].got ? '✅' : '▫️'} ${it[lang]}</div>`).join('');
    $('hint').textContent = st && st.dark > 0 ? L.dark : L.hint;
  }
  function overlay(t, b, btn) {
    $('oTitle').textContent = t;
    $('oBody').textContent = b;
    $('oBtn').textContent = btn;
    $('overlay').classList.remove('hidden');
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(!!(st && st.over));
  }
  function toCanvas(e) { const r = cv.getBoundingClientRect(); // canvas is object-fit:contain
    const s = Math.min(r.width / W, r.height / H), ox = r.left + (r.width - W * s) / 2, oy = r.top + (r.height - H * s) / 2;
    return { x: (e.clientX - ox) / s, y: (e.clientY - oy) / s }; }
  function tap(x, y) {
    if (!st || st.over || paused) return false;
    const pad = 2;
    const hit = st.items.find((p) => !p.got && x >= p.x - pad && x <= p.x + p.w + pad && y >= p.y - pad && y <= p.y + p.h + pad);
    if (hit) { hit.got = true; hit.flash = 1; if (st.items.every((p) => p.got)) { st.over = true; st.dark = 0; setTimeout(() => overlay(T[lang].win, T[lang].winB(fmt(st.t), st.misses), T[lang].again), 500); } }
    else st.misses++;
    ui(); return !!hit;
  }
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); const p = toCanvas(e); ptr = { ...p, on: true }; if (st && st.dark > 0) return; tap(p.x, p.y); });
  cv.addEventListener('pointermove', (e) => { const p = toCanvas(e); ptr.x = p.x; ptr.y = p.y; });
  cv.addEventListener('pointerup', (e) => { if (st && st.dark > 0) { const p = toCanvas(e); tap(p.x, p.y); } }); // in the dark: aim the light, release to grab
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  $('oBtn').onclick = () => { $('overlay').classList.add('hidden'); newGame(); paused = false; ui(); };
  $('lang').onclick = () => { lang = lang === 'ua' ? 'en' : 'ua'; localStorage.setItem('findit-lang', lang); ui();
    if (!$('overlay').classList.contains('hidden')) st && st.over ? overlay(T[lang].win, T[lang].winB(fmt(st.t), st.misses), T[lang].again) : overlay(T[lang].startT, T[lang].startB, T[lang].go); };
  $('pauseBtn').onclick = () => { if (!st || st.over) return; paused = !paused; $('pause').classList.toggle('hidden', !paused); ui(); };
  $('pause').onclick = () => $('pauseBtn').onclick();
  let uiT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st && !st.over && !paused) {
      st.t += dt;
      if (st.dark > 0) { st.dark -= dt; if (st.dark <= 0) { st.nextDark = 14 + Math.random() * 10; ui(); } }
      else if ((st.nextDark -= dt) <= 0) { st.dark = 7 + Math.random() * 4; ui(); }
      for (const p of st.items) if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 0.8);
      if ((uiT += dt) > 0.5) { uiT = 0; ui(); }
    }
    if (st) draw(); else { room(); }
    requestAnimationFrame(frame);
  }
  window.__findit = {
    state: () => st && { t: st.t, dark: st.dark, over: st.over, misses: st.misses, found: st.items.filter((p) => p.got).length, items: st.items.map((p) => ({ id: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2, got: p.got })) },
    tap, blackout: (s) => { st.dark = s || 8; ui(); }, setPtr: (x, y) => { ptr.x = x; ptr.y = y; }, W, H,
  };
  ui(); overlay(T[lang].startT, T[lang].startB, T[lang].go);
  requestAnimationFrame(frame);
})();
