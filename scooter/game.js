/* One Day in Kyiv — scooter side-scroller v2 (portrait + terrain) */
(function () {
  'use strict';

  // Logical portrait canvas (9:16-ish). Physical pixels via devicePixelRatio — no CSS squash.
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
    ctx.imageSmoothingEnabled = false;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const BASE_Y = H - 120; // baseline asphalt level (world y of flat road surface)
  const GRAV = 1850;
  const JUMP_V = -560;
  const ACCEL = 400;
  const BRAKE = 560;
  const DRAG = 60;
  const V_MAX = 300;
  const V_MIN = 36;
  const COYOTE = 0.14;
  const START_LIVES = 5;
  const INVULN = 2.0;
  const PLAYER_W = 30, PLAYER_H = 40;
  const STEP_CLIMB = 16; // small curb climb without jump if slow
  const STEP_CRASH = 22; // taller face needs jump

  const I18N = {
    ua: {
      title: 'Самокат додому',
      hint: '▶ газ · ⬆ стрибок · ◀ гальмо',
      score: (d, s) => `${d | 0} м · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Самокат',
      overlayBody: 'Катись Лівобережжям: газ, стрибок, гальмо. Рельєф — схили й бордюри; клумби, генератори; на дахи автів можна застрибнути.',
      start: 'Старт', again: 'Ще раз', overTitle: 'Упав',
      overBody: (d, s) => `Дистанція ${d | 0} м · рахунок ${s | 0}`,
      pause: 'Пауза', pauseBody: 'Торкніться, щоб продовжити',
    },
    en: {
      title: 'Scooter home',
      hint: '▶ accel · ⬆ jump · ◀ brake',
      score: (d, s) => `${d | 0} m · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Scooter',
      overlayBody: 'Ride left→right: accel, jump, brake. Terrain slopes & curb steps; flower beds, generators; jump onto car roofs.',
      start: 'Start', again: 'Again', overTitle: 'Wiped out',
      overBody: (d, s) => `Distance ${d | 0} m · score ${s | 0}`,
      pause: 'Paused', pauseBody: 'Tap to resume',
    },
  };

  let lang = localStorage.getItem('scooter-lang') || 'ua';
  const t = () => I18N[lang];

  let running = false, dead = false, paused = false;
  let time = 0, distance = 0, score = 0, lives = START_LIVES;
  let invuln = 0, shake = 0, coyote = 0;
  let input = { accel: false, brake: false, jump: false, jumpBuffered: 0 };

  let px = 60, py = BASE_Y - PLAYER_H, vx = 90, vy = 0;
  let onGround = true, wheelPhase = 0, groundSlope = 0;

  /** Terrain keypoints: sorted by x. y = surface height (smaller y = higher up screen / raised road). */
  let terrain = [];
  /** Props sitting on terrain: flower, generator, car */
  let objs = [];
  let spawnX = 300;

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
      document.getElementById('oTitle').textContent = dead ? L.overTitle : L.overlayTitle;
      document.getElementById('oBody').textContent = dead ? L.overBody(distance, score) : L.overlayBody;
      document.getElementById('oBtn').textContent = dead ? L.again : L.start;
    }
  }
  document.getElementById('lang').addEventListener('click', () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('scooter-lang', lang);
    applyLang();
  });

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

  function groundY(wx) {
    // interpolate terrain polyline
    if (!terrain.length) return BASE_Y;
    if (wx <= terrain[0].x) return terrain[0].y;
    for (let i = 1; i < terrain.length; i++) {
      const a = terrain[i - 1], b = terrain[i];
      if (wx <= b.x) {
        const t = (wx - a.x) / Math.max(1e-6, b.x - a.x);
        return a.y + (b.y - a.y) * t;
      }
    }
    return terrain[terrain.length - 1].y;
  }

  function groundSlopeAt(wx) {
    const d = 10;
    const raw = (groundY(wx + d) - groundY(wx - d)) / (2 * d);
    // ignore near-vertical curb faces for speed assist
    if (Math.abs(raw) > 0.8) return 0;
    return raw;
  }

  /** Face height of an upcoming step (positive = must climb). */
  function stepFaceAhead(wx, look) {
    let maxUp = 0;
    for (let i = 1; i < terrain.length; i++) {
      const a = terrain[i - 1], b = terrain[i];
      if (b.x < wx || a.x > wx + look) continue;
      // abrupt rise in world y-up terms means smaller screen-y
      const dy = a.y - b.y; // positive if going up a curb
      const span = b.x - a.x;
      if (span < 18 && dy > maxUp) maxUp = dy;
    }
    return maxUp;
  }

  function pushTerrain(x, y, kind) {
    terrain.push({ x, y, kind: kind || 'flat' });
  }

  function seedCourse() {
    terrain = [];
    objs = [];
    spawnX = 0;
    // long flat intro
    pushTerrain(0, BASE_Y, 'flat');
    pushTerrain(380, BASE_Y, 'flat');
    spawnX = 380;
    // early showcase cars (side silhouettes) — close so they appear soon
    {
      const ox = spawnX + 20;
      const gy = BASE_Y;
      objs.push({ kind: 'car', type: 'sedan', x: ox, w: 100, h: 48, y: gy, hit: false });
      objs.push({ kind: 'car', type: 'hatch', x: ox + 118, w: 82, h: 44, y: gy, hit: false });
      objs.push({ kind: 'car', type: 'van', x: ox + 230, w: 112, h: 60, y: gy, hit: false });
      spawnX = ox + 380;
      pushTerrain(spawnX, BASE_Y, 'flat');
    }
    // early curb: sidewalk → roadway (down) → sidewalk (up), then a smooth hill
    {
      const y0 = BASE_Y, step = 28;
      const x1 = spawnX + 20;
      const x2 = x1 + 160; // long lowered roadway so the step is obvious
      const x3 = x2 + 10;
      pushTerrain(x1, y0, 'step');
      pushTerrain(x1 + 3, y0 + step, 'step');
      pushTerrain(x2, y0 + step, 'flat');
      pushTerrain(x2 + 3, y0, 'step');
      pushTerrain(x3, y0, 'flat');
      spawnX = x3 + 50;
      pushTerrain(spawnX, y0, 'flat');
      const mid = spawnX + 100, end = mid + 110, rise = 48;
      pushTerrain(spawnX + 15, y0, 'slope');
      pushTerrain(mid, y0 - rise, 'slope');
      pushTerrain(end, y0, 'slope');
      spawnX = end + 50;
      pushTerrain(spawnX, y0, 'flat');
    }
    for (let i = 0; i < 8; i++) spawnChunk(true);
  }

  function spawnChunk(easy) {
    const gap = easy ? (140 + Math.random() * 100) : (100 + Math.random() * 90);
    const x0 = spawnX;
    const y0 = terrain[terrain.length - 1].y;
    spawnX = x0 + gap;
    pushTerrain(spawnX, y0, 'flat');

    const r = Math.random();
    // Terrain features ~40%, props ~60%
    if (r < 0.22) {
      // smooth hill (rise then fall) — slope
      const rise = 28 + Math.random() * 36;
      const mid = spawnX + 70 + Math.random() * 40;
      const end = mid + 80 + Math.random() * 50;
      pushTerrain(spawnX + 20, y0, 'slope');
      pushTerrain(mid, y0 - rise, 'slope');
      pushTerrain(end, y0, 'slope');
      spawnX = end + 40;
      pushTerrain(spawnX, y0, 'flat');
    } else if (r < 0.40) {
      // curb / roadway step: down then up (or up then down)
      const step = 18 + Math.random() * 16;
      const down = Math.random() < 0.55;
      const y1 = down ? y0 + step : y0 - step;
      const x1 = spawnX + 8;
      const x2 = x1 + 90 + Math.random() * 70;
      const x3 = x2 + 8;
      pushTerrain(x1, y0, 'step');
      pushTerrain(x1 + 2, y1, 'step'); // sharp face
      pushTerrain(x2, y1, 'flat');
      pushTerrain(x2 + 2, y0, 'step'); // return face
      pushTerrain(x3, y0, 'flat');
      spawnX = x3 + 50;
      pushTerrain(spawnX, y0, 'flat');
    } else {
      // prop on current flat
      const kind = easy
        ? (Math.random() < 0.45 ? 'car' : Math.random() < 0.5 ? 'flower' : 'generator')
        : (Math.random() < 0.4 ? 'car' : Math.random() < 0.45 ? 'flower' : 'generator');
      const ox = spawnX + 30;
      const gy = groundY(ox);
      if (kind === 'car') {
        const type = ['sedan', 'hatch', 'van'][(Math.random() * 3) | 0];
        const w = type === 'van' ? 110 : type === 'hatch' ? 78 : 96;
        const h = type === 'van' ? 58 : type === 'hatch' ? 42 : 46;
        objs.push({ kind: 'car', type, x: ox, w, h, y: gy, hit: false });
        if (Math.random() < 0.5) {
          const t2 = ['sedan', 'hatch', 'van'][(Math.random() * 3) | 0];
          const w2 = t2 === 'van' ? 108 : t2 === 'hatch' ? 76 : 94;
          const h2 = t2 === 'van' ? 56 : 44;
          objs.push({ kind: 'car', type: t2, x: ox + w + 22, w: w2, h: h2, y: gy, hit: false });
          spawnX = ox + w + w2 + 80;
        } else spawnX = ox + w + 60;
      } else if (kind === 'flower') {
        objs.push({ kind: 'flower', x: ox, w: 50, h: 24, y: gy, hit: false });
        spawnX = ox + 80;
      } else {
        objs.push({ kind: 'generator', x: ox, w: 36, h: 40, y: gy, phase: Math.random() * 6, hit: false });
        spawnX = ox + 70;
      }
      pushTerrain(spawnX, y0, 'flat');
    }
  }

  function roofY(o) { return o.y - o.h; }

  function solidTopAt(wx) {
    let best = groundY(wx);
    for (const o of objs) {
      if (o.kind !== 'car') continue;
      if (wx >= o.x + 4 && wx <= o.x + o.w - 4) {
        const top = roofY(o);
        if (top < best) best = top;
      }
    }
    return best;
  }

  function feetX() { return px + PLAYER_W * 0.55; }
  function feetY() { return py + PLAYER_H; }

  function hit() {
    if (invuln > 0) return;
    lives -= 1; invuln = INVULN; shake = 10;
    vx *= 0.4; vy = Math.min(vy, -140);
    if (lives <= 0) gameOver();
  }

  function gameOver() {
    running = false; dead = true; paused = false;
    pauseOverlay.classList.remove('show');
    syncPauseBtn(); applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function resetGame() {
    running = false; dead = false; paused = false;
    pauseOverlay.classList.remove('show');
    time = 0; distance = 0; score = 0; lives = START_LIVES;
    invuln = 0; shake = 0; coyote = 0;
    px = 60; vx = 100; vy = 0; onGround = true; wheelPhase = 0; groundSlope = 0;
    seedCourse();
    py = groundY(px) - PLAYER_H;
    syncPauseBtn(); applyLang();
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function tryLand(dt) {
    const fx = feetX();
    const fy = feetY();
    const top = solidTopAt(fx);
    if (vy >= -20 && fy >= top && fy <= top + Math.max(16, Math.abs(vy) * dt + 10)) {
      py = top - PLAYER_H;
      vy = 0;
      onGround = true;
      coyote = COYOTE;
      return true;
    }
    return false;
  }

  function hazardHits() {
    const pb = { x: px + 6, y: py + 4, w: PLAYER_W - 10, h: PLAYER_H - 8 };
    for (const o of objs) {
      if (o.hit) continue;
      if (o.kind === 'flower' || o.kind === 'generator') {
        let oy = o.y - o.h, oh = o.h;
        if (o.kind === 'generator') {
          const bob = Math.abs(Math.sin(time * 10 + o.phase)) * 10;
          oy = o.y - o.h - bob; oh = o.h + 4;
        }
        if (pb.y + pb.h <= oy + 6) continue;
        if (aabb(pb, { x: o.x, y: oy, w: o.w, h: oh })) { o.hit = true; hit(); }
      } else if (o.kind === 'car') {
        const top = roofY(o);
        if (pb.y + pb.h <= top + 10) continue; // on roof
        if (pb.x + pb.w > o.x && pb.x < o.x + 14 && pb.y + pb.h > top + 12 && vx > 40) {
          o.hit = true; hit();
        }
      }
    }
  }

  function update(dt) {
    if (!running || paused) return;
    time += dt;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);
    if (input.jumpBuffered > 0) input.jumpBuffered -= dt;

    groundSlope = groundSlopeAt(feetX());

    // accel / brake / slope assist
    if (input.accel) vx += ACCEL * dt;
    if (input.brake) vx -= BRAKE * dt;
    if (!input.accel && !input.brake) vx -= Math.sign(vx || 1) * DRAG * dt;
    // downhill accelerates, uphill slows — clamp so curb faces don't explode physics
    if (onGround) {
      const s = Math.max(-0.55, Math.min(0.55, groundSlope));
      vx += (-s) * 380 * dt;
    }
    if (!input.brake && vx < V_MIN && onGround) vx = V_MIN;
    if (vx > V_MAX) vx = V_MAX;
    if (vx < -30) vx = -30;

    // step-up: tall faces need jump (or crash if slamming); small faces bump/climb
    if (onGround && vx > 20) {
      const face = stepFaceAhead(feetX(), Math.max(16, vx * dt + 12));
      if (face >= STEP_CRASH) {
        // approaching a tall curb face — if not already jumping clear, bump hard
        if (vx > 100) { hit(); vx *= 0.3; }
        else { vx *= 0.45; py = groundY(feetX()) - PLAYER_H; }
      } else if (face >= STEP_CLIMB) {
        // forgiving small curb climb
        py = Math.min(py, groundY(feetX() + 10) - PLAYER_H);
      }
    }

    px += vx * dt;
    distance = Math.max(distance, (px - 60) * 0.085);
    score += Math.max(0, vx) * dt * 0.12;

    if (onGround) coyote = COYOTE; else coyote -= dt;
    if (input.jumpBuffered > 0 && coyote > 0) {
      vy = JUMP_V;
      onGround = false; coyote = 0; input.jumpBuffered = 0;
    }

    vy += GRAV * dt;
    if (vy > 980) vy = 980;
    py += vy * dt;

    onGround = false;
    // swept land against terrain + car roofs (prevents tunneling on curb drops)
    {
      const fx = feetX();
      const top = solidTopAt(fx);
      const fy = feetY();
      const pad = Math.max(18, Math.abs(vy) * dt + 12);
      if (vy >= -40 && fy >= top - 2 && fy <= top + pad) {
        py = top - PLAYER_H;
        vy = 0;
        onGround = true;
        coyote = COYOTE;
      } else if (fy > top + 6 && vy >= 0) {
        // below surface (tunneled) — snap onto it
        py = top - PLAYER_H;
        vy = 0;
        onGround = true;
        coyote = COYOTE;
      }
    }

    hazardHits();
    wheelPhase += Math.abs(vx) * dt * 0.08;

    // keep props' y synced to terrain under them (for steps that move relative)
    for (const o of objs) {
      if (o.kind === 'car' || o.kind === 'flower' || o.kind === 'generator') {
        // freeze y at spawn terrain — cars sit on the roadway they were spawned on
      }
    }

    const cam = cameraX();
    while (spawnX < cam + W + 700) spawnChunk(distance < 90);
    objs = objs.filter((o) => o.x + o.w > cam - 100);
    // prune old terrain points but keep one behind camera
    while (terrain.length > 3 && terrain[1].x < cam - 200) terrain.shift();

    document.getElementById('scoreLine').textContent = t().score(distance, score);
    document.getElementById('livesLine').textContent = t().lives(lives);
  }

  function cameraX() {
    return Math.max(0, px - W * 0.28); // player in left third
  }

  // ---- draw ----
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    g.addColorStop(0, '#020617');
    g.addColorStop(0.5, '#0f172a');
    g.addColorStop(1, '#1e1b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f044';
    for (let i = 0; i < 28; i++) {
      ctx.fillRect((i * 97) % (W - 4) + 2, 10 + (i * 41) % 120, 1.5, 1.5);
    }
  }

  function drawSkyline(cam) {
    const base = BASE_Y - 180;
    for (let layer = 0; layer < 2; layer++) {
      const par = layer === 0 ? 0.12 : 0.22;
      const fill = layer === 0 ? '#15131f' : '#1c1930';
      const stroke = layer === 0 ? '#5c5678' : '#7c7598';
      let x = -((cam * par) % 64) - 30;
      let i = 0;
      while (x < W + 40) {
        const h0 = (i * 7919 + layer * 104729) >>> 0;
        const bw = 20 + (h0 % 34);
        const bh = 40 + (h0 % 70) + layer * 14;
        ctx.fillStyle = fill;
        ctx.fillRect(x, base - bh + layer * 10, bw, bh + 40);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 0.5, base - bh + layer * 10 + 0.5, bw - 1, bh + 39);
        const cols = 2 + (h0 % 3), rows = 3 + (h0 % 4);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (((h0 >> (r + c)) & 1) === 0) continue;
          ctx.fillStyle = (h0 + r + c) % 5 === 0 ? '#93c5fd99' : '#fbbf24cc';
          ctx.fillRect(x + 3 + c * ((bw - 6) / cols), base - bh + layer * 10 + 5 + r * ((bh - 10) / rows), Math.max(2, bw * 0.12), Math.max(2, bh * 0.07));
        }
        x += bw + 2 + (h0 % 6);
        i++;
      }
    }
  }

  function drawTerrain(cam) {
    // filled asphalt under polyline
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    let started = false;
    const x0 = cam - 20;
    const x1 = cam + W + 20;
    // densify samples for smooth slopes
    for (let x = x0; x <= x1; x += 4) {
      const y = groundY(x);
      const sx = x - cam;
      if (!started) { ctx.lineTo(sx, y); started = true; }
      else ctx.lineTo(sx, y);
    }
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = '#14101c';
    ctx.fill();
    // surface edge
    ctx.beginPath();
    started = false;
    for (let x = x0; x <= x1; x += 3) {
      const y = groundY(x);
      const sx = x - cam;
      if (!started) { ctx.moveTo(sx, y); started = true; }
      else ctx.lineTo(sx, y);
    }
    ctx.strokeStyle = '#3f3a4a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // curb highlight on sharp faces
    for (let i = 1; i < terrain.length; i++) {
      const a = terrain[i - 1], b = terrain[i];
      if (b.x < cam - 10 || a.x > cam + W + 10) continue;
      if (b.x - a.x < 16 && Math.abs(b.y - a.y) > 12) {
        ctx.strokeStyle = '#a8a29e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x - cam, a.y);
        ctx.lineTo(b.x - cam, b.y);
        ctx.stroke();
      }
    }
  }

  function drawLamps(cam) {
    for (let i = 0; i < 10; i++) {
      const wx = i * 200 + 30;
      const sx = wx - cam * 0.95;
      if (sx < -30 || sx > W + 30) continue;
      const gy = groundY(wx);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(sx, gy - 100, 4, 100);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath(); ctx.arc(sx + 2, gy - 102, 6, 0, Math.PI * 2); ctx.fill();
      const pool = ctx.createRadialGradient(sx + 2, gy, 0, sx + 2, gy, 60);
      pool.addColorStop(0, 'rgba(253,230,138,0.26)');
      pool.addColorStop(1, 'rgba(253,230,138,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(sx + 2, gy + 2, 60, 12, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCar(o, cam) {
    const sx = o.x - cam;
    const sy = o.y;
    const w = o.w, h = o.h;
    const type = o.type || 'sedan';
    const bodyCol = type === 'van' ? '#3f6212' : type === 'hatch' ? '#9f1239' : '#1d4ed8';
    const trim = type === 'van' ? '#a3e635' : type === 'hatch' ? '#fda4af' : '#93c5fd';

    // ground shadow
    ctx.fillStyle = '#00000066';
    ctx.beginPath();
    ctx.ellipse(sx + w / 2, sy - 1, w * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // wheels first (behind body lip)
    function wheel(wx) {
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath(); ctx.arc(wx, sy - 9, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, sy - 9, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(wx - 5, sy - 9); ctx.lineTo(wx + 5, sy - 9); ctx.stroke();
    }
    wheel(sx + w * 0.22);
    wheel(sx + w * 0.78);

    // side-view body silhouette
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    if (type === 'sedan') {
      // hood → cabin → trunk
      ctx.moveTo(sx + 4, sy - 12);
      ctx.lineTo(sx + 8, sy - h * 0.48);
      ctx.lineTo(sx + w * 0.26, sy - h * 0.5);
      ctx.lineTo(sx + w * 0.32, sy - h + 2);
      ctx.lineTo(sx + w * 0.66, sy - h + 2);
      ctx.lineTo(sx + w * 0.72, sy - h * 0.5);
      ctx.lineTo(sx + w - 6, sy - h * 0.48);
      ctx.lineTo(sx + w - 2, sy - 12);
      ctx.closePath();
    } else if (type === 'hatch') {
      ctx.moveTo(sx + 5, sy - 12);
      ctx.lineTo(sx + 10, sy - h * 0.46);
      ctx.lineTo(sx + w * 0.28, sy - h * 0.48);
      ctx.lineTo(sx + w * 0.34, sy - h + 2);
      ctx.lineTo(sx + w * 0.72, sy - h + 4);
      ctx.quadraticCurveTo(sx + w - 4, sy - h * 0.55, sx + w - 3, sy - 12);
      ctx.closePath();
    } else {
      // van box
      ctx.moveTo(sx + 5, sy - 12);
      ctx.lineTo(sx + 5, sy - h * 0.55);
      ctx.lineTo(sx + w * 0.18, sy - h * 0.55);
      ctx.lineTo(sx + w * 0.18, sy - h + 2);
      ctx.lineTo(sx + w * 0.78, sy - h + 2);
      ctx.lineTo(sx + w * 0.78, sy - h * 0.55);
      ctx.lineTo(sx + w - 5, sy - h * 0.55);
      ctx.lineTo(sx + w - 5, sy - 12);
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // cabin / windows
    ctx.fillStyle = '#7dd3fcdd';
    if (type === 'van') {
      ctx.fillRect(sx + w * 0.22, sy - h + 6, w * 0.5, h * 0.28);
      // side panel line
      ctx.strokeStyle = '#d9f99d88';
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.22, sy - h * 0.55);
      ctx.lineTo(sx + w * 0.75, sy - h * 0.55);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.34, sy - h + 5);
      ctx.lineTo(sx + w * 0.64, sy - h + 5);
      ctx.lineTo(sx + w * 0.69, sy - h * 0.5);
      ctx.lineTo(sx + w * 0.33, sy - h * 0.5);
      ctx.closePath();
      ctx.fill();
      // window divider
      ctx.strokeStyle = '#0f172a88';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.5, sy - h + 5);
      ctx.lineTo(sx + w * 0.5, sy - h * 0.5);
      ctx.stroke();
    }

    // roof ride strip
    ctx.strokeStyle = '#f8fafccc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const roofL = type === 'van' ? w * 0.2 : w * 0.32;
    const roofR = type === 'van' ? w * 0.76 : w * 0.68;
    ctx.moveTo(sx + roofL, sy - h + 1);
    ctx.lineTo(sx + roofR, sy - h + 1);
    ctx.stroke();

    // headlight (front = right, moving L→R) + taillight
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(sx + w - 10, sy - 26, 7, 8);
    ctx.fillStyle = '#fff7';
    ctx.beginPath();
    ctx.moveTo(sx + w - 3, sy - 22);
    ctx.lineTo(sx + w + 14, sy - 28);
    ctx.lineTo(sx + w + 14, sy - 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(sx + 4, sy - 26, 7, 8);

    // door crease
    ctx.strokeStyle = '#00000044';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.48, sy - h * 0.48);
    ctx.lineTo(sx + w * 0.48, sy - 12);
    ctx.stroke();
  }

  function drawObj(o, cam) {
    const sx = o.x - cam;
    if (sx + o.w < -30 || sx > W + 30) return;
    if (o.kind === 'car') return drawCar(o, cam);
    if (o.kind === 'flower') {
      ctx.fillStyle = '#292524';
      ctx.fillRect(sx, o.y - 10, o.w, 10);
      ctx.fillStyle = '#14532d';
      ctx.fillRect(sx + 2, o.y - o.h, o.w - 4, o.h - 8);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ['#f472b6', '#facc15', '#fb7185', '#a78bfa'][i % 4];
        ctx.beginPath();
        ctx.arc(sx + 8 + i * ((o.w - 12) / 4), o.y - o.h + 6, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.kind === 'generator') {
      const bob = Math.abs(Math.sin(time * 10 + o.phase)) * 10;
      const y = o.y - o.h - bob;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(sx, y, o.w, o.h);
      ctx.fillStyle = '#374151';
      ctx.fillRect(sx + 4, y + 6, o.w - 8, 10);
      ctx.fillStyle = (Math.floor(time * 8 + o.phase) % 2) ? '#ef4444' : '#fbbf24';
      ctx.fillRect(sx + o.w - 10, y + 4, 6, 5);
      ctx.fillStyle = '#94a3b866';
      ctx.beginPath(); ctx.arc(sx + 8, y - 4, 4 + bob * 0.15, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlayer(cam) {
    if (invuln > 0 && ((invuln * 16) | 0) % 2 === 0) return;
    const sx = px - cam;
    const sy = py;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(sx + 2, sy + PLAYER_H - 11, PLAYER_W - 2, 5);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(sx + 9, sy + PLAYER_H - 5, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + PLAYER_W - 4, sy + PLAYER_H - 5, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy + PLAYER_H - 5);
    ctx.lineTo(sx + 9 + Math.cos(wheelPhase) * 4, sy + PLAYER_H - 5 + Math.sin(wheelPhase) * 4);
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx + PLAYER_W - 6, sy + PLAYER_H - 11);
    ctx.lineTo(sx + PLAYER_W - 4, sy + 8);
    ctx.lineTo(sx + PLAYER_W + 5, sy + 6);
    ctx.stroke();
    ctx.fillStyle = '#b45309';
    ctx.fillRect(sx + 8, sy + 12, 15, 16);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath(); ctx.arc(sx + 15, sy + 10, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(sx + 10, sy + 14, 12, 3);
  }

  function draw() {
    const cam = cameraX();
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    drawSky();
    drawSkyline(cam);
    drawTerrain(cam);
    drawLamps(cam);
    for (const o of objs) drawObj(o, cam);
    drawPlayer(cam);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- input ----
  function bindHold(el, key) {
    const down = (e) => { e.preventDefault(); input[key] = true; if (key === 'jump') input.jumpBuffered = 0.16; el.classList.add('held'); };
    const up = (e) => { e.preventDefault(); input[key] = false; el.classList.remove('held'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }
  bindHold(document.getElementById('btnAccel'), 'accel');
  bindHold(document.getElementById('btnBrake'), 'brake');
  bindHold(document.getElementById('btnJump'), 'jump');

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { input.accel = true; e.preventDefault(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { input.brake = true; e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      input.jump = true; input.jumpBuffered = 0.16; e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); }
    if (e.code === 'Enter' && !running) document.getElementById('oBtn').click();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.accel = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.brake = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jump = false;
  });

  document.getElementById('oBtn').addEventListener('click', () => {
    resetGame(); running = true;
    document.getElementById('overlay').classList.add('hidden');
    syncPauseBtn(); applyLang();
  });

  let last = performance.now();
  let frames = 0, fpsT = 0, fps = 0;
  const fpsSamples = [];

  window.__scooter = {
    getFps: () => fps,
    getFpsSamples: () => fpsSamples.slice(),
    start: () => document.getElementById('oBtn').click(),
    setPaused: (v) => setPaused(!!v),
    getState: () => ({
      distance, score, lives, running, dead, paused, vx, vy, px, py, onGround,
      objs: objs.length, terrain: terrain.length, time, W, H,
    }),
    press: (name, on) => {
      if (name === 'accel') input.accel = !!on;
      if (name === 'brake') input.brake = !!on;
      if (name === 'jump') { input.jump = !!on; if (on) input.jumpBuffered = 0.18; }
    },
    peekHazards: () => objs.filter((o) => o.x > px - 20 && o.x < px + 280).map((o) => ({
      kind: o.kind, type: o.type, x: o.x, w: o.w, h: o.h, dx: o.x - px, roof: o.kind === 'car' ? roofY(o) : null,
      gy: o.y,
    })),
    peekTerrain: () => {
      const fx = feetX();
      return { gy: groundY(fx), slope: groundSlopeAt(fx), face: stepFaceAhead(fx, 40) };
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
