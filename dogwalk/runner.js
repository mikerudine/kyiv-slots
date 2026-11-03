/* One Day in Kyiv — dog walk pseudo-3D courtyard runner (v4) */
(function () {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  // Flatter / more obtuse camera: higher vantage, less sky, softer foreshortening
  const CX = W / 2;
  const HORIZON = Math.floor(H * 0.22);
  const FOCAL = 300;
  const CAM_H = 9.2;
  const Z_DOG = 5.8;       // only visible character
  const Z_NEAR = 4.2;
  const Z_FAR = 78;
  const LANE_X = [-1.25, 0, 1.25];
  const PATH_HALF = 2.05;  // courtyard path half-width (no car lanes)

  function project(wx, z) {
    const zz = Math.max(0.7, z);
    const scale = FOCAL / zz;
    return {
      x: CX + wx * scale,
      y: HORIZON + (CAM_H * FOCAL) / zz,
      s: scale,
    };
  }
  function pathEdgeX(side, z) {
    return project(side * PATH_HALF, z).x;
  }
  function lerpLane(f) {
    const a = Math.max(0, Math.min(1, Math.floor(f)));
    const b = Math.min(2, a + 1);
    return LANE_X[a] + (LANE_X[b] - LANE_X[a]) * (f - a);
  }

  const I18N = {
    ua: {
      title: 'Прогулянка з собакою',
      hint: 'Свайп ← → · змахни тривоги',
      score: (d, s) => `${d | 0} м · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Прогулянка',
      overlayBody: 'Веди пса двором: калюжі, злі пси, генератори. Світло може зникнути — лишається ореол ліхтарика. Пуші тривоги змахуй, інакше забʼють екран.',
      start: 'Старт',
      again: 'Ще раз',
      overTitle: 'Кінець прогулянки',
      overBody: (d, s) => `Дистанція ${d | 0} м · рахунок ${s | 0}`,
      notifApp: 'Повітряна тривога',
      notifMsg: [
        'Повітряна тривога в м. Київ. Прямуйте в укриття!',
        'УВАГА! Відбій ще не оголошено. Залишайтесь в укритті.',
        'Загроза БпЛА. Прямуйте в укриття!',
        'Повітряна тривога. Не ігноруйте сигнал.',
      ],
      swipeHint: 'змахни / клік',
      blackout: '💡 Світла нема',
      growl: 'ГРРР!',
    },
    en: {
      title: 'Walking the dog',
      hint: 'Swipe ← → · dismiss alerts',
      score: (d, s) => `${d | 0} m · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Dog walk',
      overlayBody: 'Guide the dog through the yard: puddles, angry dogs, rattling generators. Lights may cut out — only a flashlight halo remains. Swipe alert pushes away.',
      start: 'Start',
      again: 'Again',
      overTitle: 'Walk over',
      overBody: (d, s) => `Distance ${d | 0} m · score ${s | 0}`,
      notifApp: 'Air-raid alert',
      notifMsg: [
        'Air-raid alert in Kyiv. Proceed to shelter!',
        'WARNING! All-clear not yet declared. Stay sheltered.',
        'UAV threat. Proceed to shelter!',
        'Air-raid alert. Do not ignore the signal.',
      ],
      swipeHint: 'swipe / click',
      blackout: '💡 Blackout',
      growl: 'GRRR!',
    },
  };

  let lang = localStorage.getItem('dogwalk-runner-lang') || 'ua';
  const t = () => I18N[lang];

  function applyLang() {
    const L = t();
    document.getElementById('tTitle').textContent = L.title;
    document.getElementById('hint').textContent = L.hint;
    document.getElementById('lang').textContent = lang.toUpperCase();
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    if (!running) {
      document.getElementById('oTitle').textContent = dead ? L.overTitle : L.overlayTitle;
      document.getElementById('oBody').textContent = dead ? L.overBody(distance, score) : L.overlayBody;
      document.getElementById('oBtn').textContent = dead ? L.again : L.start;
    }
    document.querySelectorAll('.notif').forEach((el) => {
      const idx = +el.dataset.msgIndex || 0;
      el.querySelector('.app').textContent = L.notifApp;
      el.querySelector('.msg').textContent = L.notifMsg[idx % L.notifMsg.length];
      el.querySelector('.swipe').textContent = L.swipeHint;
    });
  }

  document.getElementById('lang').addEventListener('click', () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('dogwalk-runner-lang', lang);
    applyLang();
  });

  const LANES = 3;
  let lane = 1, laneF = 1, dogLaneF = 1;
  // Much slower walk pace
  let speed = 9;
  const SPEED0 = 9, SPEED_MAX = 20;
  let distance = 0, score = 0, lives = 3;
  let running = false, dead = false, invuln = 0, shake = 0;
  let spawnAcc = 0, notifAcc = 0, notifRate = 3.4;
  let obstacles = [], scenery = [], pathPhase = 0;
  let blackout = false, blackoutTimer = 0, nextBlackoutIn = 14;
  let time = 0;

  const notifRoot = document.getElementById('notifs');
  let notifs = [];

  function resetGame() {
    lane = 1; laneF = 1; dogLaneF = 1;
    speed = SPEED0; distance = 0; score = 0; lives = 3;
    invuln = 0; spawnAcc = 0; notifAcc = 0; notifRate = 3.4;
    obstacles = []; pathPhase = 0; shake = 0; dead = false; time = 0;
    blackout = false; blackoutTimer = 0; nextBlackoutIn = 10 + Math.random() * 8;
    seedScenery();
    clearNotifs();
  }

  function clearNotifs() {
    notifs.forEach((n) => n.el.remove());
    notifs = [];
  }

  function gameOver() {
    running = false; dead = true; applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function hit() {
    if (invuln > 0) return;
    lives -= 1; invuln = 1.2; shake = 12;
    if (lives <= 0) gameOver();
  }

  function seedScenery() {
    scenery = [];
    const kinds = ['khrush', 'garage', 'tree', 'lamp', 'hedge'];
    for (let i = 0; i < 30; i++) {
      const z = 9 + i * 2.5 + Math.random();
      scenery.push({ kind: kinds[i % kinds.length], side: i % 2 === 0 ? -1 : 1, z, variant: (Math.random() * 3) | 0 });
      if (Math.random() < 0.4) {
        scenery.push({ kind: kinds[(i + 2) % kinds.length], side: i % 2 === 0 ? 1 : -1, z: z + 0.9, variant: (Math.random() * 3) | 0 });
      }
    }
  }

  const CAT_COLORS = [
    { body: '#f97316', dark: '#c2410c' }, // ginger
    { body: '#78716c', dark: '#44403c' }, // grey
    { body: '#1c1917', dark: '#0a0a0a' }, // black
    { body: '#e7e5e4', dark: '#a8a29e' }, // white/cream
    { body: '#b45309', dark: '#78350f' }, // brown tabby
  ];

  function laneFromX(x) {
    let best = 0, bestD = 1e9;
    for (let i = 0; i < LANE_X.length; i++) {
      const d = Math.abs(LANE_X[i] - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function spawnCat() {
    const dir = Math.random() < 0.5 ? 1 : -1; // +1 L→R, -1 R→L
    const z = 12 + Math.random() * 36;
    const x = dir > 0 ? -(PATH_HALF + 1.1) : (PATH_HALF + 1.1);
    const pal = CAT_COLORS[(Math.random() * CAT_COLORS.length) | 0];
    obstacles.push({
      kind: 'cat',
      lane: laneFromX(0),
      x, z, dir,
      crossSpeed: 2.4 + Math.random() * 1.8,
      color: pal.body,
      colorDark: pal.dark,
      phase: Math.random() * Math.PI * 2,
      hit: false,
      rush: 1,
    });
  }

  function spawnObstacle() {
    const r = Math.random();
    let kind = 'puddle';
    if (r < 0.26) kind = 'puddle';
    else if (r < 0.52) kind = 'dog';
    else if (r < 0.78) kind = 'cat';
    else kind = 'generator';
    if (kind === 'cat') { spawnCat(); return; }
    let l = (Math.random() * LANES) | 0;
    const near = obstacles.filter((o) => o.z > Z_FAR - 14 && o.kind !== 'cat');
    if (near.some((o) => o.lane === l && Math.abs(o.z - Z_FAR) < 7)) l = (l + 1) % LANES;
    obstacles.push({
      kind, lane: l, z: Z_FAR + Math.random() * 5, hit: false,
      phase: Math.random() * Math.PI * 2,
      bob: 0,
      // angry dogs charge toward camera faster than world scroll
      rush: kind === 'dog' ? (1.55 + Math.random() * 0.55) : 1,
      growlT: 0,
    });
  }

  function spawnNotif() {
    if (notifs.length >= 8) return;
    const L = t();
    const el = document.createElement('div');
    el.className = 'notif';
    const msgIndex = (Math.random() * L.notifMsg.length) | 0;
    el.dataset.msgIndex = String(msgIndex);
    el.innerHTML = `<div class="icon">🚨</div><div class="body"><div class="app"></div><div class="msg"></div><div class="swipe"></div></div>`;
    el.querySelector('.app').textContent = L.notifApp;
    el.querySelector('.msg').textContent = L.notifMsg[msgIndex];
    el.querySelector('.swipe').textContent = L.swipeHint;
    const wrap = document.getElementById('wrap').getBoundingClientRect();
    let top = 56 + Math.random() * Math.max(40, wrap.height * 0.55);
    const overlap = notifs.filter((n) => Math.abs(parseFloat(n.el.style.top) - top) < 54);
    if (overlap.length) top += overlap.length * 18;
    el.style.top = top + 'px';
    el.style.left = (4 + Math.random() * 4) + '%';
    notifRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const state = { el, startX: 0, dx: 0, dragging: false };
    notifs.push(state);
    const dismiss = () => {
      el.style.transform = 'translateX(120%)';
      setTimeout(() => { el.remove(); notifs = notifs.filter((n) => n !== state); score += 25; }, 160);
    };
    const onDown = (e) => {
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      state.dragging = true; state.startX = p.clientX; state.dx = 0;
      el.classList.add('swiping'); el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!state.dragging) return;
      const p = e.touches ? e.touches[0] : e;
      state.dx = p.clientX - state.startX;
      el.style.transform = `translateX(${state.dx}px)`;
    };
    const onUp = () => {
      if (!state.dragging) return;
      state.dragging = false; el.classList.remove('swiping');
      if (Math.abs(state.dx) > 64) dismiss();
      else { el.style.transform = 'translateX(0)'; el.classList.add('show'); }
    };
    el.addEventListener('click', () => { if (Math.abs(state.dx) < 8) dismiss(); });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function tryLane(dir) {
    if (!running) return;
    lane = Math.max(0, Math.min(LANES - 1, lane + dir));
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { tryLane(-1); e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { tryLane(1); e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter') && !running) document.getElementById('oBtn').click();
  });

  let swipeX0 = 0, swipeY0 = 0, swipeArmed = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    swipeArmed = true; swipeX0 = e.clientX; swipeY0 = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!swipeArmed) return;
    swipeArmed = false;
    const dx = e.clientX - swipeX0, dy = e.clientY - swipeY0;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) tryLane(dx < 0 ? -1 : 1);
  });
  canvas.addEventListener('pointercancel', () => { swipeArmed = false; });

  document.getElementById('oBtn').addEventListener('click', () => {
    resetGame(); running = true;
    document.getElementById('overlay').classList.add('hidden');
    applyLang();
  });

  function drawSky() {
    if (blackout) {
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, W, HORIZON + 20);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 24);
    g.addColorStop(0, '#0b1224');
    g.addColorStop(0.6, '#334155');
    g.addColorStop(1, '#94a3b8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 30);
  }

  function drawPath() {
    // Courtyard path / sidewalk — no painted car lanes
    for (let y = HORIZON; y < H + 4; y++) {
      const row = y - HORIZON + 1;
      const z = (CAM_H * FOCAL) / row;
      if (z < Z_NEAR - 0.6 || z > Z_FAR + 10) continue;
      const left = pathEdgeX(-1, z);
      const right = pathEdgeX(1, z);
      // dirt yard shoulders
      ctx.fillStyle = blackout ? '#0a0a0a' : '#3f3a36';
      ctx.fillRect(0, y, Math.max(0, left), 1);
      ctx.fillRect(right, y, Math.max(0, W - right), 1);
      // soft tile / packed earth path
      const tile = (((z * 1.6 + pathPhase * 0.4) | 0) % 3);
      if (blackout) ctx.fillStyle = tile === 0 ? '#1c1917' : '#171412';
      else ctx.fillStyle = tile === 0 ? '#a8a29e' : tile === 1 ? '#78716c' : '#57534e';
      ctx.fillRect(left, y, Math.max(1, right - left), 1);
      // subtle path edge (curb stone, not hazard stripes)
      const edge = Math.max(1.5, (right - left) * 0.018);
      ctx.fillStyle = blackout ? '#292524' : '#d6d3d1';
      ctx.fillRect(left, y, edge, 1);
      ctx.fillRect(right - edge, y, edge, 1);
    }
  }

  function drawSceneryItem(s) {
    if (s.z < Z_NEAR || s.z > Z_FAR) return;
    const wx = s.side * (PATH_HALF + 0.6 + (s.kind === 'tree' ? 0.2 : 0));
    const p = project(wx, s.z);
    const sc = p.s, baseY = p.y;
    const dim = blackout ? 0.25 : 1;
    const mul = (c) => {
      // crude darken hex-ish via alpha overlay later; use darker fills in blackout
      return c;
    };
    if (s.kind === 'khrush') {
      const bw = sc * 1.15, bh = sc * 1.7;
      ctx.fillStyle = blackout ? '#1c1410' : (s.variant === 0 ? '#b45309' : s.variant === 1 ? '#a8a29e' : '#ca8a04');
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      ctx.fillStyle = blackout ? '#0f172a' : '#1e3a5f';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const lit = blackout && Math.random() > 0.92; // rare window glow — avoid flicker: use variant
        const on = blackout ? ((s.variant + r + c) % 5 === 0) : true;
        if (!blackout || on) {
          ctx.fillStyle = blackout ? '#fbbf2444' : '#1e3a5f';
          if (!blackout) ctx.fillStyle = '#1e3a5f';
          ctx.fillRect(p.x - bw / 2 + bw * (0.12 + c * 0.28), baseY - bh + bh * (0.12 + r * 0.2), bw * 0.14, bh * 0.1);
        }
      }
    } else if (s.kind === 'garage') {
      const bw = sc * 0.95, bh = sc * 0.65;
      ctx.fillStyle = blackout ? '#142014' : '#3f6212';
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      ctx.fillStyle = blackout ? '#0a120a' : '#14532d';
      ctx.fillRect(p.x - bw * 0.35, baseY - bh * 0.75, bw * 0.7, bh * 0.55);
    } else if (s.kind === 'tree') {
      ctx.fillStyle = blackout ? '#2a1810' : '#78350f';
      ctx.fillRect(p.x - sc * 0.08, baseY - sc * 0.65, sc * 0.16, sc * 0.65);
      ctx.fillStyle = blackout ? '#0f2a14' : '#166534';
      ctx.beginPath(); ctx.arc(p.x, baseY - sc * 0.8, sc * 0.45, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'lamp') {
      ctx.fillStyle = blackout ? '#1e293b' : '#475569';
      ctx.fillRect(p.x - sc * 0.05, baseY - sc * 1.45, sc * 0.1, sc * 1.45);
      // lamps dead in blackout (flashlight is player)
      ctx.fillStyle = blackout ? '#334155' : '#fde68a';
      ctx.beginPath(); ctx.arc(p.x, baseY - sc * 1.5, sc * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'hedge') {
      ctx.fillStyle = blackout ? '#0c1f12' : '#14532d';
      ctx.fillRect(p.x - sc * 0.55, baseY - sc * 0.42, sc * 1.1, sc * 0.42);
    }
  }

  function drawPuddle(laneIdx, z) {
    const p = project(LANE_X[laneIdx], z);
    const w = p.s * 0.9, h = p.s * 0.28;
    ctx.fillStyle = blackout ? '#0c1a2a' : '#1e3a5f';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2); ctx.fill();
    if (!blackout) {
      ctx.fillStyle = '#93c5fd66';
      ctx.beginPath(); ctx.ellipse(p.x - w * 0.2, p.y - h * 0.2, w * 0.22, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawAngryDog(o) {
    const p = project(LANE_X[o.lane], o.z);
    const run = Math.sin(time * 16 + o.phase);
    const s = p.s * (0.62 + Math.max(0, (28 - o.z) * 0.004));
    const y = p.y + Math.abs(run) * s * 0.08; // gallop bob
    const lean = run * s * 0.05;

    // ground shadow
    ctx.fillStyle = '#00000066';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.14, s * 0.55, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // body (charging toward camera)
    ctx.fillStyle = blackout ? '#2a0a0a' : '#450a0a';
    ctx.fillRect(p.x - s * 0.5 + lean, y - s * 0.75, s * 1.0, s * 0.6);
    // shoulders / head
    ctx.fillStyle = blackout ? '#3f1010' : '#7f1d1d';
    ctx.fillRect(p.x - s * 0.42 + lean, y - s * 1.2, s * 0.84, s * 0.55);
    // ears pinned back
    ctx.fillStyle = '#1c0505';
    ctx.fillRect(p.x - s * 0.48 + lean, y - s * 1.4, s * 0.22, s * 0.28);
    ctx.fillRect(p.x + s * 0.26 + lean, y - s * 1.4, s * 0.22, s * 0.28);
    // running legs
    const leg = run * s * 0.18;
    ctx.fillStyle = blackout ? '#1a0505' : '#3f0a0a';
    ctx.fillRect(p.x - s * 0.4 + lean - leg, y - s * 0.2, s * 0.18, s * 0.4);
    ctx.fillRect(p.x - s * 0.1 + lean + leg, y - s * 0.2, s * 0.18, s * 0.4);
    ctx.fillRect(p.x + s * 0.15 + lean - leg * 0.7, y - s * 0.15, s * 0.18, s * 0.38);
    ctx.fillRect(p.x + s * 0.38 + lean + leg * 0.7, y - s * 0.15, s * 0.18, s * 0.38);

    // snout + bared teeth
    ctx.fillStyle = blackout ? '#4a1515' : '#9f1239';
    ctx.fillRect(p.x - s * 0.28 + lean, y - s * 0.85, s * 0.56, s * 0.28);
    ctx.fillStyle = '#fff7ed';
    const teethY = y - s * 0.72;
    for (let i = 0; i < 5; i++) {
      const tx = p.x - s * 0.2 + i * s * 0.1 + lean;
      ctx.fillRect(tx, teethY, s * 0.06, s * 0.12);
    }
    // drool / snarl line
    ctx.fillStyle = '#fecaca';
    ctx.fillRect(p.x - s * 0.06 + lean, y - s * 0.58, s * 0.08, s * 0.1);

    // glowing eyes (also redrawn after blackout overlay)
    drawDogEyes(p.x + lean, y - s * 1.02, s);

    // growl burst when close
    if (o.z < 22) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 20 + o.phase);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (22 - o.z) / 10) * pulse;
      ctx.fillStyle = '#fef2f2';
      ctx.font = `bold ${Math.max(10, s * 0.55)}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t().growl, p.x + lean, y - s * 1.55);
      ctx.restore();
      // local screen rattle when very close
      if (o.z < 12 && shake < 6) shake = Math.max(shake, 4 + (12 - o.z) * 0.35);
    }

    // stash eye screen pos for post-blackout pass
    o._eye = { x: p.x + lean, y: y - s * 1.02, s };
  }

  function drawDogEyes(x, y, s) {
    const eyeR = Math.max(1.5, s * 0.11);
    const gap = s * 0.18;
    const flicker = 0.85 + 0.15 * Math.sin(time * 22);
    // bloom
    for (const side of [-1, 1]) {
      const ex = x + side * gap;
      const bloom = ctx.createRadialGradient(ex, y, 0, ex, y, eyeR * 3.2);
      bloom.addColorStop(0, `rgba(250, 204, 21, ${0.95 * flicker})`);
      bloom.addColorStop(0.35, `rgba(239, 68, 68, ${0.55 * flicker})`);
      bloom.addColorStop(1, 'rgba(127, 29, 29, 0)');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(ex, y, eyeR * 3.2, 0, Math.PI * 2);
      ctx.fill();
      // hot core
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(ex, y, eyeR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ex, y, eyeR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAngryDogEyesAboveDark() {
    // Eyes pierce the blackout — drawn AFTER flashlight overlay
    for (const o of obstacles) {
      if (o.kind !== 'dog' || !o._eye) continue;
      const { x, y, s } = o._eye;
      drawDogEyes(x, y, s);
      // far-away: even a tiny twin ember when body is almost invisible
      if (blackout && o.z > 30) {
        const p = project(LANE_X[o.lane], o.z);
        drawDogEyes(p.x, p.y - p.s * 0.55, Math.max(p.s * 0.35, 4));
      }
    }
    // cat green glints (smaller)
    for (const o of obstacles) {
      if (o.kind !== 'cat' || !o._eye) continue;
      drawCatEyes(o._eye.x, o._eye.y, o._eye.s, o.dir || 1);
    }
  }

  function drawCatEyes(x, y, s, dir) {
    const eyeR = Math.max(1.2, s * 0.08);
    const gap = s * 0.12;
    const flicker = 0.8 + 0.2 * Math.sin(time * 26);
    // face toward run direction: eyes slightly forward on head
    const face = x + dir * s * 0.15;
    for (const side of [-1, 1]) {
      const ex = face + side * gap;
      const bloom = ctx.createRadialGradient(ex, y, 0, ex, y, eyeR * 2.6);
      bloom.addColorStop(0, `rgba(190, 242, 100, ${0.95 * flicker})`);
      bloom.addColorStop(0.4, `rgba(74, 222, 128, ${0.5 * flicker})`);
      bloom.addColorStop(1, 'rgba(20, 83, 45, 0)');
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(ex, y, eyeR * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ecfccb';
      ctx.beginPath(); ctx.arc(ex, y, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#166534';
      ctx.beginPath(); ctx.arc(ex, y, eyeR * 0.25, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCat(o) {
    const p = project(o.x, o.z);
    const run = Math.sin(time * 22 + o.phase);
    const s = p.s * 0.42;
    const dir = o.dir || 1;
    const y = p.y + Math.abs(run) * s * 0.06;
    const x = p.x;

    // shadow
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(x, p.y + s * 0.08, s * 0.55, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1); // face run direction

    // body
    ctx.fillStyle = blackout ? o.colorDark : o.color;
    ctx.fillRect(-s * 0.55, -s * 0.45, s * 1.0, s * 0.4);
    // head
    ctx.fillRect(s * 0.25, -s * 0.75, s * 0.45, s * 0.4);
    // ears
    ctx.fillStyle = blackout ? '#292524' : o.colorDark;
    ctx.fillRect(s * 0.28, -s * 0.95, s * 0.14, s * 0.22);
    ctx.fillRect(s * 0.5, -s * 0.95, s * 0.14, s * 0.22);
    // legs (gallop)
    const leg = run * s * 0.14;
    ctx.fillStyle = blackout ? o.colorDark : o.color;
    ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.14, s * 0.28 + leg);
    ctx.fillRect(-s * 0.15, -s * 0.1, s * 0.14, s * 0.28 - leg);
    ctx.fillRect(s * 0.1, -s * 0.08, s * 0.14, s * 0.26 - leg * 0.6);
    ctx.fillRect(s * 0.35, -s * 0.08, s * 0.14, s * 0.26 + leg * 0.6);
    // tail arc
    ctx.fillRect(-s * 0.75, -s * 0.55 + run * s * 0.08, s * 0.28, s * 0.1);
    // white tip / belly hint
    if (!blackout) {
      ctx.fillStyle = '#fafaf9aa';
      ctx.fillRect(-s * 0.2, -s * 0.25, s * 0.35, s * 0.12);
    }

    ctx.restore();

    // eyes stash in screen space (after restore)
    o._eye = { x: x + dir * s * 0.4, y: y - s * 0.55, s };
    // draw eyes in lit scene too (subtle); bloom pass reinforces in blackout
    if (!blackout) drawCatEyes(o._eye.x, o._eye.y, s, dir);

    o.lane = laneFromX(o.x);
  }

  function drawGenerator(o) {
    const p = project(LANE_X[o.lane], o.z);
    const s = p.s * 0.55;
    const bob = Math.sin(time * 18 + o.phase) * s * 0.12;
    const rattle = Math.sin(time * 40 + o.phase * 2) * s * 0.04;
    const x = p.x + rattle, y = p.y - bob;
    // shadow
    ctx.fillStyle = '#00000066';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.05, s * 0.5, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = blackout ? '#3f3f12' : '#a3e635';
    ctx.fillRect(x - s * 0.55, y - s * 0.85, s * 1.1, s * 0.75);
    ctx.fillStyle = blackout ? '#27270a' : '#65a30d';
    ctx.fillRect(x - s * 0.45, y - s * 0.55, s * 0.9, s * 0.35);
    // frame
    ctx.strokeStyle = blackout ? '#52525b' : '#1c1917';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.strokeRect(x - s * 0.55, y - s * 0.85, s * 1.1, s * 0.75);
    // exhaust puffs
    const puff = (Math.sin(time * 6 + o.phase) + 1) * 0.5;
    ctx.fillStyle = blackout ? '#64748b88' : '#94a3b888';
    ctx.beginPath();
    ctx.arc(x + s * 0.35, y - s * (1.0 + puff * 0.35), s * (0.12 + puff * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + s * 0.5, y - s * (1.25 + puff * 0.5), s * (0.08 + puff * 0.08), 0, Math.PI * 2);
    ctx.fill();
    // status LED
    ctx.fillStyle = (Math.floor(time * 8 + o.phase) % 2) ? '#ef4444' : '#fbbf24';
    ctx.fillRect(x + s * 0.25, y - s * 0.75, s * 0.14, s * 0.1);
  }

  function drawDogAndLeash() {
    const dogWX = lerpLane(dogLaneF);
    const dp = project(dogWX, Z_DOG);
    const s = dp.s * 0.95; // much bigger dog

    // leash from bottom of screen (we are the walker) to dog collar
    ctx.strokeStyle = blackout ? '#d6d3d1' : '#e7e5e4';
    ctx.lineWidth = Math.max(2.5, s * 0.07);
    ctx.beginPath();
    const handX = CX + (dogWX * 8); // slight bias with lane
    ctx.moveTo(handX, H + 4);
    ctx.quadraticCurveTo(
      (handX + dp.x) * 0.5,
      (H + dp.y) * 0.55,
      dp.x,
      dp.y - s * 0.35
    );
    ctx.stroke();

    if (invuln > 0 && ((invuln * 18) | 0) % 2 === 0) return;

    // big dog from behind
    ctx.fillStyle = '#00000055';
    ctx.beginPath(); ctx.ellipse(dp.x, dp.y + s * 0.1, s * 0.55, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = blackout ? '#6b3f12' : '#b45309';
    ctx.fillRect(dp.x - s * 0.5, dp.y - s * 0.7, s * 1.0, s * 0.6);
    // head
    ctx.fillRect(dp.x - s * 0.32, dp.y - s * 1.15, s * 0.7, s * 0.5);
    // ears
    ctx.fillStyle = blackout ? '#4a2c0a' : '#78350f';
    ctx.fillRect(dp.x - s * 0.35, dp.y - s * 1.35, s * 0.22, s * 0.28);
    ctx.fillRect(dp.x + s * 0.2, dp.y - s * 1.35, s * 0.22, s * 0.28);
    // legs
    ctx.fillStyle = blackout ? '#5a3510' : '#92400e';
    ctx.fillRect(dp.x - s * 0.42, dp.y - s * 0.15, s * 0.22, s * 0.35);
    ctx.fillRect(dp.x + s * 0.18, dp.y - s * 0.15, s * 0.22, s * 0.35);
    // tail
    ctx.fillStyle = blackout ? '#6b3f12' : '#b45309';
    ctx.fillRect(dp.x - s * 0.7, dp.y - s * 0.55, s * 0.28, s * 0.16);
    // collar
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(dp.x - s * 0.28, dp.y - s * 0.78, s * 0.56, s * 0.1);
  }

  function drawFlashlightOverlay() {
    if (!blackout) return;
    const dogWX = lerpLane(dogLaneF);
    const dp = project(dogWX, Z_DOG);
    const ahead = project(dogWX, Z_DOG + 3.8);
    const hx = dp.x * 0.3 + ahead.x * 0.7;
    const hy = dp.y * 0.4 + ahead.y * 0.6;
    const radius = Math.max(100, dp.s * 3.1);

    // Darken whole frame; keep a warm clear halo around dog / ahead
    const g = ctx.createRadialGradient(hx, hy, radius * 0.08, hx, hy, radius * 1.35);
    g.addColorStop(0, 'rgba(2, 6, 23, 0.05)');
    g.addColorStop(0.28, 'rgba(2, 6, 23, 0.25)');
    g.addColorStop(0.55, 'rgba(2, 6, 23, 0.72)');
    g.addColorStop(0.78, 'rgba(2, 6, 23, 0.9)');
    g.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const warm = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.55);
    warm.addColorStop(0, 'rgba(253, 230, 138, 0.16)');
    warm.addColorStop(1, 'rgba(253, 230, 138, 0)');
    ctx.fillStyle = warm;
    ctx.beginPath();
    ctx.arc(hx, hy, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    drawSky();
    ctx.fillStyle = blackout ? '#050505' : '#292524';
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    drawPath();

    const deco = scenery.map((s) => ({ z: s.z, draw: () => drawSceneryItem(s) }));
    for (const o of obstacles) {
      if (o.kind === 'puddle') deco.push({ z: o.z, draw: () => drawPuddle(o.lane, o.z) });
      else if (o.kind === 'dog') deco.push({ z: o.z, draw: () => drawAngryDog(o) });
      else if (o.kind === 'cat') deco.push({ z: o.z, draw: () => drawCat(o) });
      else deco.push({ z: o.z, draw: () => drawGenerator(o) });
    }
    deco.sort((a, b) => b.z - a.z);
    for (const d of deco) d.draw();

    drawDogAndLeash();
    drawFlashlightOverlay();
    drawAngryDogEyesAboveDark();

    if (notifs.length >= 4) {
      ctx.fillStyle = 'rgba(127,29,29,0.14)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // blackout HUD chip
    if (running && blackout) {
      ctx.fillStyle = '#111827cc';
      ctx.fillRect(10, H - 36, 130, 24);
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.fillText(t().blackout, 18, H - 19);
    }
  }

  function update(dt) {
    if (!running) return;
    time += dt;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);

    laneF += (lane - laneF) * Math.min(1, 10 * dt);
    dogLaneF += (laneF - dogLaneF) * Math.min(1, 6 * dt);

    speed = Math.min(SPEED_MAX, SPEED0 + distance * 0.012);
    const dz = speed * dt;
    pathPhase += dz * 0.7;
    distance += dz * 1.05;
    score += dz * 0.55;

    for (const o of obstacles) {
      o.z -= dz * (o.rush || 1);
      if (o.kind === 'cat') {
        o.x += o.dir * o.crossSpeed * dt;
        o.lane = laneFromX(o.x);
      }
    }
    for (const s of scenery) {
      s.z -= dz;
      if (s.z < Z_NEAR - 1) s.z += (Z_FAR - Z_NEAR) + Math.random() * 4;
    }
    obstacles = obstacles.filter((o) => {
      if (o.kind === 'cat') {
        if (Math.abs(o.x) > PATH_HALF + 1.6) return false;
        if (o.z < Z_NEAR - 1.2) return false;
        return true;
      }
      return o.z > Z_NEAR - 1.2;
    });

    spawnAcc += dt;
    const every = Math.max(0.7, 1.6 - distance / 700);
    if (spawnAcc >= every) {
      spawnAcc = 0;
      spawnObstacle();
      if (Math.random() < 0.2) spawnObstacle();
    }
    // occasional extra cat dash
    if (!update._catAcc) update._catAcc = 0;
    update._catAcc += dt;
    if (update._catAcc > 2.8 + Math.random() * 1.5) {
      update._catAcc = 0;
      if (Math.random() < 0.7) spawnCat();
    }

    for (const o of obstacles) {
      if (o.hit) continue;
      if (o.kind === 'cat') {
        // collision when cat crosses player's depth AND same lane
        if (o.z < Z_DOG + 1.4 && o.z > Z_DOG - 1.6) {
          if (Math.abs(o.x - lerpLane(dogLaneF)) < 0.55) {
            o.hit = true;
            // dog lunges / leash yank
            shake = Math.max(shake, 14);
            dogLaneF += o.dir * 0.35; // tug sideways
            hit();
          }
        }
        continue;
      }
      if (o.z < Z_DOG + 1.2 && o.z > Z_DOG - 1.5) {
        if (Math.abs(o.lane - dogLaneF) < 0.55) {
          o.hit = true;
          hit();
        }
      }
    }

    // blackout cycle
    if (blackout) {
      blackoutTimer -= dt;
      if (blackoutTimer <= 0) {
        blackout = false;
        nextBlackoutIn = 12 + Math.random() * 10;
      }
    } else {
      nextBlackoutIn -= dt;
      if (nextBlackoutIn <= 0) {
        blackout = true;
        blackoutTimer = 5.5 + Math.random() * 3.5;
      }
    }

    notifAcc += dt;
    notifRate = Math.max(1.0, 3.5 - distance / 260);
    if (notifAcc >= notifRate) { notifAcc = 0; spawnNotif(); }
    if (notifs.length >= 6) {
      if (!update._nDrain) update._nDrain = 0;
      update._nDrain += dt;
      if (update._nDrain > 2.5) { update._nDrain = 0; hit(); }
    } else update._nDrain = 0;

    document.getElementById('scoreLine').textContent = t().score(distance, score);
    document.getElementById('livesLine').textContent = t().lives(lives);
  }

  let last = performance.now();
  let frames = 0, fpsT = 0, fps = 0;
  const fpsSamples = [];
  window.__runner = {
    getFps: () => fps,
    getFpsSamples: () => fpsSamples.slice(),
    start: () => document.getElementById('oBtn').click(),
    setBlackout: (v) => { blackout = !!v; blackoutTimer = v ? 99 : 0; nextBlackoutIn = v ? 99 : 12; },
    spawnDogAt: (lane, z) => {
      obstacles.push({ kind: 'dog', lane: lane|0, z: z, hit: false, phase: Math.random()*6, bob: 0, rush: 1.8, growlT: 0 });
    },
    spawnCatAt: (z, dir) => {
      const d = dir === -1 ? -1 : 1;
      const pal = CAT_COLORS[(Math.random() * CAT_COLORS.length) | 0];
      obstacles.push({
        kind: 'cat', lane: 1, z: z, x: d > 0 ? -(PATH_HALF + 1.0) : (PATH_HALF + 1.0),
        dir: d, crossSpeed: 3.2, color: pal.body, colorDark: pal.dark,
        phase: Math.random() * 6, hit: false, rush: 1,
      });
    },
    getState: () => ({
      distance, score, lives, running, dead, notifs: notifs.length,
      obstacles: obstacles.length, blackout, speed, perspective: true, dogOnly: true,
      dogs: obstacles.filter(o=>o.kind==='dog').map(o=>({lane:o.lane,z:o.z,rush:o.rush})),
      cats: obstacles.filter(o=>o.kind==='cat').map(o=>({x:o.x,z:o.z,dir:o.dir,lane:o.lane})),
    }),
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

  seedScenery();
  applyLang();
  draw();
  requestAnimationFrame(frame);
})();
