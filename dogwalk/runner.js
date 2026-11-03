/* One Day in Kyiv — dog walk pseudo-3D courtyard runner (v8 crossroads/lens/AA) */
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
  // Road fills screen edge-to-edge at the near plane (evening courtyard walk)
  const LANE_X = [-2.02, 0, 2.02];
  const PATH_HALF = 3.32;  // bottom of canvas: path spans corner → corner
  const CAT_HIT_R = 0.90;  // scaled with lane spacing (~0.55 * 3.32/2.05)

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
      pause: 'Пауза',
      pauseBody: 'Торкніться, щоб продовжити',
      lensWipe: 'змахни',
      weatherRain: '🌧 Дощ',
      weatherSnow: '❄ Сніг',
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
      pause: 'Paused',
      pauseBody: 'Tap to resume',
      lensWipe: 'wipe',
      weatherRain: '🌧 Rain',
      weatherSnow: '❄ Snow',
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
    document.getElementById('pauseTitle').textContent = L.pause;
    document.getElementById('pauseBody').textContent = L.pauseBody;
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
  // Casual-first balance: easy first minute, old difficulty ~3 min
  let speed = 4.5;
  const SPEED0 = 4.5, SPEED_MAX = 18;
  const RAMP_SECS = 180; // reach SPEED_MAX only after ~3 minutes
  const START_LIVES = 5;
  const INVULN_HIT = 2.0;
  let distance = 0, score = 0, lives = START_LIVES;
  let running = false, dead = false, invuln = 0, shake = 0;
  let spawnAcc = 0, notifAcc = 0, notifRate = 6.5;
  let obstacles = [], scenery = [], pathPhase = 0;
  let blackout = false, blackoutTimer = 0, nextBlackoutIn = 55;
  let time = 0;
  let paused = false;
  // Weather: ambient particles + discrete lens splats (swipe each like alerts)
  let weather = null; // 'rain' | 'snow' | null
  let weatherTimer = 0, nextWeatherIn = 38, splatAcc = 0;
  let particles = [];
  let crossings = []; // decorative side-street intersections {z, half}
  let skyFx = []; // air-defense lasers / boom puffs while alerts active

  const notifRoot = document.getElementById('notifs');
  let notifs = [];
  let lensSplats = [];
  const pauseOverlay = document.getElementById('pauseOverlay');
  const pauseBtn = document.getElementById('pauseBtn');

  function resetGame() {
    lane = 1; laneF = 1; dogLaneF = 1;
    speed = SPEED0; distance = 0; score = 0; lives = START_LIVES;
    invuln = 0; spawnAcc = 0; notifAcc = 0; notifRate = 6.5;
    obstacles = []; pathPhase = 0; shake = 0; dead = false; time = 0;
    blackout = false; blackoutTimer = 0; nextBlackoutIn = 50 + Math.random() * 20;
    paused = false; hidePauseUI();
    weather = null; weatherTimer = 0; nextWeatherIn = 32 + Math.random() * 18;
    splatAcc = 0; particles = []; skyFx = [];
    update._catAcc = 0; update._nDrain = 0;
    seedScenery();
    clearNotifs();
    clearLensSplats();
    syncPauseBtn();
  }

  function clearNotifs() {
    notifs.forEach((n) => n.el.remove());
    notifs = [];
  }

  function clearLensSplats() {
    lensSplats.forEach((s) => s.el.remove());
    lensSplats = [];
  }

  function syncPauseBtn() {
    if (running && !dead) pauseBtn.classList.remove('hidden');
    else pauseBtn.classList.add('hidden');
  }

  function hidePauseUI() {
    pauseOverlay.classList.remove('show');
  }

  function setPaused(v) {
    if (!running || dead) return;
    paused = !!v;
    if (paused) {
      pauseOverlay.classList.add('show');
      // Keep lens splats but don't interact under pause overlay
      lensSplats.forEach((s) => { s.el.style.pointerEvents = 'none'; });
      applyLang();
    } else {
      hidePauseUI();
      last = performance.now();
      lensSplats.forEach((s) => { s.el.style.pointerEvents = 'auto'; });
    }
  }

  function togglePause() {
    if (!running || dead) return;
    setPaused(!paused);
  }

  function spawnWeather(kind) {
    weather = kind === 'snow' ? 'snow' : 'rain';
    weatherTimer = 12 + Math.random() * 8; // 12–20s
    splatAcc = 1.2 + Math.random(); // first splat after a beat
    particles = [];
    const count = weather === 'snow' ? 48 : 64;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        sp: weather === 'snow' ? (24 + Math.random() * 36) : (200 + Math.random() * 240),
        drift: (Math.random() - 0.5) * (weather === 'snow' ? 26 : 36),
        size: weather === 'snow' ? (1.4 + Math.random() * 2.2) : (1 + Math.random() * 1.3),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function stopWeather() {
    weather = null;
    weatherTimer = 0;
    particles = [];
    nextWeatherIn = 26 + Math.random() * 18;
    // Lens splats stay until player swipes each — they do not auto-vanish
  }

  function spawnLensSplat(forceKind) {
    if (!running || dead || paused) return;
    if (lensSplats.length >= 4) return; // fair cap
    const kind = forceKind || weather || 'rain';
    const el = document.createElement('div');
    el.className = 'lens-splat ' + (kind === 'snow' ? 'snow' : 'rain');
    const wrap = document.getElementById('wrap').getBoundingClientRect();
    const size = 64 + Math.random() * 36;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    // Prefer mid/upper lens area — "on glasses"
    const left = 8 + Math.random() * Math.max(40, wrap.width - size - 16);
    const top = 70 + Math.random() * Math.max(80, wrap.height * 0.55);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.innerHTML = `<div class="cap">${t().lensWipe}</div>`;
    notifRoot.appendChild(el);
    const state = { el, startX: 0, dx: 0, dragging: false, kind };
    lensSplats.push(state);
    const dismiss = () => {
      el.style.transform = `translateX(${state.dx >= 0 ? 140 : -140}%) scale(0.85)`;
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        lensSplats = lensSplats.filter((s) => s !== state);
        score += 8;
      }, 150);
    };
    const onDown = (e) => {
      if (paused) return;
      e.preventDefault(); e.stopPropagation();
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
      if (Math.abs(state.dx) > 48) dismiss();
      else el.style.transform = 'translateX(0)';
    };
    el.addEventListener('click', (e) => { e.stopPropagation(); if (Math.abs(state.dx) < 8) dismiss(); });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function updateWeather(dt) {
    if (weather) {
      weatherTimer -= dt;
      for (const p of particles) {
        p.y += p.sp * dt;
        p.x += (p.drift + Math.sin(time * 2 + p.phase) * (weather === 'snow' ? 12 : 6)) * dt;
        if (p.y > H + 8) { p.y = -8; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
      }
      // Discrete lens hits — slow, capped, never auto-clear
      splatAcc += dt;
      const every = 2.6 + lensSplats.length * 0.7; // slower when already messy
      if (splatAcc >= every) {
        splatAcc = 0;
        if (Math.random() < 0.85) spawnLensSplat();
      }
      if (weatherTimer <= 0) stopWeather();
    } else {
      nextWeatherIn -= dt;
      if (nextWeatherIn <= 0 && time > 32) {
        spawnWeather(Math.random() < 0.45 ? 'snow' : 'rain');
      }
    }
  }

  function drawWeatherParticles() {
    if (!weather) return;
    if (weather === 'rain') {
      ctx.strokeStyle = 'rgba(186,230,253,0.45)';
      ctx.lineWidth = 1.2;
      for (const p of particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 1.3, p.y + 9 + p.size * 3.5);
        ctx.stroke();
      }
    } else {
      for (const p of particles) {
        ctx.fillStyle = 'rgba(241,245,249,0.8)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function crossingAt(z) {
    for (const c of crossings) {
      if (Math.abs(c.z - z) < c.half) return c;
    }
    return null;
  }

  function updateSkyFx(dt) {
    // Air defense only while at least one alert push is on screen
    const alertOn = notifs.length > 0;
    if (!alertOn) {
      skyFx = skyFx.filter((fx) => {
        fx.life -= dt;
        return fx.life > 0;
      });
      return;
    }
    // Occasional dashed laser tracers over far skyline
    if (Math.random() < dt * 0.55) {
      const x0 = 20 + Math.random() * (W - 40);
      const y0 = HORIZON - 8 - Math.random() * 36;
      const x1 = x0 + (Math.random() - 0.5) * 80;
      const y1 = Math.max(8, y0 - (30 + Math.random() * 50));
      skyFx.push({
        kind: 'laser', x0, y0, x1, y1,
        life: 0.18 + Math.random() * 0.28,
        phase: Math.random() * 10,
      });
    }
    // Rare interception puff
    if (Math.random() < dt * 0.09) {
      skyFx.push({
        kind: 'boom',
        x: 40 + Math.random() * (W - 80),
        y: 20 + Math.random() * (HORIZON - 28),
        life: 0.7 + Math.random() * 0.5,
        r0: 4 + Math.random() * 4,
      });
    }
    for (const fx of skyFx) fx.life -= dt;
    skyFx = skyFx.filter((fx) => fx.life > 0);
  }

  function drawSkyFx() {
    for (const fx of skyFx) {
      if (fx.kind === 'laser') {
        const a = Math.max(0, Math.min(1, fx.life * 3));
        ctx.strokeStyle = `rgba(134, 239, 172, ${0.85 * a})`;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -time * 40 - fx.phase;
        ctx.beginPath();
        ctx.moveTo(fx.x0, fx.y0);
        ctx.lineTo(fx.x1, fx.y1);
        ctx.stroke();
        // hot tip
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(187, 247, 208, ${0.9 * a})`;
        ctx.beginPath(); ctx.arc(fx.x1, fx.y1, 1.6, 0, Math.PI * 2); ctx.fill();
      } else if (fx.kind === 'boom') {
        const t = 1 - Math.max(0, Math.min(1, fx.life / 1.1));
        const r = fx.r0 + t * 16;
        const a = (1 - t) * 0.7;
        ctx.fillStyle = `rgba(251, 146, 60, ${a * 0.55})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(254, 243, 199, ${a * 0.7})`;
        ctx.beginPath(); ctx.arc(fx.x - r * 0.15, fx.y - r * 0.2, r * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(120, 113, 108, ${a * 0.45})`;
        ctx.beginPath(); ctx.arc(fx.x + r * 0.2, fx.y - r * 0.1, r * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setLineDash([]);
  }

  function drawSideBuildingFills() {
    // Layered silhouettes packing the shoulders so no empty black remains
    for (let i = 0; i < 16; i++) {
      const z = 7 + i * 4.2;
      if (z < Z_NEAR || z > Z_FAR) continue;
      const left = pathEdgeX(-1, z);
      const right = pathEdgeX(1, z);
      const pL = project(-(PATH_HALF + 1.2), z);
      const pR = project(PATH_HALF + 1.2, z);
      const sc = pL.s;
      const stories = 3 + (i % 5);
      const bh = sc * (0.5 * stories + 0.4);
      const mask = (i * 104729 + 7919) | 0;
      // LEFT pack: fill from 0 → path edge with 2 staggered blocks
      for (let b = 0; b < 2; b++) {
        const x1 = b === 0 ? 0 : left * 0.45;
        const x2 = b === 0 ? Math.max(x1 + 8, left * 0.55) : left;
        if (x2 <= x1 + 2) continue;
        const baseY = pL.y;
        const h = bh * (0.75 + (b + i) % 3 * 0.12);
        ctx.fillStyle = blackout ? '#030308' : (b ? '#080712' : '#0c0a14');
        ctx.fillRect(x1, baseY - h, x2 - x1, h + 4);
        if (!blackout) {
          const cols = 2 + (i + b) % 3;
          const rows = Math.max(2, stories - 1);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const col = windowColor(mask + b * 17, r, c, (r + c + i) % 8 === 0);
            if (!col) continue;
            const ww = (x2 - x1) * 0.12;
            ctx.fillStyle = col;
            ctx.fillRect(
              x1 + (x2 - x1) * (0.1 + c * (0.8 / cols)),
              baseY - h + h * (0.1 + r * (0.8 / rows)),
              Math.max(2, ww), Math.max(2, h * 0.07)
            );
          }
        }
      }
      // RIGHT pack
      for (let b = 0; b < 2; b++) {
        const x1 = b === 0 ? right : right + (W - right) * 0.45;
        const x2 = b === 0 ? right + (W - right) * 0.55 : W;
        if (x2 <= x1 + 2) continue;
        const baseY = pR.y;
        const h = bh * (0.7 + (b + i * 2) % 3 * 0.14);
        ctx.fillStyle = blackout ? '#030308' : (b ? '#0a0912' : '#070610');
        ctx.fillRect(x1, baseY - h, x2 - x1, h + 4);
        if (!blackout) {
          const cols = 2 + (i + b) % 3;
          const rows = Math.max(2, stories - 1);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const col = windowColor(mask + 99 + b, r, c, (r + c + i) % 7 === 0);
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(
              x1 + (x2 - x1) * (0.1 + c * (0.8 / cols)),
              baseY - h + h * (0.1 + r * (0.8 / rows)),
              Math.max(2, (x2 - x1) * 0.12), Math.max(2, h * 0.07)
            );
          }
        }
      }
    }
  }

  function gameOver() {
    running = false; dead = true; paused = false; hidePauseUI();
    stopWeather(); clearLensSplats(); skyFx = []; syncPauseBtn(); applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function hit() {
    if (invuln > 0) return;
    lives -= 1; invuln = INVULN_HIT; shake = 12;
    if (lives <= 0) gameOver();
  }

  function occupiedLanesNear(zMin, zMax) {
    const set = new Set();
    for (const o of obstacles) {
      if (o.hit) continue;
      if (o.kind === 'cat') continue; // crossing — temporary
      if (o.z >= zMin && o.z <= zMax) set.add(o.lane | 0);
    }
    return set;
  }

  function pickFreeLane() {
    // Never fill all 3 approach lanes — always leave an escape
    const occ = occupiedLanesNear(Z_DOG + 4, Z_FAR + 8);
    const free = [];
    for (let i = 0; i < LANES; i++) if (!occ.has(i)) free.push(i);
    if (free.length === 0) return -1; // skip spawn
    // Prefer leaving at least one free after this spawn
    if (free.length === 1 && occ.size >= 2) return -1;
    return free[(Math.random() * free.length) | 0];
  }

  function seedScenery() {
    scenery = [];
    // Dense roadside both sides — no visual holes
    const roadside = ['lamp', 'tree', 'hedge', 'garage', 'khrush', 'tree', 'fence', 'lamp', 'hedge', 'garage'];
    for (let i = 0; i < 56; i++) {
      const zBase = 7.5 + i * 1.12;
      for (const side of [-1, 1]) {
        const kind = roadside[(i + (side < 0 ? 0 : 3)) % roadside.length];
        // force lamps regularly so light pools feel continuous
        const forcedLamp = (i % 4 === (side < 0 ? 0 : 2));
        scenery.push({
          kind: forcedLamp ? 'lamp' : kind,
          side,
          z: zBase + (side > 0 ? 0.28 : 0) + Math.random() * 0.25,
          variant: (Math.random() * 5) | 0,
          winMask: (Math.random() * 0xffffff) | 0,
          stories: 2 + ((Math.random() * 3) | 0),
        });
        // Extra filler on same side to kill gaps
        if (!forcedLamp && Math.random() < 0.55) {
          const fill = Math.random() < 0.5 ? 'hedge' : 'tree';
          scenery.push({
            kind: fill,
            side,
            z: zBase + 0.55 + Math.random() * 0.3,
            variant: (Math.random() * 3) | 0,
            winMask: 0,
            stories: 1,
          });
        }
      }
    }
    // Far building silhouettes (deeper / farther out) — denser pack
    for (let i = 0; i < 40; i++) {
      scenery.push({
        kind: 'building',
        side: i % 2 === 0 ? -1 : 1,
        z: 12 + i * 1.85 + Math.random() * 1.0,
        variant: (Math.random() * 4) | 0,
        winMask: (Math.random() * 0xffffff) | 0,
        stories: 4 + ((Math.random() * 6) | 0),
      });
    }
    // Occasional decorative crossroads (no gameplay challenges)
    crossings = [];
    for (let i = 0; i < 6; i++) {
      crossings.push({
        z: 18 + i * 11 + Math.random() * 3,
        half: 1.15 + Math.random() * 0.35,
      });
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
      crossSpeed: 1.25 + Math.random() * 0.9,
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
    // Early game: fewer dogs/cats; cats also throttled separately
    const early = time < 60;
    if (early) {
      if (r < 0.45) kind = 'puddle';
      else if (r < 0.70) kind = 'dog';
      else if (r < 0.82) kind = 'cat';
      else kind = 'generator';
    } else {
      if (r < 0.26) kind = 'puddle';
      else if (r < 0.52) kind = 'dog';
      else if (r < 0.78) kind = 'cat';
      else kind = 'generator';
    }
    if (kind === 'cat') { spawnCat(); return; }
    const l = pickFreeLane();
    if (l < 0) return; // would block all escapes — skip
    obstacles.push({
      kind, lane: l, z: Z_FAR + Math.random() * 5, hit: false,
      phase: Math.random() * Math.PI * 2,
      bob: 0,
      rush: kind === 'dog' ? (1.15 + Math.random() * 0.25) : 1,
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
    if (!running || paused) return;
    lane = Math.max(0, Math.min(LANES - 1, lane + dir));
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { tryLane(-1); e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { tryLane(1); e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter') && !running) document.getElementById('oBtn').click();
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); }
  });

  let swipeX0 = 0, swipeY0 = 0, swipeArmed = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!running || paused) return;
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
    syncPauseBtn();
  });

  pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePause();
  });
  pauseOverlay.addEventListener('click', () => {
    if (paused) setPaused(false);
  });

  function windowColor(mask, r, c, flicker) {
    // Deterministic warm/varied window tones; occasional soft flicker
    const bit = (mask >> ((r * 3 + c) % 24)) & 1;
    if (!bit) return null;
    const tone = (mask + r * 7 + c * 13) % 5;
    const pulse = flicker ? (0.72 + 0.28 * Math.sin(time * 3.1 + r + c * 1.7 + (mask % 9))) : 1;
    const colors = [
      `rgba(253,230,138,${0.95 * pulse})`,
      `rgba(251,191,36,${0.9 * pulse})`,
      `rgba(253,186,116,${0.88 * pulse})`,
      `rgba(254,243,199,${0.85 * pulse})`,
      `rgba(147,197,253,${0.55 * pulse})`, // rare cool TV glow
    ];
    return colors[tone];
  }

  function drawSky() {
    if (blackout) {
      ctx.fillStyle = '#010104';
      ctx.fillRect(0, 0, W, HORIZON + 28);
      return;
    }
    // Deep evening / early night
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 28);
    g.addColorStop(0, '#020617');
    g.addColorStop(0.45, '#0b1530');
    g.addColorStop(0.8, '#1a1030');
    g.addColorStop(1, '#2a1838');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 32);
    // faint stars
    ctx.fillStyle = '#e2e8f055';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 97 + 13) % (W - 8)) + 4;
      const sy = ((i * 53 + 7) % Math.max(8, HORIZON - 18)) + 4;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  function drawCityBackdrop() {
    // Far silhouettes just under the horizon — darkness & glowing windows
    const baseY = HORIZON + 6;
    for (let i = 0; i < 14; i++) {
      const x = -20 + i * 30 + ((i * 17) % 11);
      const bw = 22 + (i % 5) * 6;
      const bh = 18 + (i % 4) * 10 + ((i * 3) % 7);
      ctx.fillStyle = blackout ? '#030308' : '#07060e';
      ctx.fillRect(x, baseY - bh, bw, bh + 8);
      if (blackout) continue;
      const mask = (i * 7919 + 104729) | 0;
      const cols = 2 + (i % 3);
      const rows = 2 + (i % 4);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const col = windowColor(mask, r, c, (i + r + c) % 5 === 0);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + 3 + c * ((bw - 6) / cols), baseY - bh + 3 + r * ((bh - 6) / rows), Math.max(2, bw * 0.12), Math.max(2, bh * 0.1));
      }
    }
    // Fog veil over far city / path vanishing point
    const fog = ctx.createLinearGradient(0, HORIZON - 10, 0, HORIZON + 90);
    if (blackout) {
      fog.addColorStop(0, 'rgba(2,2,8,0.55)');
      fog.addColorStop(0.55, 'rgba(2,2,8,0.35)');
      fog.addColorStop(1, 'rgba(2,2,8,0)');
    } else {
      fog.addColorStop(0, 'rgba(12,10,24,0.75)');
      fog.addColorStop(0.4, 'rgba(20,14,36,0.45)');
      fog.addColorStop(1, 'rgba(20,14,36,0)');
    }
    ctx.fillStyle = fog;
    ctx.fillRect(0, HORIZON - 12, W, 110);
  }

  function drawPath() {
    // Evening asphalt path — fills screen edge-to-edge at the near plane
    for (let y = HORIZON; y < H + 4; y++) {
      const row = y - HORIZON + 1;
      const z = (CAM_H * FOCAL) / row;
      if (z < Z_NEAR - 0.6 || z > Z_FAR + 10) continue;
      let left = pathEdgeX(-1, z);
      let right = pathEdgeX(1, z);
      const cross = crossingAt(z);
      // At a crossroads the pavement spans full width (side street)
      if (cross) {
        left = 0;
        right = W;
      }
      // Dark evening pavement
      const tile = (((z * 1.6 + pathPhase * 0.4) | 0) % 3);
      if (blackout) ctx.fillStyle = tile === 0 ? '#0c0a0f' : '#09080c';
      else if (cross) ctx.fillStyle = tile === 0 ? '#322a3a' : tile === 1 ? '#2a2233' : '#1f1828';
      else ctx.fillStyle = tile === 0 ? '#2a2433' : tile === 1 ? '#211c29' : '#18141f';
      ctx.fillRect(left, y, Math.max(1, right - left), 1);
      if (!cross) {
        const edge = Math.max(1.2, (right - left) * 0.012);
        ctx.fillStyle = blackout ? '#1a1520' : '#3f3a4a';
        ctx.fillRect(left, y, edge, 1);
        ctx.fillRect(right - edge, y, edge, 1);
      }
    }
  }

  function drawCrossingMarks() {
    // Subtle side-street perspective lines at each crossroads (decorative only)
    for (const c of crossings) {
      if (c.z < Z_NEAR + 0.5 || c.z > Z_FAR - 4) continue;
      const y = project(0, c.z).y;
      const y2 = project(0, Math.max(Z_NEAR, c.z - c.half)).y;
      const y3 = project(0, c.z + c.half).y;
      // horizontal band edges
      ctx.strokeStyle = blackout ? '#1f1a24' : '#4b4458';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(W, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y3); ctx.lineTo(W, y3); ctx.stroke();
      // dashed center of side street
      ctx.strokeStyle = blackout ? '#29252488' : '#a8a29e66';
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      // little sign posts at mouth of side street
      if (!blackout) {
        const left = pathEdgeX(-1, c.z);
        const right = pathEdgeX(1, c.z);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(left - 3, y - 14, 3, 10);
        ctx.fillRect(right, y - 14, 3, 10);
      }
    }
  }

  function drawLampPools() {
    // Warm street-lamp light pools cast onto the road from the sides
    if (blackout) return;
    for (const s of scenery) {
      if (s.kind !== 'lamp') continue;
      if (s.z < Z_NEAR || s.z > Z_FAR - 4) continue;
      const lampWX = s.side * (PATH_HALF + 0.55);
      const lamp = project(lampWX, s.z);
      const sc = lamp.s;
      // Pool sits on the road, inset from the edge toward center
      const poolWX = s.side * (PATH_HALF * 0.62);
      const pool = project(poolWX, s.z);
      const rw = Math.max(8, sc * 1.35);
      const rh = Math.max(3, sc * 0.42);
      const g = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, rw);
      g.addColorStop(0, 'rgba(255, 236, 160, 0.42)');
      g.addColorStop(0.35, 'rgba(251, 191, 36, 0.22)');
      g.addColorStop(0.75, 'rgba(245, 158, 11, 0.07)');
      g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      // Soft airborne cone from lamp head down toward road
      const headY = lamp.y - sc * 1.5;
      const cone = ctx.createRadialGradient(lamp.x, headY, 0, lamp.x, headY, sc * 1.8);
      cone.addColorStop(0, 'rgba(254, 243, 199, 0.22)');
      cone.addColorStop(0.45, 'rgba(253, 224, 71, 0.08)');
      cone.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.arc(lamp.x, headY, sc * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSceneryItem(s) {
    if (s.z < Z_NEAR || s.z > Z_FAR) return;
    const out = s.kind === 'building' ? 1.55 : (s.kind === 'tree' ? 0.85 : 0.55);
    const wx = s.side * (PATH_HALF + out + (s.kind === 'building' ? 0.4 : 0));
    const p = project(wx, s.z);
    const sc = p.s, baseY = p.y;
    const mask = s.winMask || 0;

    if (s.kind === 'building') {
      const stories = s.stories || 5;
      const bw = sc * (1.6 + (s.variant % 3) * 0.35);
      const bh = sc * (0.55 * stories);
      ctx.fillStyle = blackout ? '#04040a' : '#0a0914';
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      // roof ledge
      ctx.fillStyle = blackout ? '#020208' : '#050510';
      ctx.fillRect(p.x - bw / 2 - 2, baseY - bh - 3, bw + 4, 4);
      if (!blackout) {
        const cols = 3 + (s.variant % 2);
        const rows = Math.max(3, stories);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const col = windowColor(mask, r, c, ((mask >> (r + c)) & 1) && ((r + c + s.variant) % 6 === 0));
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(
            p.x - bw / 2 + bw * (0.1 + c * (0.8 / cols)),
            baseY - bh + bh * (0.08 + r * (0.85 / rows)),
            bw * 0.12, bh * 0.07
          );
        }
      }
      return;
    }

    if (s.kind === 'khrush') {
      const bw = sc * 1.2, bh = sc * 1.75;
      // Evening silhouette / brick dusk tones
      ctx.fillStyle = blackout ? '#0c0a10' : (s.variant % 3 === 0 ? '#2a1c18' : s.variant % 3 === 1 ? '#1c1a22' : '#241e14');
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      if (!blackout) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          const col = windowColor(mask, r, c, (r + c + s.variant) % 7 === 0);
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(p.x - bw / 2 + bw * (0.12 + c * 0.28), baseY - bh + bh * (0.12 + r * 0.2), bw * 0.14, bh * 0.1);
        }
      }
    } else if (s.kind === 'garage') {
      const bw = sc * 0.95, bh = sc * 0.65;
      ctx.fillStyle = blackout ? '#080c08' : '#101810';
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      ctx.fillStyle = blackout ? '#050805' : '#0a120a';
      ctx.fillRect(p.x - bw * 0.35, baseY - bh * 0.75, bw * 0.7, bh * 0.55);
      // tiny warm slit when power is on
      if (!blackout && (mask & 1)) {
        ctx.fillStyle = 'rgba(251,191,36,0.55)';
        ctx.fillRect(p.x - bw * 0.08, baseY - bh * 0.55, bw * 0.16, bh * 0.08);
      }
    } else if (s.kind === 'tree') {
      ctx.fillStyle = blackout ? '#0a0604' : '#1a0f0a';
      ctx.fillRect(p.x - sc * 0.08, baseY - sc * 0.65, sc * 0.16, sc * 0.65);
      ctx.fillStyle = blackout ? '#040a06' : '#0a1f12';
      ctx.beginPath(); ctx.arc(p.x, baseY - sc * 0.8, sc * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - sc * 0.22, baseY - sc * 0.7, sc * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + sc * 0.2, baseY - sc * 0.72, sc * 0.26, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'lamp') {
      ctx.fillStyle = blackout ? '#111827' : '#1e293b';
      ctx.fillRect(p.x - sc * 0.05, baseY - sc * 1.45, sc * 0.1, sc * 1.45);
      if (blackout) {
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); ctx.arc(p.x, baseY - sc * 1.5, sc * 0.14, 0, Math.PI * 2); ctx.fill();
      } else {
        // glowing lamp head
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath(); ctx.arc(p.x, baseY - sc * 1.5, sc * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.beginPath(); ctx.arc(p.x, baseY - sc * 1.5, sc * 0.38, 0, Math.PI * 2); ctx.fill();
      }
    } else if (s.kind === 'hedge') {
      ctx.fillStyle = blackout ? '#040a06' : '#0c1a10';
      ctx.fillRect(p.x - sc * 0.55, baseY - sc * 0.42, sc * 1.1, sc * 0.42);
      ctx.fillStyle = blackout ? '#030806' : '#08140c';
      ctx.fillRect(p.x - sc * 0.4, baseY - sc * 0.52, sc * 0.8, sc * 0.16);
    } else if (s.kind === 'fence') {
      ctx.fillStyle = blackout ? '#0a080c' : '#1a1520';
      ctx.fillRect(p.x - sc * 0.7, baseY - sc * 0.35, sc * 1.4, sc * 0.08);
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(p.x - sc * 0.65 + i * sc * 0.3, baseY - sc * 0.55, sc * 0.06, sc * 0.55);
      }
    }
  }

  function drawPuddle(laneIdx, z) {
    const p = project(LANE_X[laneIdx], z);
    const w = p.s * 0.9, h = p.s * 0.28;
    ctx.fillStyle = blackout ? '#060a12' : '#0c1524';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2); ctx.fill();
    if (!blackout) {
      // warm street-lamp reflection in water
      ctx.fillStyle = 'rgba(253, 230, 138, 0.35)';
      ctx.beginPath(); ctx.ellipse(p.x - w * 0.15, p.y - h * 0.15, w * 0.28, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(147, 197, 253, 0.2)';
      ctx.beginPath(); ctx.ellipse(p.x + w * 0.2, p.y + h * 0.05, w * 0.18, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
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
    // Base fill — side building packs cover most of the black
    ctx.fillStyle = blackout ? '#000000' : '#05040a';
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    drawCityBackdrop();
    drawSkyFx();
    drawSideBuildingFills();
    drawPath();
    drawCrossingMarks();
    drawLampPools();

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
    drawWeatherParticles();

    if (notifs.length >= 4) {
      ctx.fillStyle = 'rgba(127,29,29,0.14)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // HUD chips
    let chipY = H - 36;
    if (running && blackout) {
      ctx.fillStyle = '#111827cc';
      ctx.fillRect(10, chipY, 130, 24);
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.fillText(t().blackout, 18, chipY + 17);
      chipY -= 28;
    }
    if (running && weather) {
      ctx.fillStyle = '#0f172acc';
      ctx.fillRect(10, chipY, 110, 24);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.fillText(weather === 'snow' ? t().weatherSnow : t().weatherRain, 18, chipY + 17);
    }
  }

  function update(dt) {
    if (!running || paused) return;
    time += dt;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);

    laneF += (lane - laneF) * Math.min(1, 10 * dt);
    dogLaneF += (laneF - dogLaneF) * Math.min(1, 6 * dt);

    // Linear ramp: old mid/late difficulty only around 3 minutes
    const rampT = Math.min(1, time / RAMP_SECS);
    speed = SPEED0 + (SPEED_MAX - SPEED0) * rampT;
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
    for (const c of crossings) {
      c.z -= dz;
      if (c.z < Z_NEAR - 2) c.z += (Z_FAR - Z_NEAR) + 8 + Math.random() * 6;
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
    // Wide gaps early; tighten only with ramp
    const every = 3.2 - rampT * 1.8; // 3.2s → ~1.4s over 3 min
    if (spawnAcc >= every) {
      spawnAcc = 0;
      spawnObstacle();
      if (rampT > 0.45 && Math.random() < 0.15 * rampT) spawnObstacle();
    }
    // cats: rare in first minute
    if (!update._catAcc) update._catAcc = 0;
    update._catAcc += dt;
    const catEvery = time < 60 ? (5.5 + Math.random() * 2) : (3.2 + Math.random() * 1.8);
    if (update._catAcc > catEvery) {
      update._catAcc = 0;
      if (time < 45) { if (Math.random() < 0.35) spawnCat(); }
      else if (Math.random() < 0.65) spawnCat();
    }

    for (const o of obstacles) {
      if (o.hit) continue;
      if (o.kind === 'cat') {
        // collision when cat crosses player's depth AND same lane
        if (o.z < Z_DOG + 1.4 && o.z > Z_DOG - 1.6) {
          if (Math.abs(o.x - lerpLane(dogLaneF)) < CAT_HIT_R) {
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

    // blackout: first one after ~1 min; shorter early
    if (blackout) {
      blackoutTimer -= dt;
      if (blackoutTimer <= 0) {
        blackout = false;
        nextBlackoutIn = 18 + Math.random() * 14;
      }
    } else {
      nextBlackoutIn -= dt;
      if (nextBlackoutIn <= 0 && time > 45) {
        blackout = true;
        blackoutTimer = (time < 90 ? 3.5 : 5.5) + Math.random() * 2.5;
      }
    }

    updateWeather(dt);
    updateSkyFx(dt);

    notifAcc += dt;
    // Slow pushes at start; still pressure later
    notifRate = 7.5 - rampT * 4.5; // 7.5s → 3.0s
    if (notifRate < 2.5) notifRate = 2.5;
    if (notifAcc >= notifRate) { notifAcc = 0; spawnNotif(); }
    if (notifs.length >= 7) {
      if (!update._nDrain) update._nDrain = 0;
      update._nDrain += dt;
      if (update._nDrain > 3.5) { update._nDrain = 0; hit(); }
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
    setWeather: (kind) => {
      if (!kind || kind === 'none') { stopWeather(); return; }
      spawnWeather(kind === 'snow' ? 'snow' : 'rain');
    },
    spawnLensSplat: (kind) => spawnLensSplat(kind),
    clearLensSplats: () => clearLensSplats(),
    forceAlert: () => { spawnNotif(); },
    placeCrossingAt: (z) => {
      crossings.push({ z: z || 14, half: 1.4 });
    },
    burstSkyFx: () => {
      for (let i = 0; i < 6; i++) {
        const x0 = 30 + Math.random() * (W - 60);
        const y0 = HORIZON - 6 - Math.random() * 30;
        skyFx.push({
          kind: 'laser', x0, y0,
          x1: x0 + (Math.random() - 0.5) * 90,
          y1: Math.max(6, y0 - (35 + Math.random() * 45)),
          life: 0.55 + Math.random() * 0.35,
          phase: Math.random() * 10,
        });
      }
      skyFx.push({
        kind: 'boom', x: W * 0.35 + Math.random() * W * 0.3,
        y: 28 + Math.random() * 40, life: 0.95, r0: 6,
      });
    },
    setPaused: (v) => setPaused(!!v),
    togglePause: () => togglePause(),
    spawnDogAt: (lane, z) => {
      obstacles.push({ kind: 'dog', lane: lane|0, z: z, hit: false, phase: Math.random()*6, bob: 0, rush: 1.25, growlT: 0 });
    },
    spawnCatAt: (z, dir) => {
      const d = dir === -1 ? -1 : 1;
      const pal = CAT_COLORS[(Math.random() * CAT_COLORS.length) | 0];
      obstacles.push({
        kind: 'cat', lane: 1, z: z, x: d > 0 ? -(PATH_HALF + 1.0) : (PATH_HALF + 1.0),
        dir: d, crossSpeed: 1.6, color: pal.body, colorDark: pal.dark,
        phase: Math.random() * 6, hit: false, rush: 1,
      });
    },
    setLane: (n) => { if (!running) return; lane = Math.max(0, Math.min(LANES - 1, n | 0)); },
    getLane: () => lane,
    dismissAllNotifs: () => {
      document.querySelectorAll('.notif').forEach((el) => el.click());
    },
    getState: () => ({
      distance, score, lives, running, dead, paused, notifs: notifs.length,
      obstacles: obstacles.length, blackout, weather,
      lensSplats: lensSplats.length, crossings: crossings.length, skyFx: skyFx.length,
      notifsActive: notifs.length,
      speed, time, perspective: true, dogOnly: true,
      lane, dogLaneF,
      dogs: obstacles.filter(o=>o.kind==='dog').map(o=>({lane:o.lane,z:o.z,rush:o.rush})),
      cats: obstacles.filter(o=>o.kind==='cat').map(o=>({x:o.x,z:o.z,dir:o.dir,lane:o.lane})),
      hazards: obstacles.filter(o=>!o.hit).map(o=>({
        kind: o.kind, lane: o.kind==='cat' ? laneFromX(o.x) : (o.lane|0),
        z: o.z, x: o.x || 0, dir: o.dir || 0,
      })),
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
