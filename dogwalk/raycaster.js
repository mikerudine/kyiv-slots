/* One Day in Kyiv — dog-walk courtyard raycaster tech spike
   Plain canvas Wolfenstein-style DDA, no engines. */
(function () {
  'use strict';

  const W = 320, H = 200;
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const buffer = ctx.createImageData(W, H);
  const pix = buffer.data;
  const zBuf = new Float32Array(W);

  // --- i18n ---
  const I18N = {
    ua: {
      title: 'Прогулянка з собакою',
      hint: 'WASD / стрілки · двір хрущовки · торкни екран',
      dogNear: '🐶 Пес поруч',
      dogFar: '🐶 Пес відстав',
      dogFollow: '🐶 Йде за тобою',
      boot: 'Завантаження двору…',
    },
    en: {
      title: 'Walking the dog',
      hint: 'WASD / arrows · khrushchevka yard · touch to move',
      dogNear: '🐶 Dog nearby',
      dogFar: '🐶 Dog lagged behind',
      dogFollow: '🐶 Following you',
      boot: 'Loading courtyard…',
    },
  };
  let lang = localStorage.getItem('dogwalk-lang') || 'ua';
  function applyLang() {
    const t = I18N[lang];
    document.getElementById('tTitle').textContent = t.title;
    document.getElementById('tHint').textContent = t.hint;
    document.getElementById('lang').textContent = lang.toUpperCase();
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
  }
  document.getElementById('lang').addEventListener('click', () => {
    lang = lang === 'ua' ? 'en' : 'ua';
    localStorage.setItem('dogwalk-lang', lang);
    applyLang();
  });
  applyLang();

  // --- map: 0 empty, 1 brick, 2 garage, 3 hedge/tree wall ---
  // Small Kyiv courtyard ~24x24
  const MAP_W = 24, MAP_H = 24;
  const world = new Uint8Array(MAP_W * MAP_H);
  function mget(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
    return world[y * MAP_W + x] | 0;
  }
  function mset(x, y, v) { world[y * MAP_W + x] = v; }

  (function buildMap() {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) mset(x, y, 1);
        else mset(x, y, 0);
      }
    }
    // Khrushchevka L-blocks
    for (let x = 3; x <= 8; x++) for (let y = 3; y <= 5; y++) mset(x, y, 1);
    for (let x = 3; x <= 5; x++) for (let y = 3; y <= 10; y++) mset(x, y, 1);
    for (let x = 14; x <= 20; x++) for (let y = 3; y <= 5; y++) mset(x, y, 1);
    for (let x = 18; x <= 20; x++) for (let y = 3; y <= 12; y++) mset(x, y, 1);
    // Garage row
    for (let x = 8; x <= 15; x++) mset(x, 18, 2);
    mset(10, 18, 0); mset(11, 18, 0); mset(12, 18, 0); // passage
    // Tree / hedge patches
    for (let x = 10; x <= 13; x++) for (let y = 9; y <= 11; y++) mset(x, y, 3);
    mset(11, 10, 0); mset(12, 10, 0);
    // Courtyard pillars
    mset(7, 14, 1); mset(16, 14, 1);
    mset(7, 7, 2); mset(16, 8, 2);
  })();

  // --- procedural textures 64x64 RGBA ---
  const TEX = 64;
  function makeTex(fn) {
    const d = new Uint8ClampedArray(TEX * TEX * 4);
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const c = fn(x, y);
      const i = (y * TEX + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    return d;
  }
  function noise(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  const texBrick = makeTex((x, y) => {
    const bx = ((x + ((y >> 3) & 1) * 16) % 16);
    const by = y % 8;
    const mortar = bx === 0 || by === 0;
    const n = noise(x, y) * 18 - 9;
    if (mortar) return [90 + n, 78 + n, 68 + n];
    // faded ochre / pink khrushchevka brick
    return [168 + n, 118 + n * 0.6, 92 + n * 0.4];
  });
  const texGarage = makeTex((x, y) => {
    const n = noise(x, y) * 20 - 10;
    const panel = (x % 32 < 30) && (y % 16 < 14);
    if (!panel) return [40 + n, 42 + n, 48 + n];
    // corrugated metal / green garage door
    const wave = Math.sin(x * 0.8) * 8;
    return [48 + wave + n, 110 + wave + n, 62 + n];
  });
  const texTree = makeTex((x, y) => {
    const n = noise(x, y) * 30 - 15;
    const trunk = x > 26 && x < 38 && y > 36;
    if (trunk) return [72 + n, 48 + n, 28 + n];
    // foliage blotches
    const r = ((x - 32) * (x - 32) + (y - 28) * (y - 28));
    if (r < 700 + n * 40) return [34 + n, 98 + n, 42 + n];
    return [22 + n * 0.3, 55 + n * 0.3, 28 + n * 0.3];
  });
  const textures = [null, texBrick, texGarage, texTree];

  // Floor / ceiling colors (base)
  const FLOOR = [72, 78, 58];      // asphalt / dirt yard
  const CEIL = [92, 128, 168];     // overcast Kyiv sky

  // --- sprites (billboards) ---
  function makeSprite(draw) {
    const s = 64;
    const d = new Uint8ClampedArray(s * s * 4);
    for (let i = 0; i < d.length; i += 4) d[i + 3] = 0;
    draw(d, s);
    return { data: d, size: s };
  }
  function put(d, s, x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= s || y >= s) return;
    const i = (y * s + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
  const sprDog = makeSprite((d, s) => {
    // simple side-facing dog silhouette
    for (let y = 28; y < 50; y++) for (let x = 18; x < 48; x++) put(d, s, x, y, 140, 100, 60, 255);
    for (let y = 18; y < 34; y++) for (let x = 40; x < 54; x++) put(d, s, x, y, 140, 100, 60, 255); // head
    for (let y = 22; y < 28; y++) for (let x = 50; x < 58; x++) put(d, s, x, y, 140, 100, 60, 255); // snout
    put(d, s, 52, 24, 20, 20, 20, 255); // eye
    for (let y = 14; y < 24; y++) for (let x = 44; x < 48; x++) put(d, s, x, y, 140, 100, 60, 255); // ear
    for (let y = 48; y < 58; y++) { // legs
      put(d, s, 22, y, 120, 85, 50, 255); put(d, s, 23, y, 120, 85, 50, 255);
      put(d, s, 30, y, 120, 85, 50, 255); put(d, s, 31, y, 120, 85, 50, 255);
      put(d, s, 40, y, 120, 85, 50, 255); put(d, s, 41, y, 120, 85, 50, 255);
      put(d, s, 46, y, 120, 85, 50, 255); put(d, s, 47, y, 120, 85, 50, 255);
    }
    for (let y = 30; y < 46; y++) for (let x = 14; x < 20; x++) put(d, s, x, y, 140, 100, 60, 255); // tail
  });
  const sprBench = makeSprite((d, s) => {
    for (let y = 36; y < 44; y++) for (let x = 8; x < 56; x++) put(d, s, x, y, 96, 64, 36, 255);
    for (let y = 20; y < 36; y++) for (let x = 8; x < 56; x++) if (y % 4 !== 0) put(d, s, x, y, 110, 78, 48, 255);
    for (let y = 44; y < 58; y++) {
      put(d, s, 12, y, 70, 50, 30, 255); put(d, s, 13, y, 70, 50, 30, 255);
      put(d, s, 50, y, 70, 50, 30, 255); put(d, s, 51, y, 70, 50, 30, 255);
    }
  });
  const sprKiosk = makeSprite((d, s) => {
    for (let y = 8; y < 56; y++) for (let x = 14; x < 50; x++) put(d, s, x, y, 200, 40, 40, 255);
    for (let y = 18; y < 36; y++) for (let x = 20; x < 44; x++) put(d, s, x, y, 180, 220, 255, 255);
    for (let y = 4; y < 12; y++) for (let x = 12; x < 52; x++) put(d, s, x, y, 230, 200, 40, 255);
    // "КИЇВ" dots
    for (let x = 22; x < 42; x += 4) put(d, s, x, 7, 20, 20, 20, 255);
  });
  const sprPuddle = makeSprite((d, s) => {
    for (let y = 40; y < 58; y++) for (let x = 10; x < 54; x++) {
      const dx = (x - 32) / 22, dy = (y - 49) / 9;
      if (dx * dx + dy * dy < 1) put(d, s, x, y, 60, 90, 140, 200);
    }
  });

  const sprites = [
    { x: 12.8, y: 17.2, tex: sprDog, scale: 0.7, follow: true },
    { x: 9.3, y: 13.2, tex: sprBench, scale: 0.9 },
    { x: 15.5, y: 13.0, tex: sprBench, scale: 0.9 },
    { x: 12.0, y: 6.5, tex: sprKiosk, scale: 1.1 },
    { x: 8.5, y: 16.5, tex: sprPuddle, scale: 0.8 },
    { x: 14.2, y: 16.8, tex: sprPuddle, scale: 0.6 },
  ];
  const dog = sprites[0];

  // --- player ---
  const player = {
    x: 12.5, y: 16.5,
    dirX: 0, dirY: -1,
    planeX: 0.66, planeY: 0,
  };

  // --- input ---
  const keys = Object.create(null);
  const moveAxis = { x: 0, y: 0 };
  let turnHeld = 0;

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Virtual stick
  const moveEl = document.getElementById('move');
  const knob = document.getElementById('knob');
  let stickId = null;
  function setKnob(dx, dy) {
    const max = 36;
    const len = Math.hypot(dx, dy) || 1;
    const c = Math.min(1, max / len);
    knob.style.left = (36 + dx * c) + 'px';
    knob.style.top = (36 + dy * c) + 'px';
  }
  function stickAt(clientX, clientY) {
    const r = moveEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const max = 50;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    moveAxis.x = dx / max;
    moveAxis.y = dy / max;
    setKnob(dx * (36 / max), dy * (36 / max));
  }
  function endStick() {
    stickId = null; moveAxis.x = 0; moveAxis.y = 0;
    knob.style.left = '36px'; knob.style.top = '36px';
  }
  moveEl.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId; moveEl.setPointerCapture(e.pointerId); stickAt(e.clientX, e.clientY);
  });
  moveEl.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickAt(e.clientX, e.clientY); });
  moveEl.addEventListener('pointerup', endStick);
  moveEl.addEventListener('pointercancel', endStick);

  function bindTurn(el, dir) {
    const down = (e) => { e.preventDefault(); turnHeld = dir; el.setPointerCapture?.(e.pointerId); };
    const up = () => { if (turnHeld === dir) turnHeld = 0; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
  bindTurn(document.getElementById('turnL'), -1);
  bindTurn(document.getElementById('turnR'), 1);

  function rotate(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const odx = player.dirX, opx = player.planeX;
    player.dirX = odx * c - player.dirY * s;
    player.dirY = odx * s + player.dirY * c;
    player.planeX = opx * c - player.planeY * s;
    player.planeY = opx * s + player.planeY * c;
  }

  function tryMove(nx, ny) {
    const r = 0.18;
    if (mget(nx | 0, player.y | 0) === 0 &&
        mget((nx - r) | 0, player.y | 0) === 0 &&
        mget((nx + r) | 0, player.y | 0) === 0) player.x = nx;
    if (mget(player.x | 0, ny | 0) === 0 &&
        mget(player.x | 0, (ny - r) | 0) === 0 &&
        mget(player.x | 0, (ny + r) | 0) === 0) player.y = ny;
  }

  function updateDog(dt) {
    const dx = player.x - dog.x, dy = player.y - dog.y;
    const dist = Math.hypot(dx, dy);
    const followDist = 1.35;
    if (dist > followDist) {
      const sp = Math.min(2.4, 1.2 + (dist - followDist) * 0.8) * dt;
      const nx = dog.x + (dx / dist) * sp;
      const ny = dog.y + (dy / dist) * sp;
      if (mget(nx | 0, dog.y | 0) === 0) dog.x = nx;
      if (mget(dog.x | 0, ny | 0) === 0) dog.y = ny;
    }
    const t = I18N[lang];
    const el = document.getElementById('dogStat');
    if (dist < 1.6) el.textContent = t.dogNear;
    else if (dist < 4) el.textContent = t.dogFollow;
    else el.textContent = t.dogFar;
  }

  function update(dt) {
    const speed = 3.0 * dt;
    const rot = 2.2 * dt;
    let mx = 0, my = 0;
    if (keys.KeyW || keys.ArrowUp) my += 1;
    if (keys.KeyS || keys.ArrowDown) my -= 1;
    if (keys.KeyA) mx -= 1;
    if (keys.KeyD) mx += 1;
    // stick: up on screen = forward
    mx += moveAxis.x;
    my += -moveAxis.y;
    if (keys.ArrowLeft || turnHeld < 0) rotate(-rot * (turnHeld ? Math.abs(turnHeld) : 1));
    if (keys.ArrowRight || turnHeld > 0) rotate(rot * (turnHeld ? Math.abs(turnHeld) : 1));
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.05) {
      tryMove(player.x + player.dirX * my * speed + player.planeX * mx * speed,
              player.y + player.dirY * my * speed + player.planeY * mx * speed);
    }
    updateDog(dt);
  }

  // Fog: blend toward gray-blue with distance
  function fog(r, g, b, dist) {
    const f = Math.min(1, dist / 14);
    const fr = 70, fg = 85, fb = 105;
    return [
      (r + (fr - r) * f) | 0,
      (g + (fg - g) * f) | 0,
      (b + (fb - b) * f) | 0,
    ];
  }

  function shade(r, g, b, side) {
    if (side) { r = (r * 0.72) | 0; g = (g * 0.72) | 0; b = (b * 0.72) | 0; }
    return [r, g, b];
  }

  function cast() {
    // ceiling / floor
    for (let y = 0; y < H; y++) {
      const p = y - H / 2;
      const posZ = 0.5 * H;
      const rowDist = p === 0 ? 1e9 : Math.abs(posZ / p);
      const stepX = rowDist * (player.dirX + player.planeX - (player.dirX - player.planeX)) / W;
      const stepY = rowDist * (player.dirY + player.planeY - (player.dirY - player.planeY)) / W;
      let floorX = player.x + rowDist * (player.dirX - player.planeX);
      let floorY = player.y + rowDist * (player.dirY - player.planeY);
      const isFloor = y >= H / 2;
      for (let x = 0; x < W; x++) {
        const cx = floorX | 0, cy = floorY | 0;
        const tx = ((floorX - cx) * TEX) & (TEX - 1);
        const ty = ((floorY - cy) * TEX) & (TEX - 1);
        floorX += stepX; floorY += stepY;
        let r, g, b;
        if (isFloor) {
          // checker-ish asphalt with noise tint
          const n = ((tx ^ ty) & 8) ? 8 : -4;
          r = FLOOR[0] + n; g = FLOOR[1] + n; b = FLOOR[2] + n;
        } else {
          const grad = 1 - (H / 2 - y) / (H / 2);
          r = (CEIL[0] * (0.55 + 0.45 * grad)) | 0;
          g = (CEIL[1] * (0.55 + 0.45 * grad)) | 0;
          b = (CEIL[2] * (0.55 + 0.45 * grad)) | 0;
        }
        const f = fog(r, g, b, rowDist);
        const i = (y * W + x) * 4;
        pix[i] = f[0]; pix[i + 1] = f[1]; pix[i + 2] = f[2]; pix[i + 3] = 255;
      }
    }

    // walls
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1;
      const rayDirX = player.dirX + player.planeX * camX;
      const rayDirY = player.dirY + player.planeY * camX;
      let mapX = player.x | 0, mapY = player.y | 0;
      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
      let stepX, stepY, sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }
      let hit = 0, side = 0, tile = 0;
      for (let i = 0; i < 64 && !hit; i++) {
        if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
        else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
        tile = mget(mapX, mapY);
        if (tile > 0) hit = 1;
      }
      let perp;
      if (side === 0) perp = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
      else perp = (mapY - player.y + (1 - stepY) / 2) / rayDirY;
      if (perp < 0.0001) perp = 0.0001;
      zBuf[x] = perp;
      const lineH = (H / perp) | 0;
      let drawStart = ((-lineH / 2 + H / 2) | 0); if (drawStart < 0) drawStart = 0;
      let drawEnd = ((lineH / 2 + H / 2) | 0); if (drawEnd >= H) drawEnd = H - 1;
      let wallX = side === 0 ? player.y + perp * rayDirY : player.x + perp * rayDirX;
      wallX -= Math.floor(wallX);
      let texX = (wallX * TEX) | 0;
      if (side === 0 && rayDirX > 0) texX = TEX - texX - 1;
      if (side === 1 && rayDirY < 0) texX = TEX - texX - 1;
      const tex = textures[tile] || texBrick;
      const step = TEX / lineH;
      let texPos = (drawStart - H / 2 + lineH / 2) * step;
      for (let y = drawStart; y <= drawEnd; y++) {
        const texY = (texPos | 0) & (TEX - 1);
        texPos += step;
        const ti = (texY * TEX + texX) * 4;
        let r = tex[ti], g = tex[ti + 1], b = tex[ti + 2];
        const sh = shade(r, g, b, side);
        const f = fog(sh[0], sh[1], sh[2], perp);
        const i = (y * W + x) * 4;
        pix[i] = f[0]; pix[i + 1] = f[1]; pix[i + 2] = f[2];
      }
    }

    // sprites — depth sort far→near
    const order = sprites.map((s, i) => {
      const dx = s.x - player.x, dy = s.y - player.y;
      return { i, dist: dx * dx + dy * dy };
    }).sort((a, b) => b.dist - a.dist);

    for (const o of order) {
      const s = sprites[o.i];
      const spriteX = s.x - player.x;
      const spriteY = s.y - player.y;
      const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
      const transformX = invDet * (player.dirY * spriteX - player.dirX * spriteY);
      const transformY = invDet * (-player.planeY * spriteX + player.planeX * spriteY);
      if (transformY <= 0.05) continue;
      const spriteScreenX = ((W / 2) * (1 + transformX / transformY)) | 0;
      const sc = s.scale || 1;
      const spriteH = Math.abs((H / transformY) * sc) | 0;
      const spriteW = spriteH;
      let drawStartY = (-spriteH / 2 + H / 2) | 0; if (drawStartY < 0) drawStartY = 0;
      let drawEndY = (spriteH / 2 + H / 2) | 0; if (drawEndY >= H) drawEndY = H - 1;
      let drawStartX = (-spriteW / 2 + spriteScreenX) | 0;
      let drawEndX = (spriteW / 2 + spriteScreenX) | 0;
      const tex = s.tex;
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (stripe < 0 || stripe >= W) continue;
        if (transformY >= zBuf[stripe]) continue;
        const texX = (((stripe - (-spriteW / 2 + spriteScreenX)) * tex.size) / spriteW) | 0;
        for (let y = drawStartY; y < drawEndY; y++) {
          const d = y * 256 - H * 128 + spriteH * 128;
          const texY = ((d * tex.size) / spriteH / 256) | 0;
          if (texX < 0 || texY < 0 || texX >= tex.size || texY >= tex.size) continue;
          const ti = (texY * tex.size + texX) * 4;
          const a = tex.data[ti + 3];
          if (a < 16) continue;
          let r = tex.data[ti], g = tex.data[ti + 1], b = tex.data[ti + 2];
          if (a < 255) {
            // soft blend for puddle
            const i = (y * W + stripe) * 4;
            const k = a / 255;
            r = (r * k + pix[i] * (1 - k)) | 0;
            g = (g * k + pix[i + 1] * (1 - k)) | 0;
            b = (b * k + pix[i + 2] * (1 - k)) | 0;
          }
          const f = fog(r, g, b, transformY);
          const i = (y * W + stripe) * 4;
          pix[i] = f[0]; pix[i + 1] = f[1]; pix[i + 2] = f[2];
        }
      }
    }
  }

  // --- loop / fps ---
  let last = performance.now();
  let frames = 0, fpsT = 0, fps = 0;
  let fpsSamples = [];
  window.__dogwalk = {
    getFps: () => fps,
    getFpsSamples: () => fpsSamples.slice(),
    player, dog, sprites,
  };

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    cast();
    ctx.putImageData(buffer, 0, 0);
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

  document.getElementById('boot').remove();
  requestAnimationFrame(frame);
})();
