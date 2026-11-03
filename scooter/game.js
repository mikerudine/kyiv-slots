/* One Day in Kyiv — scooter side-scroller v1 */
(function () {
  'use strict';

  const W = 640, H = 360;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const GROUND = H - 52;
  const GRAV = 1650;
  const JUMP_V = -520;
  const ACCEL = 380;
  const BRAKE = 520;
  const DRAG = 55;
  const V_MAX = 320;
  const V_MIN = 40; // idle roll when not braking hard
  const COYOTE = 0.12;
  const START_LIVES = 5;
  const INVULN = 2.0;
  const PLAYER_W = 28, PLAYER_H = 36;

  const I18N = {
    ua: {
      title: 'Самокат додому',
      hint: '▶ газ · ⬆ стрибок · ◀ гальмо',
      score: (d, s) => `${d | 0} м · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Самокат',
      overlayBody: 'Катись Лівобережжям додому: газ, стрибок, гальмо. Порожки, горки, генератори, клумби й припарковані авта — на дахи можна застрибнути й їхати по них.',
      start: 'Старт',
      again: 'Ще раз',
      overTitle: 'Упав',
      overBody: (d, s) => `Дистанція ${d | 0} м · рахунок ${s | 0}`,
      pause: 'Пауза',
      pauseBody: 'Торкніться, щоб продовжити',
    },
    en: {
      title: 'Scooter home',
      hint: '▶ accel · ⬆ jump · ◀ brake',
      score: (d, s) => `${d | 0} m · ${s | 0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Scooter',
      overlayBody: 'Ride left→right: accelerate, jump, brake. Curbs, ramps, generators, flower beds, parked cars — jump onto roofs and ride along them.',
      start: 'Start',
      again: 'Again',
      overTitle: 'Wiped out',
      overBody: (d, s) => `Distance ${d | 0} m · score ${s | 0}`,
      pause: 'Paused',
      pauseBody: 'Tap to resume',
    },
  };

  let lang = localStorage.getItem('scooter-lang') || 'ua';
  const t = () => I18N[lang];

  let running = false, dead = false, paused = false;
  let time = 0, distance = 0, score = 0, lives = START_LIVES;
  let invuln = 0, shake = 0, coyote = 0;
  let input = { accel: false, brake: false, jump: false, jumpBuffered: 0 };

  // Player in world space; camera follows
  let px = 80, py = GROUND - PLAYER_H, vx = 90, vy = 0;
  let onGround = true, facing = 1;
  let wheelPhase = 0;

  /** @type {Array<{kind:string,x:number,w:number,h:number,y?:number,slope?:number,phase?:number,hit?:boolean}>} */
  let objs = [];
  let spawnX = 420;
  let bgPhase = 0;

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
    if (paused) {
      pauseOverlay.classList.add('show');
      applyLang();
    } else {
      pauseOverlay.classList.remove('show');
      last = performance.now();
    }
  }

  function togglePause() {
    if (!running || dead) return;
    setPaused(!paused);
  }

  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  pauseOverlay.addEventListener('click', () => { if (paused) setPaused(false); });

  function resetGame() {
    running = false; dead = false; paused = false;
    pauseOverlay.classList.remove('show');
    time = 0; distance = 0; score = 0; lives = START_LIVES;
    invuln = 0; shake = 0; coyote = 0;
    px = 80; py = GROUND - PLAYER_H; vx = 100; vy = 0;
    onGround = true; wheelPhase = 0;
    objs = []; spawnX = 380; bgPhase = 0;
    seedCourse();
    syncPauseBtn();
    applyLang();
  }

  function gameOver() {
    running = false; dead = true; paused = false;
    pauseOverlay.classList.remove('show');
    syncPauseBtn();
    applyLang();
    document.getElementById('overlay').classList.remove('hidden');
  }

  function hit() {
    if (invuln > 0) return;
    lives -= 1;
    invuln = INVULN;
    shake = 10;
    vx *= 0.35;
    vy = Math.min(vy, -120);
    if (lives <= 0) gameOver();
  }

  // ---- course generation (forgiving spacing) ----
  function seedCourse() {
    objs = [];
    spawnX = 420;
    // gentle intro
    for (let i = 0; i < 3; i++) spawnChunk(true);
  }

  function spawnChunk(easy) {
    const gap = easy ? (220 + Math.random() * 120) : (160 + Math.random() * 100);
    spawnX += gap;
    const r = Math.random();
    let kind;
    if (easy) {
      if (r < 0.28) kind = 'curb';
      else if (r < 0.48) kind = 'ramp';
      else if (r < 0.68) kind = 'flower';
      else if (r < 0.88) kind = 'car';
      else kind = 'generator';
    } else {
      if (r < 0.18) kind = 'curb';
      else if (r < 0.38) kind = 'ramp';
      else if (r < 0.52) kind = 'flower';
      else if (r < 0.78) kind = 'car';
      else kind = 'generator';
    }

    if (kind === 'curb') {
      objs.push({ kind: 'curb', x: spawnX, w: 36 + Math.random() * 20, h: 14 + Math.random() * 6, y: GROUND });
    } else if (kind === 'ramp') {
      const w = 90 + Math.random() * 50;
      const h = 28 + Math.random() * 22;
      objs.push({ kind: 'ramp', x: spawnX, w, h, y: GROUND, slope: h / w });
      spawnX += w * 0.2;
    } else if (kind === 'flower') {
      objs.push({ kind: 'flower', x: spawnX, w: 48 + Math.random() * 24, h: 22, y: GROUND });
    } else if (kind === 'generator') {
      objs.push({ kind: 'generator', x: spawnX, w: 34, h: 38, y: GROUND, phase: Math.random() * 6 });
    } else if (kind === 'car') {
      // car body + rideable roof; sometimes a second car for roof hopping
      const w = 88 + Math.random() * 36;
      const h = 42 + Math.random() * 10;
      objs.push({ kind: 'car', x: spawnX, w, h, y: GROUND });
      if (Math.random() < 0.55) {
        const w2 = 80 + Math.random() * 30;
        const h2 = 40 + Math.random() * 12;
        objs.push({ kind: 'car', x: spawnX + w + 18 + Math.random() * 28, w: w2, h: h2, y: GROUND });
        spawnX += w + w2 + 40;
        return;
      }
      spawnX += w;
      return;
    }
    spawnX += (kind === 'ramp' ? 40 : 20);
  }

  // ---- surfaces / collision helpers ----
  function roofY(o) {
    if (o.kind === 'car') return o.y - o.h;
    if (o.kind === 'curb') return o.y - o.h;
    if (o.kind === 'ramp') return null; // handled specially
    return null;
  }

  function rampHeightAt(o, wx) {
    const t = (wx - o.x) / o.w;
    if (t < 0 || t > 1) return null;
    return o.y - o.h * t; // rises to the right
  }

  function feetX() { return px + PLAYER_W * 0.55; }
  function feetY() { return py + PLAYER_H; }

  function solidTopAt(wx, ignoreKinds) {
    // Returns highest (smallest y) solid surface under feet at wx, or GROUND
    let best = GROUND;
    for (const o of objs) {
      if (ignoreKinds && ignoreKinds.has(o.kind)) continue;
      if (o.kind === 'ramp') {
        const hy = rampHeightAt(o, wx);
        if (hy != null && hy < best) best = hy;
        continue;
      }
      if (o.kind === 'car' || o.kind === 'curb') {
        if (wx >= o.x + 2 && wx <= o.x + o.w - 2) {
          const top = roofY(o);
          if (top < best) best = top;
        }
      }
    }
    return best;
  }

  function tryLand(dt) {
    const fx = feetX();
    const fy = feetY();
    const top = solidTopAt(fx);
    // land if falling onto surface
    if (vy >= 0 && fy >= top && fy <= top + Math.max(14, Math.abs(vy) * dt + 8) && py + PLAYER_H - top < 22) {
      py = top - PLAYER_H;
      vy = 0;
      onGround = true;
      coyote = COYOTE;
      // ramp launch when near crest while moving fast
      for (const o of objs) {
        if (o.kind !== 'ramp') continue;
        const t = (fx - o.x) / o.w;
        if (t > 0.82 && t < 1.05 && vx > 140) {
          vy = -Math.min(620, 180 + vx * o.slope * 1.35);
          onGround = false;
          py = rampHeightAt(o, Math.min(fx, o.x + o.w)) - PLAYER_H - 2;
        }
      }
      return true;
    }
    return false;
  }

  function hazardHits() {
    const pb = { x: px + 6, y: py + 4, w: PLAYER_W - 10, h: PLAYER_H - 6 };
    for (const o of objs) {
      if (o.hit) continue;
      if (o.kind === 'flower' || o.kind === 'generator') {
        let oy = o.y - o.h;
        let oh = o.h;
        if (o.kind === 'generator') {
          const bob = Math.abs(Math.sin(time * 10 + o.phase)) * 10;
          oy = o.y - o.h - bob;
          oh = o.h + 4;
        }
        // if clearly above, skip (jumped over / on something else)
        if (pb.y + pb.h <= oy + 6) continue;
        if (aabb(pb, { x: o.x, y: oy, w: o.w, h: oh })) {
          o.hit = true;
          hit();
        }
      } else if (o.kind === 'curb') {
        // front bumper smash if not clearing the top
        const top = o.y - o.h;
        if (pb.y + pb.h > top + 8 && pb.x + pb.w > o.x && pb.x < o.x + 10 && vx > 60) {
          // only punish if approaching from front without enough height
          if (pb.y + pb.h > top + 12) {
            o.hit = true;
            hit();
          }
        }
      } else if (o.kind === 'car') {
        // hitting the rear bumper / body from the front without being on roof
        const top = o.y - o.h;
        const onRoof = pb.y + pb.h <= top + 10;
        if (onRoof) continue;
        if (pb.x + pb.w > o.x && pb.x < o.x + 16 && pb.y + pb.h > top + 14 && vx > 50) {
          o.hit = true;
          hit();
        }
      }
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---- update ----
  function update(dt) {
    if (!running || paused) return;
    time += dt;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 28);
    if (input.jumpBuffered > 0) input.jumpBuffered -= dt;

    // horizontal
    if (input.accel) vx += ACCEL * dt;
    if (input.brake) vx -= BRAKE * dt;
    if (!input.accel && !input.brake) vx -= Math.sign(vx) * DRAG * dt;
    if (!input.brake && vx < V_MIN && onGround) vx = V_MIN; // gentle idle roll
    if (vx > V_MAX) vx = V_MAX;
    if (vx < -40) vx = -40; // barely reverse
    facing = vx >= 0 ? 1 : -1;

    px += vx * dt;
    distance = Math.max(distance, (px - 80) * 0.08);
    score += Math.max(0, vx) * dt * 0.12;
    bgPhase += vx * dt * 0.02;

    // jump
    if (onGround) coyote = COYOTE;
    else coyote -= dt;
    if (input.jumpBuffered > 0 && coyote > 0) {
      vy = JUMP_V;
      onGround = false;
      coyote = 0;
      input.jumpBuffered = 0;
      input.jump = false;
    }

    // gravity + vertical
    vy += GRAV * dt;
    if (vy > 900) vy = 900;
    py += vy * dt;

    onGround = false;
    if (!tryLand(dt)) {
      // fell below ground
      if (feetY() > GROUND) {
        py = GROUND - PLAYER_H;
        vy = 0;
        onGround = true;
        coyote = COYOTE;
      }
    }

    // stick to ramp while riding up
    if (onGround || vy >= 0) {
      const fx = feetX();
      for (const o of objs) {
        if (o.kind !== 'ramp') continue;
        const hy = rampHeightAt(o, fx);
        if (hy == null) continue;
        if (feetY() >= hy - 4 && feetY() <= hy + 16 && px + PLAYER_W > o.x && px < o.x + o.w) {
          py = hy - PLAYER_H;
          if (vy > 0) vy = 0;
          onGround = true;
          coyote = COYOTE;
        }
      }
    }

    hazardHits();
    wheelPhase += Math.abs(vx) * dt * 0.08;

    // spawn ahead of camera
    const cam = cameraX();
    while (spawnX < cam + W + 500) spawnChunk(distance < 80);
    objs = objs.filter((o) => o.x + o.w > cam - 80);

    document.getElementById('scoreLine').textContent = t().score(distance, score);
    document.getElementById('livesLine').textContent = t().lives(lives);
  }

  function cameraX() {
    return Math.max(0, px - W * 0.28);
  }

  // ---- draw ----
  function drawSky(cam) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, '#020617');
    g.addColorStop(0.55, '#0f172a');
    g.addColorStop(1, '#1e1b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // stars
    ctx.fillStyle = '#e2e8f044';
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 97 + (cam * 0.02)) % (W + 20));
      const sy = 8 + (i * 37) % 70;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  function drawSkyline(cam) {
    const base = GROUND - 110;
    for (let layer = 0; layer < 2; layer++) {
      const parallax = layer === 0 ? 0.15 : 0.28;
      const fill = layer === 0 ? '#14121f' : '#1c1930';
      const stroke = layer === 0 ? '#5c5678' : '#7c7598';
      let x = -((cam * parallax) % 70) - 40;
      let i = 0;
      while (x < W + 50) {
        const h0 = ((i * 7919 + layer * 104729) >>> 0);
        const bw = 22 + (h0 % 38);
        const bh = 28 + (h0 % 55) + layer * 10;
        ctx.fillStyle = fill;
        ctx.fillRect(x, base - bh + layer * 8, bw, bh + 20);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 0.5, base - bh + layer * 8 + 0.5, bw - 1, bh + 19);
        // windows
        const cols = 2 + (h0 % 3), rows = 2 + (h0 % 4);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (((h0 >> (r + c + layer)) & 1) === 0) continue;
          ctx.fillStyle = (h0 + r * 3 + c) % 5 === 0 ? '#93c5fd99' : '#fbbf24cc';
          ctx.fillRect(x + 4 + c * ((bw - 8) / cols), base - bh + layer * 8 + 6 + r * ((bh - 12) / rows), Math.max(2, bw * 0.12), Math.max(2, bh * 0.08));
        }
        x += bw + 3 + (h0 % 7);
        i++;
      }
    }
    // fog
    const fog = ctx.createLinearGradient(0, base - 40, 0, GROUND);
    fog.addColorStop(0, 'rgba(8,6,18,0.35)');
    fog.addColorStop(1, 'rgba(8,6,18,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, base - 50, W, 120);
  }

  function drawGround(cam) {
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#1c1624';
    ctx.fillRect(0, GROUND, W, 6);
    // asphalt grain
    ctx.fillStyle = '#221c2c';
    for (let i = 0; i < 18; i++) {
      const gx = ((i * 48 - cam * 0.9) % (W + 48));
      ctx.fillRect(gx, GROUND + 10 + (i % 3) * 8, 30, 3);
    }
    // curb line
    ctx.fillStyle = '#3f3a4a';
    ctx.fillRect(0, GROUND - 2, W, 2);
  }

  function drawLamps(cam) {
    for (let i = 0; i < 8; i++) {
      const wx = i * 220 + 40;
      const sx = wx - cam * 0.95;
      if (sx < -40 || sx > W + 40) continue;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(sx, GROUND - 90, 4, 90);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath(); ctx.arc(sx + 2, GROUND - 92, 6, 0, Math.PI * 2); ctx.fill();
      const pool = ctx.createRadialGradient(sx + 2, GROUND, 0, sx + 2, GROUND, 70);
      pool.addColorStop(0, 'rgba(253,230,138,0.28)');
      pool.addColorStop(1, 'rgba(253,230,138,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(sx + 2, GROUND + 2, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawObj(o, cam) {
    const sx = o.x - cam;
    if (sx + o.w < -20 || sx > W + 20) return;
    if (o.kind === 'curb') {
      ctx.fillStyle = '#57534e';
      ctx.fillRect(sx, o.y - o.h, o.w, o.h);
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(sx, o.y - o.h, o.w, 3);
    } else if (o.kind === 'ramp') {
      ctx.fillStyle = '#3f3a4a';
      ctx.beginPath();
      ctx.moveTo(sx, o.y);
      ctx.lineTo(sx + o.w, o.y);
      ctx.lineTo(sx + o.w, o.y - o.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, o.y);
      ctx.lineTo(sx + o.w, o.y - o.h);
      ctx.stroke();
    } else if (o.kind === 'flower') {
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
      // exhaust puff
      ctx.fillStyle = '#94a3b866';
      ctx.beginPath(); ctx.arc(sx + 8, y - 4 - bob * 0.2, 4 + bob * 0.15, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === 'car') {
      const y = o.y - o.h;
      // body
      ctx.fillStyle = ['#1e3a5f', '#7f1d1d', '#365314', '#334155'][(o.x | 0) % 4];
      ctx.fillRect(sx + 4, y + 12, o.w - 8, o.h - 12);
      // cabin
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(sx + o.w * 0.28, y + 2, o.w * 0.42, 14);
      ctx.fillStyle = '#38bdf866';
      ctx.fillRect(sx + o.w * 0.3, y + 4, o.w * 0.38, 8);
      // roof rideable highlight
      ctx.fillStyle = '#e2e8f022';
      ctx.fillRect(sx + 6, y, o.w - 12, 3);
      ctx.strokeStyle = '#94a3b888';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 4.5, y + 0.5, o.w - 9, o.h - 1);
      // wheels
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(sx + 18, o.y - 6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + o.w - 18, o.y - 6, 7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlayer(cam) {
    if (invuln > 0 && ((invuln * 16) | 0) % 2 === 0) return;
    const sx = px - cam;
    const sy = py;
    // scooter deck
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(sx + 2, sy + PLAYER_H - 10, PLAYER_W - 2, 5);
    // wheels
    ctx.fillStyle = '#111';
    const wr = 5;
    ctx.beginPath(); ctx.arc(sx + 8, sy + PLAYER_H - 4, wr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + PLAYER_W - 4, sy + PLAYER_H - 4, wr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + PLAYER_H - 4);
    ctx.lineTo(sx + 8 + Math.cos(wheelPhase) * 4, sy + PLAYER_H - 4 + Math.sin(wheelPhase) * 4);
    ctx.stroke();
    // stem / bars
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx + PLAYER_W - 6, sy + PLAYER_H - 10);
    ctx.lineTo(sx + PLAYER_W - 4, sy + 8);
    ctx.lineTo(sx + PLAYER_W + 4, sy + 6);
    ctx.stroke();
    // rider
    ctx.fillStyle = '#b45309';
    ctx.fillRect(sx + 8, sy + 10, 14, 16);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath(); ctx.arc(sx + 15, sy + 8, 6, 0, Math.PI * 2); ctx.fill();
    // scarf
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(sx + 10, sy + 12, 12, 3);
  }

  function draw() {
    const cam = cameraX();
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    drawSky(cam);
    drawSkyline(cam);
    drawGround(cam);
    drawLamps(cam);
    for (const o of objs) drawObj(o, cam);
    drawPlayer(cam);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- input ----
  function bindHold(el, key) {
    const down = (e) => { e.preventDefault(); input[key] = true; if (key === 'jump') input.jumpBuffered = 0.15; el.classList.add('held'); };
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
      input.jump = true; input.jumpBuffered = 0.15; e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); }
    if ((e.code === 'Enter') && !running) document.getElementById('oBtn').click();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.accel = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.brake = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jump = false;
  });

  document.getElementById('oBtn').addEventListener('click', () => {
    resetGame();
    running = true;
    document.getElementById('overlay').classList.add('hidden');
    syncPauseBtn();
    applyLang();
  });

  // ---- loop / bot API ----
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
      objs: objs.length, time,
    }),
    // simple autopilot helpers for headless bot
    press: (name, on) => {
      if (name === 'accel') input.accel = !!on;
      if (name === 'brake') input.brake = !!on;
      if (name === 'jump') { input.jump = !!on; if (on) input.jumpBuffered = 0.18; }
    },
    peekHazards: () => {
      const cam = cameraX();
      return objs.filter((o) => o.x > px - 20 && o.x < px + 320).map((o) => ({
        kind: o.kind, x: o.x, w: o.w, h: o.h, dx: o.x - px, roof: roofY(o),
      }));
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
