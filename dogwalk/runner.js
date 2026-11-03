/* One Day in Kyiv — dog walk 3-lane runner, Minion Rush-style pseudo-3D */
(function () {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  // --- perspective camera ---
  const CX = W / 2;
  const HORIZON = Math.floor(H * 0.36);
  const FOCAL = 260;       // projection strength
  const CAM_H = 6.4;       // camera height — tunes near-plane to bottom of screen
  const Z_PLAYER = 6.5;    // player depth (near)
  const Z_DOG = 5.4;
  const Z_NEAR = 4.0;      // clip / collision plane
  const Z_FAR = 72;
  const LANE_X = [-1.35, 0, 1.35]; // world X per lane
  const ROAD_HALF = 2.15;  // half-width of road at world scale

  function project(wx, z) {
    const zz = Math.max(0.65, z);
    const scale = FOCAL / zz;
    return {
      x: CX + wx * scale,
      y: HORIZON + (CAM_H * FOCAL) / zz,
      s: scale,
    };
  }

  function roadEdgeX(side, z) {
    // side: -1 left, +1 right
    return project(side * ROAD_HALF, z).x;
  }

  // --- i18n (same as before) ---
  const I18N = {
    ua: {
      title: 'Прогулянка з собакою',
      hint: 'Свайп ← → · змахни тривоги',
      score: (d, s) => `${d | 0} м · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Прогулянка',
      overlayBody: 'Ухиляйся від калюж і злих псів. Сповіщення про тривогу самі не зникають — змахни їх, інакше забʼють екран.',
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
    },
    en: {
      title: 'Walking the dog',
      hint: 'Swipe ← → · dismiss alerts',
      score: (d, s) => `${d | 0} m · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Dog walk',
      overlayBody: 'Dodge puddles and angry dogs. Air-raid alerts do not auto-dismiss — swipe them away or they fill the screen.',
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

  // --- state ---
  const LANES = 3;
  let lane = 1;
  let laneF = 1; // smoothed
  let dogLaneF = 1;
  let speed = 26; // world z units / sec
  const SPEED0 = 26, SPEED_MAX = 58;
  let distance = 0, score = 0, lives = 3;
  let running = false, dead = false, invuln = 0, shake = 0;
  let spawnAcc = 0, notifAcc = 0, notifRate = 3.2;
  let obstacles = [];
  let scenery = [];
  let roadPhase = 0; // scroll of lane dashes / asphalt bands

  const notifRoot = document.getElementById('notifs');
  let notifs = [];

  function resetGame() {
    lane = 1; laneF = 1; dogLaneF = 1;
    speed = SPEED0; distance = 0; score = 0; lives = 3;
    invuln = 0; spawnAcc = 0; notifAcc = 0; notifRate = 3.2;
    obstacles = []; roadPhase = 0; shake = 0; dead = false;
    seedScenery();
    clearNotifs();
  }

  function clearNotifs() {
    notifs.forEach((n) => n.el.remove());
    notifs = [];
  }

  function gameOver() {
    running = false;
    dead = true;
    applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function hit() {
    if (invuln > 0) return;
    lives -= 1;
    invuln = 1.15;
    shake = 12;
    if (lives <= 0) gameOver();
  }

  // --- scenery strips along Z (recycled) ---
  function seedScenery() {
    scenery = [];
    const kinds = ['khrush', 'garage', 'tree', 'lamp', 'hedge'];
    for (let i = 0; i < 28; i++) {
      const z = 8 + i * 2.6 + Math.random() * 1.2;
      scenery.push({
        kind: kinds[i % kinds.length],
        side: i % 2 === 0 ? -1 : 1,
        z,
        variant: (Math.random() * 3) | 0,
      });
      if (Math.random() < 0.35) {
        scenery.push({
          kind: kinds[(i + 2) % kinds.length],
          side: i % 2 === 0 ? 1 : -1,
          z: z + 0.8,
          variant: (Math.random() * 3) | 0,
        });
      }
    }
  }

  function spawnObstacle() {
    const kind = Math.random() < 0.55 ? 'puddle' : 'dog';
    let l = (Math.random() * LANES) | 0;
    const near = obstacles.filter((o) => o.z > Z_FAR - 12);
    if (near.some((o) => o.lane === l && Math.abs(o.z - Z_FAR) < 6)) {
      l = (l + 1 + ((Math.random() * 2) | 0)) % LANES;
    }
    obstacles.push({ kind, lane: l, z: Z_FAR + Math.random() * 4, hit: false });
  }

  // --- notifications (unchanged behaviour) ---
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
      setTimeout(() => {
        el.remove();
        notifs = notifs.filter((n) => n !== state);
        score += 25;
      }, 160);
    };
    const onDown = (e) => {
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      state.dragging = true; state.startX = p.clientX; state.dx = 0;
      el.classList.add('swiping');
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!state.dragging) return;
      const p = e.touches ? e.touches[0] : e;
      state.dx = p.clientX - state.startX;
      el.style.transform = `translateX(${state.dx}px)`;
    };
    const onUp = () => {
      if (!state.dragging) return;
      state.dragging = false;
      el.classList.remove('swiping');
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
    resetGame();
    running = true;
    document.getElementById('overlay').classList.add('hidden');
    applyLang();
  });

  // --- drawing primitives ---
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
    g.addColorStop(0, '#0b1224');
    g.addColorStop(0.55, '#1e293b');
    g.addColorStop(1, '#64748b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 40);
    // faint evening wash
    ctx.fillStyle = '#f59e0b18';
    ctx.fillRect(0, HORIZON - 40, W, 50);
  }

  function drawRoad() {
    // scanline road from far (horizon) to near (bottom)
    const yBottom = H + 8;
    for (let y = HORIZON; y < yBottom; y++) {
      const row = y - HORIZON + 1;
      // invert project: y = Hzn + CAM_H*FOCAL/z  => z = CAM_H*FOCAL/(y-Hzn)
      const z = (CAM_H * FOCAL) / row;
      if (z < Z_NEAR - 0.5 || z > Z_FAR + 8) continue;

      const left = roadEdgeX(-1, z);
      const right = roadEdgeX(1, z);
      // courtyard dirt shoulders
      ctx.fillStyle = '#44403c';
      ctx.fillRect(0, y, Math.max(0, left), 1);
      ctx.fillRect(right, y, Math.max(0, W - right), 1);
      // asphalt banding for scroll feel
      const band = (((z * 3 + roadPhase) | 0) % 2) === 0;
      ctx.fillStyle = band ? '#3f3f46' : '#52525b';
      ctx.fillRect(left, y, Math.max(1, right - left), 1);

      // curb / hazard edges
      const curb = Math.max(2, (right - left) * 0.03);
      ctx.fillStyle = ((z * 4 + roadPhase * 2) | 0) % 2 ? '#eab308' : '#111';
      ctx.fillRect(left, y, curb, 1);
      ctx.fillRect(right - curb, y, curb, 1);

      // lane dividers
      const x0 = project(LANE_X[0] * 0.5 + LANE_X[1] * 0.5, z).x; // between 0-1 ≈ mid of left divider
      // better: dividers at midpoints between lanes
      const d1 = project((-1.35 + 0) / 2, z).x;
      const d2 = project((0 + 1.35) / 2, z).x;
      const dashOn = ((z * 2.2 + roadPhase) % 2.4) < 1.3;
      if (dashOn) {
        ctx.fillStyle = '#e2e8f0';
        const tw = Math.max(1.2, (right - left) * 0.012);
        ctx.fillRect(d1 - tw / 2, y, tw, 1);
        ctx.fillRect(d2 - tw / 2, y, tw, 1);
      }
    }
  }

  function drawSceneryItem(s) {
    if (s.z < Z_NEAR || s.z > Z_FAR) return;
    const wx = s.side * (ROAD_HALF + 0.55 + (s.kind === 'tree' ? 0.25 : 0.1));
    const p = project(wx, s.z);
    const sc = p.s;
    const baseY = p.y;

    if (s.kind === 'khrush') {
      const bw = sc * 1.1, bh = sc * 1.8;
      ctx.fillStyle = s.variant === 0 ? '#b45309' : s.variant === 1 ? '#a8a29e' : '#ca8a04';
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      // windows
      ctx.fillStyle = '#1e3a5f';
      const cols = 3, rows = 4;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.fillRect(p.x - bw / 2 + bw * (0.12 + c * 0.28), baseY - bh + bh * (0.12 + r * 0.2), bw * 0.14, bh * 0.1);
      }
    } else if (s.kind === 'garage') {
      const bw = sc * 0.95, bh = sc * 0.7;
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(p.x - bw / 2, baseY - bh, bw, bh);
      ctx.fillStyle = '#14532d';
      ctx.fillRect(p.x - bw * 0.35, baseY - bh * 0.75, bw * 0.7, bh * 0.55);
    } else if (s.kind === 'tree') {
      const th = sc * 1.4;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(p.x - sc * 0.08, baseY - th * 0.45, sc * 0.16, th * 0.45);
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(p.x, baseY - th * 0.55, sc * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'lamp') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(p.x - sc * 0.05, baseY - sc * 1.5, sc * 0.1, sc * 1.5);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(p.x, baseY - sc * 1.55, sc * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'hedge') {
      ctx.fillStyle = '#14532d';
      ctx.fillRect(p.x - sc * 0.55, baseY - sc * 0.45, sc * 1.1, sc * 0.45);
    }
  }

  function drawPuddle(laneIdx, z) {
    const p = project(LANE_X[laneIdx], z);
    const w = p.s * 0.85, h = p.s * 0.28;
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#93c5fd88';
    ctx.beginPath();
    ctx.ellipse(p.x - w * 0.2, p.y - h * 0.2, w * 0.25, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAngryDog(laneIdx, z) {
    const p = project(LANE_X[laneIdx], z);
    const s = p.s * 0.55;
    // seen roughly from front/above as they run toward camera
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.15, s * 0.45, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(p.x - s * 0.45, p.y - s * 0.7, s * 0.9, s * 0.55);
    ctx.fillRect(p.x - s * 0.35, p.y - s * 1.05, s * 0.7, s * 0.4); // head
    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(p.x - s * 0.18, p.y - s * 0.95, s * 0.12, s * 0.12);
    ctx.fillRect(p.x + s * 0.06, p.y - s * 0.95, s * 0.12, s * 0.12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(p.x - s * 0.2, p.y - s * 0.72, s * 0.4, s * 0.1);
    // ears
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(p.x - s * 0.4, p.y - s * 1.2, s * 0.2, s * 0.25);
    ctx.fillRect(p.x + s * 0.2, p.y - s * 1.2, s * 0.2, s * 0.25);
  }

  function drawPlayerAndDog() {
    const playerWX = lerpLane(laneF);
    const dogWX = lerpLane(dogLaneF);

    const pp = project(playerWX, Z_PLAYER);
    const dp = project(dogWX, Z_DOG);

    // leash
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = Math.max(1.5, pp.s * 0.04);
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - pp.s * 0.35);
    ctx.quadraticCurveTo((pp.x + dp.x) / 2, (pp.y + dp.y) / 2 + pp.s * 0.1, dp.x, dp.y - dp.s * 0.25);
    ctx.stroke();

    // dog from behind
    drawFriendlyDog(dp.x, dp.y, dp.s * 0.5);

    // player from behind (blink if invuln)
    if (!(invuln > 0 && ((invuln * 18) | 0) % 2 === 0)) {
      drawPlayerBack(pp.x, pp.y, pp.s * 0.55);
    }
  }

  function lerpLane(f) {
    const a = Math.floor(f);
    const b = Math.min(2, a + 1);
    const t = f - a;
    return LANE_X[a] + (LANE_X[b] - LANE_X[a]) * t;
  }

  function drawPlayerBack(x, y, s) {
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.1, s * 0.4, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - s * 0.28, y - s * 0.15, s * 0.2, s * 0.35);
    ctx.fillRect(x + s * 0.08, y - s * 0.15, s * 0.2, s * 0.35);
    // coat back
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x - s * 0.35, y - s * 0.85, s * 0.7, s * 0.7);
    // head
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(x - s * 0.28, y - s * 1.25, s * 0.56, s * 0.42);
    // beanie
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x - s * 0.3, y - s * 1.4, s * 0.6, s * 0.22);
  }

  function drawFriendlyDog(x, y, s) {
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.08, s * 0.4, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x - s * 0.35, y - s * 0.55, s * 0.7, s * 0.45);
    // head (back of head / slight turn)
    ctx.fillRect(x - s * 0.22, y - s * 0.85, s * 0.5, s * 0.35);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x - s * 0.28, y - s * 0.15, s * 0.18, s * 0.28);
    ctx.fillRect(x + s * 0.1, y - s * 0.15, s * 0.18, s * 0.28);
    // ears
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - s * 0.25, y - s * 1.0, s * 0.16, s * 0.22);
    ctx.fillRect(x + s * 0.12, y - s * 1.0, s * 0.16, s * 0.22);
    // tail
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x - s * 0.5, y - s * 0.45, s * 0.18, s * 0.12);
  }

  function draw() {
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    drawSky();
    // dirt / courtyard ground under road (shoulders filled inside drawRoad)
    ctx.fillStyle = '#292524';
    ctx.fillRect(0, HORIZON, W, H - HORIZON);

    drawRoad();

    // depth-sort scenery + obstacles (far → near)
    const deco = scenery.map((s) => ({ z: s.z, draw: () => drawSceneryItem(s) }));
    for (const o of obstacles) {
      if (o.kind === 'puddle') deco.push({ z: o.z, draw: () => drawPuddle(o.lane, o.z) });
      else deco.push({ z: o.z, draw: () => drawAngryDog(o.lane, o.z) });
    }
    deco.sort((a, b) => b.z - a.z);
    for (const d of deco) d.draw();

    drawPlayerAndDog();

    // vignette when many notifs
    if (notifs.length >= 4) {
      ctx.fillStyle = 'rgba(127,29,29,0.16)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function update(dt) {
    if (!running) return;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);

    // smooth lane
    laneF += (lane - laneF) * Math.min(1, 12 * dt);
    dogLaneF += (laneF - dogLaneF) * Math.min(1, 7 * dt);

    speed = Math.min(SPEED_MAX, SPEED0 + distance * 0.04);
    const dz = speed * dt;
    roadPhase += dz * 0.85;
    distance += dz * 1.15;
    score += dz * 0.7;

    // move world toward camera
    for (const o of obstacles) o.z -= dz;
    for (const s of scenery) {
      s.z -= dz;
      if (s.z < Z_NEAR - 1) s.z += (Z_FAR - Z_NEAR) + Math.random() * 4;
    }
    obstacles = obstacles.filter((o) => o.z > Z_NEAR - 1.2);

    // spawn
    spawnAcc += dt;
    const every = Math.max(0.4, 1.05 - distance / 500);
    if (spawnAcc >= every) {
      spawnAcc = 0;
      spawnObstacle();
      if (Math.random() < 0.28) spawnObstacle();
    }

    // collisions near player plane
    for (const o of obstacles) {
      if (o.hit) continue;
      if (o.z < Z_PLAYER + 1.1 && o.z > Z_PLAYER - 1.4) {
        if (Math.abs(o.lane - laneF) < 0.55) {
          o.hit = true;
          hit();
        }
      }
    }

    // notifications
    notifAcc += dt;
    notifRate = Math.max(0.85, 3.2 - distance / 220);
    if (notifAcc >= notifRate) {
      notifAcc = 0;
      spawnNotif();
    }
    if (notifs.length >= 6) {
      if (!update._nDrain) update._nDrain = 0;
      update._nDrain += dt;
      if (update._nDrain > 2.5) { update._nDrain = 0; hit(); }
    } else update._nDrain = 0;

    document.getElementById('scoreLine').textContent = t().score(distance, score);
    document.getElementById('livesLine').textContent = t().lives(lives);
  }

  // --- loop ---
  let last = performance.now();
  let frames = 0, fpsT = 0, fps = 0;
  const fpsSamples = [];
  window.__runner = {
    getFps: () => fps,
    getFpsSamples: () => fpsSamples.slice(),
    start: () => document.getElementById('oBtn').click(),
    getState: () => ({ distance, score, lives, running, dead, notifs: notifs.length, obstacles: obstacles.length, perspective: true }),
  };

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    frames++;
    fpsT += dt;
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
