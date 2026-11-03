/* One Day in Kyiv — dog walk 3-lane runner (Minions-style) + air-raid notifications */
(function () {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const I18N = {
    ua: {
      title: 'Прогулянка з собакою',
      hint: 'Свайп ← → · змахни тривоги',
      score: (d, s) => `${d|0} м · ${s|0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Прогулянка',
      overlayBody: 'Ухиляйся від калюж і злих псів. Сповіщення про тривогу самі не зникають — змахни їх, інакше забʼють екран.',
      start: 'Старт',
      again: 'Ще раз',
      overTitle: 'Кінець прогулянки',
      overBody: (d, s) => `Дистанція ${d|0} м · рахунок ${s|0}`,
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
      score: (d, s) => `${d|0} m · ${s|0}`,
      lives: (n) => `❤ ${n}`,
      overlayTitle: 'Dog walk',
      overlayBody: 'Dodge puddles and angry dogs. Air-raid alerts do not auto-dismiss — swipe them away or they fill the screen.',
      start: 'Start',
      again: 'Again',
      overTitle: 'Walk over',
      overBody: (d, s) => `Distance ${d|0} m · score ${s|0}`,
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
      document.getElementById('oBody').textContent = dead
        ? L.overBody(distance, score)
        : L.overlayBody;
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

  // --- game state ---
  const LANES = 3;
  let lane = 1;          // 0..2
  let laneX = 1;         // visual float
  let dogLane = 1;
  let speed = 220;       // px/s world scroll
  const SPEED0 = 220, SPEED_MAX = 520;
  let distance = 0;
  let score = 0;
  let lives = 3;
  let running = false;
  let dead = false;
  let invuln = 0;
  let spawnAcc = 0;
  let notifAcc = 0;
  let notifRate = 3.2;   // seconds between notifs (decreases)
  let obstacles = [];
  let groundOff = 0;
  let shake = 0;

  const notifRoot = document.getElementById('notifs');
  let notifs = []; // {el, x, y, vx}

  function laneToX(l) {
    const roadL = 48, roadR = W - 48;
    const span = roadR - roadL;
    return roadL + span * ((l + 0.5) / LANES);
  }

  function resetGame() {
    lane = 1; laneX = 1; dogLane = 1;
    speed = SPEED0; distance = 0; score = 0; lives = 3;
    invuln = 0; spawnAcc = 0; notifAcc = 0; notifRate = 3.2;
    obstacles = []; groundOff = 0; shake = 0; dead = false;
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
    invuln = 1.2;
    shake = 10;
    if (lives <= 0) gameOver();
  }

  // --- obstacles ---
  function spawnObstacle() {
    const kind = Math.random() < 0.55 ? 'puddle' : 'dog';
    let l = (Math.random() * LANES) | 0;
    // avoid stacking same lane back-to-back too tightly
    const recent = obstacles.filter((o) => o.y < 120);
    if (recent.some((o) => o.lane === l)) l = (l + 1 + ((Math.random() * 2) | 0)) % LANES;
    obstacles.push({
      kind, lane: l, y: -60,
      w: kind === 'puddle' ? 46 : 40,
      h: kind === 'puddle' ? 22 : 48,
      bitten: false,
    });
  }

  // --- notifications ---
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
    const top = 56 + Math.random() * Math.max(40, wrap.height * 0.55);
    // slight horizontal jitter so stacks look phone-like
    const leftPct = 4 + Math.random() * 4;
    el.style.top = top + 'px';
    el.style.left = leftPct + '%';
    // stagger vertical if overlap
    const overlap = notifs.filter((n) => Math.abs(parseFloat(n.el.style.top) - top) < 54);
    if (overlap.length) el.style.top = (top + overlap.length * 18) + 'px';

    notifRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    const state = { el, startX: 0, dx: 0, dragging: false, id: null };
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
      state.dragging = true;
      state.startX = p.clientX;
      state.dx = 0;
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
    // click anywhere on card also counts as dismiss (desktop convenience)
    el.addEventListener('click', (e) => {
      if (Math.abs(state.dx) < 8) dismiss();
    });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  // --- input: lane switch ---
  function tryLane(dir) {
    if (!running) return;
    const n = Math.max(0, Math.min(LANES - 1, lane + dir));
    if (n !== lane) {
      lane = n;
      // dog lags one step
      setTimeout(() => { dogLane = lane; }, 90);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { tryLane(-1); e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { tryLane(1); e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter') && !running) {
      document.getElementById('oBtn').click();
    }
  });

  let swipeX0 = 0, swipeY0 = 0, swipeArmed = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    // ignore if hitting a notif (they sit above)
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

  // --- draw helpers (pixel-ish) ---
  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawDog(x, y, angry, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // body
    ctx.fillStyle = angry ? '#7f1d1d' : '#b45309';
    ctx.fillRect(-14, -10, 28, 16);
    // head
    ctx.fillRect(10, -18, 16, 14);
    ctx.fillStyle = angry ? '#fef2f2' : '#1c1917';
    ctx.fillRect(20, -14, 3, 3);
    if (angry) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(18, -6, 8, 3); // teeth bar
    }
    // legs
    ctx.fillStyle = angry ? '#450a0a' : '#92400e';
    ctx.fillRect(-12, 6, 5, 10);
    ctx.fillRect(-2, 6, 5, 10);
    ctx.fillRect(8, 6, 5, 10);
    ctx.fillRect(14, 6, 5, 10);
    // ear / tail
    ctx.fillStyle = angry ? '#7f1d1d' : '#b45309';
    ctx.fillRect(12, -24, 6, 8);
    ctx.fillRect(-20, -4, 8, 4);
    ctx.restore();
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // coat
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-10, -28, 20, 26);
    // head
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(-8, -42, 16, 14);
    // beanie
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-9, -48, 18, 8);
    // legs
    ctx.fillStyle = '#334155';
    ctx.fillRect(-8, -2, 7, 14);
    ctx.fillRect(1, -2, 7, 14);
    ctx.restore();
  }

  function drawPuddle(x, y, w, h) {
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#60a5fa88';
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 2, w / 5, h / 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    const ox = shake ? ((Math.random() - 0.5) * shake) : 0;
    const oy = shake ? ((Math.random() - 0.5) * shake) : 0;
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    // sky / evening
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.45, '#1e293b');
    g.addColorStop(1, '#334155');
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // buildings silhouette sides
    ctx.fillStyle = '#0b1220';
    for (let i = 0; i < 6; i++) {
      const bh = 80 + ((i * 37) % 90);
      ctx.fillRect(4, H - bh - ((groundOff + i * 40) % 120), 28, bh);
      ctx.fillRect(W - 32, H - bh - ((groundOff + i * 55) % 140), 28, bh);
    }

    // road
    const roadL = 40, roadR = W - 40;
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(roadL, -10, roadR - roadL, H + 20);
    // lane lines
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 16]);
    ctx.lineDashOffset = groundOff % 30;
    for (let i = 1; i < LANES; i++) {
      const x = roadL + (roadR - roadL) * (i / LANES);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // curb
    ctx.fillStyle = '#78716c';
    ctx.fillRect(roadL - 6, -10, 6, H + 20);
    ctx.fillRect(roadR, -10, 6, H + 20);

    // obstacles (sort by y for draw order)
    const sorted = obstacles.slice().sort((a, b) => a.y - b.y);
    for (const o of sorted) {
      const x = laneToX(o.lane);
      if (o.kind === 'puddle') drawPuddle(x, o.y, o.w, o.h);
      else drawDog(x, o.y, true, 1.15);
    }

    // player + leash + dog
    laneX += (lane - laneX) * Math.min(1, 0.28);
    const dogVis = dogLane + (laneX - dogLane) * 0.15;
    const px = laneToX(laneX);
    const py = H * 0.72;
    const dx = laneToX(dogVis);
    const dy = py + 46;

    // leash
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py - 8);
    ctx.quadraticCurveTo((px + dx) / 2, (py + dy) / 2 + 10, dx, dy - 8);
    ctx.stroke();

    drawPlayer(px, py);
    if (invuln > 0 && ((invuln * 20) | 0) % 2 === 0) {
      // blink
    } else {
      drawDog(dx, dy, false, 0.85);
    }

    // coverage warning when notifs pile up
    if (notifs.length >= 4) {
      ctx.fillStyle = 'rgba(127,29,29,0.18)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function update(dt) {
    if (!running) return;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 30);

    speed = Math.min(SPEED_MAX, SPEED0 + distance * 0.35);
    const scroll = speed * dt;
    groundOff += scroll;
    distance += scroll * 0.08;
    score += scroll * 0.05;

    // spawn obstacles
    spawnAcc += dt;
    const spawnEvery = Math.max(0.45, 1.15 - distance / 400);
    if (spawnAcc >= spawnEvery) {
      spawnAcc = 0;
      spawnObstacle();
      if (Math.random() < 0.25) spawnObstacle();
    }

    // move obstacles toward player (down the screen)
    const playerY = H * 0.72;
    for (const o of obstacles) {
      const approach = o.kind === 'dog' ? scroll * 1.35 : scroll;
      o.y += approach;
    }
    obstacles = obstacles.filter((o) => o.y < H + 80);

    // collisions
    const px = laneToX(laneX);
    for (const o of obstacles) {
      if (o.lane !== lane && Math.abs(o.lane - laneX) > 0.35) continue;
      const hitPad = o.kind === 'puddle' ? 18 : 22;
      if (Math.abs(o.y - playerY) < hitPad) {
        if (o.kind === 'dog' && o.bitten) continue;
        if (o.kind === 'dog') o.bitten = true;
        else o.y = H + 100; // consume puddle
        hit();
      }
    }

    // notifications spawn (faster over time)
    notifAcc += dt;
    notifRate = Math.max(0.85, 3.2 - distance / 180);
    // also faster when many already? no — pile-up is the threat
    if (notifAcc >= notifRate) {
      notifAcc = 0;
      spawnNotif();
    }
    // soft fail: too many notifs block and drain life slowly
    if (notifs.length >= 6) {
      // screen almost unusable — tick damage
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
    getState: () => ({ distance, score, lives, running, dead, notifs: notifs.length, obstacles: obstacles.length }),
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

  applyLang();
  draw();
  requestAnimationFrame(frame);
})();
