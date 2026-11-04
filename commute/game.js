/* One Day in Kyiv — "Дорога на Осокорки": turn-based commute vs. the city */
(function () {
  'use strict';
  // ---------- data ----------
  const N = {
    obolon: [30, 18, 'Оболонь', 'Obolon'], pochaina: [38, 27, 'Почайна', 'Pochaina'], petrivka: [47, 20, 'Петрівка (ринок)', 'Petrivka market'],
    troie: [88, 16, 'Троєщина', 'Troieshchyna'], podil: [38, 40, 'Поділ', 'Podil'], kontr: [45, 44, 'Контрактова', 'Kontraktova'],
    poshtova: [52, 49, 'Поштова', 'Poshtova'], khresh: [44, 56, 'Хрещатик', 'Khreshchatyk'], arsenal: [53, 60, 'Арсенальна', 'Arsenalna'],
    hydro: [65, 58, 'Гідропарк', 'Hydropark'], livob: [79, 57, 'Лівобережна', 'Livoberezhna'], lybid: [40, 76, 'Либідська', 'Lybidska'],
    druzhby: [51, 70, 'Дружби народів', 'Druzhby Narodiv'], holos: [31, 92, 'Голосіїв', 'Holosiiv'], vydub: [55, 85, 'Видубичі', 'Vydubychi'],
    darn: [87, 67, 'Дарниця', 'Darnytsia'], pozn: [81, 92, 'Позняки', 'Pozniaky'], khark: [95, 99, 'Харківська', 'Kharkivska'],
    osok: [77, 110, 'Осокорки', 'Osokorky'],
  };
  const E = [
    ['obolon', 'pochaina', 'metro bus marsh'], ['obolon', 'petrivka', 'bus marsh tram'], ['pochaina', 'petrivka', 'bus tram'],
    ['pochaina', 'podil', 'metro tram bus'], ['petrivka', 'podil', 'train tram'], ['petrivka', 'troie', 'bus marsh train', 'pivn'],
    ['podil', 'kontr', 'tram bus'], ['kontr', 'poshtova', 'metro tram bus'], ['poshtova', 'khresh', 'metro bus trolley'],
    ['podil', 'khresh', 'trolley bus'], ['khresh', 'arsenal', 'metro trolley'], ['arsenal', 'hydro', 'metro bus', 'metro'],
    ['hydro', 'livob', 'metro bus'], ['khresh', 'lybid', 'metro trolley bus'], ['lybid', 'holos', 'metro trolley'],
    ['lybid', 'druzhby', 'trolley bus'], ['druzhby', 'vydub', 'metro bus'], ['druzhby', 'livob', 'bus marsh trolley', 'paton'],
    ['holos', 'vydub', 'bus marsh'], ['vydub', 'pozn', 'metro bus marsh', 'pivd'], ['vydub', 'darn', 'train marsh', 'darnb'],
    ['livob', 'darn', 'metro tram bus'], ['darn', 'pozn', 'bus marsh train'], ['troie', 'livob', 'tram marsh bus'],
    ['troie', 'darn', 'bus marsh'], ['pozn', 'osok', 'metro bus marsh'], ['khark', 'osok', 'bus marsh'],
    ['pozn', 'khark', 'metro bus'], ['darn', 'khark', 'bus tram'],
  ].map(([a, b, m, br], i) => ({ id: i, a, b, modes: m.split(' '), bridge: br || null }));
  const BR = { pivn: ['Північний міст', 'Pivnichnyi bridge'], metro: ['міст Метро', 'Metro bridge'], paton: ['міст Патона', 'Paton bridge'], pivd: ['Південний міст', 'Pivdennyi bridge'], darnb: ['Дарницький міст', 'Darnytskyi bridge'] };
  const MODE = {
    metro: { e: '🚇', ua: 'метро', en: 'metro', spd: 0.55, cost: 8 }, bus: { e: '🚌', ua: 'автобус', en: 'bus', spd: 1.3, cost: 8 },
    marsh: { e: '🚐', ua: 'маршрутка', en: 'marshrutka', spd: 1.0, cost: 15 }, tram: { e: '🚋', ua: 'трамвай', en: 'tram', spd: 1.2, cost: 8 },
    trolley: { e: '🚎', ua: 'тролейбус', en: 'trolleybus', spd: 1.3, cost: 8 }, train: { e: '🚆', ua: 'електричка', en: 'city train', spd: 0.6, cost: 10 },
    scooter: { e: '🛴', ua: 'самокат', en: 'e-scooter', spd: 0.9, cost: 35 }, walk: { e: "🚶", ua: "пішки", en: "walk", spd: 3.4, cost: 0 },
    taxi: { e: '🚕', ua: 'таксі', en: 'taxi', spd: 0.7, cost: 0 },
  };
  const START = 17 * 60, CURFEW = 24 * 60, MONEY0 = 200, GOAL = 'osok', HOME = 'obolon';
  const dist = (a, b) => Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
  const other = (e, n) => (e.a === n ? e.b : e.a);
  const edgesOf = (n) => E.filter((e) => e.a === n || e.b === n);

  // ---------- core (pure, rng injectable) ----------
  function newGame(rng) {
    return { rng: rng || Math.random, at: HOME, t: START, money: MONEY0, last: -1, trail: [HOME], log: [], over: false, won: false, opts: [], turns: 0 };
  }
  const R = (g, a, b) => a + g.rng() * (b - a);
  const RI = (g, a, b) => Math.round(R(g, a, b));
  function walkTarget(g) {
    const cand = edgesOf(g.at).filter((e) => e.id !== g.last).sort((x, y) => dist(other(x, g.at), GOAL) - dist(other(y, g.at), GOAL));
    return cand[0];
  }
  function taxiPrice(g, e) { return Math.round(dist(g.at, other(e, g.at)) * 7 * (1.6 + g.rng() * 2.6)); }
  function offer(g) {
    // the city offers exactly two transport options, preferring ones that lead away or are slow
    const here = dist(g.at, GOAL), cands = [];
    for (const e of edgesOf(g.at)) {
      if (e.id === g.last) continue;
      const to = other(e, g.at), gain = here - dist(to, GOAL);
      for (const m of e.modes.concat(g.rng() < 0.25 ? ['scooter'] : [])) {
        if (m === 'train' && g.rng() < 0.6) continue; // elektrychka is rare
        cands.push({ e, m, to, w: Math.exp(-gain / 30) * (MODE[m].spd > 1 ? 1.4 : 1) });
      }
    }
    const pick = [];
    while (pick.length < 2 && cands.length) {
      let s = cands.reduce((a, c) => a + c.w, 0), x = g.rng() * s, i = 0;
      for (; i < cands.length - 1; i++) { x -= cands[i].w; if (x <= 0) break; }
      const c = cands.splice(i, 1)[0];
      if (!pick.some((p) => p.e.id === c.e.id && p.m === c.m)) pick.push(c);
    }
    const wt = walkTarget(g);
    const opts = pick.map((p) => ({ kind: p.m, e: p.e, to: p.to }));
    if (wt) {
      opts.push({ kind: 'walk', e: wt, to: other(wt, g.at) });
      opts.push({ kind: 'taxi', e: wt, to: other(wt, g.at), price: taxiPrice(g, wt) });
    }
    g.opts = opts;
    return opts;
  }
  // msg: [ua, en]
  function choose(g, idx) {
    const o = g.opts[idx]; if (!o || g.over) return null;
    const ev = [], m = MODE[o.kind];
    let to = o.to, edge = o.e, wait = 0, move = true, cost = o.kind === 'taxi' ? o.price : m.cost;
    const d = dist(g.at, o.to);
    let ride = d * m.spd;
    if (cost > g.money) { ev.push(['Не вистачає грошей. Стоїш і думаєш 5 хв.', 'Not enough money. You stand there thinking for 5 min.']); g.t += 5; return finish(g, ev); }
    const r = g.rng();
    switch (o.kind) {
      case 'metro':
        if (r < 0.22) { const w = RI(g, 10, 35); wait += w; ev.push([`Повітряна тривога — метро стоїть ${w} хв.`, `Air alert — metro halted for ${w} min.`]); }
        else if (r < 0.45) { const w = RI(g, 15, 40); wait += w; ev.push([`Застряг у тунелі на ${w} хв. Світла нема.`, `Stuck in the tunnel for ${w} min. Lights out.`]); }
        else if (r < 0.6) { move = false; wait += 12; cost = 0; ev.push(['Станцію закрито. Виходиш нагору.', 'Station closed. Back up to the street.']); }
        else { const w = RI(g, 3, 9); wait += w; ev.push([`Тиснява, пропустив два потяги (+${w} хв).`, `Packed, missed two trains (+${w} min).`]); }
        break;
      case 'bus':
        if (r < 0.38) {
          const away = edgesOf(g.at).filter((e) => e.id !== g.last && e.id !== o.e.id).sort((x, y) => dist(other(y, g.at), GOAL) - dist(other(x, g.at), GOAL))[0];
          wait += RI(g, 10, 18);
          if (away) { edge = away; to = other(away, g.at); ride = dist(g.at, to) * m.spd; ev.push([`Автобус прийшов за 15 хв… але їде не туди. Вийшов: ${N[to][2]}.`, `Bus came in 15 min… going the wrong way. Off at ${N[to][3]}.`]); }
          else ev.push(['Автобус прийшов за 15 хв, повний.', 'Bus came in 15 min, packed.']);
        } else if (r < 0.75) { const w = RI(g, 10, 45); wait += w; ev.push([`Автобус ходить раз на годину. Чекав ${w} хв.`, `Bus runs once an hour. Waited ${w} min.`]); }
        else { const w = RI(g, 5, 15); wait += w; ev.push([`Пробка, +${w} хв.`, `Traffic jam, +${w} min.`]); }
        break;
      case 'marsh': {
        const q = Math.round(Math.pow(g.rng(), 2.2) * 120); wait += q; ev.push([`Черга на маршрутку: ${q} хв.`, `Marshrutka queue: ${q} min.`]);
        if (r < 0.2) { wait += 15; ev.push(['«Місць нема!» — чекаєш наступну.', '"No seats!" — waiting for the next one.']); }
        else if (r < 0.4) { const w = Math.round(d * 0.5 * MODE.walk.spd); wait += w; ev.push([`Висадили на півдорозі, далі пішки ${w} хв.`, `Dropped halfway, walked the rest: ${w} min.`]); }
        break;
      }
      case 'tram': case 'trolley':
        if (r < 0.3) { move = false; cost = 0; const w = RI(g, 10, 25); wait += w; ev.push([`Знеструмлення — ${m.ua} стоїть. Втратив ${w} хв.`, `Power cut — the ${m.en} is dead. Lost ${w} min.`]); }
        else { const w = RI(g, 5, 20); wait += w; ev.push([`Чекав ${w} хв на зупинці.`, `Waited ${w} min at the stop.`]); }
        break;
      case 'train': { const w = RI(g, 25, 80); wait += w; ev.push([`Електричка рідко ходить: чекав ${w} хв, але їде швидко.`, `City train is rare: waited ${w} min, but it's fast.`]); break; }
      case 'scooter':
        if (r < 0.35) { const w = Math.round(d * 0.5 * MODE.walk.spd); wait += w; ev.push([`Самокат сів на півдорозі. Котиш його ${w} хв.`, `Scooter died halfway. Pushed it for ${w} min.`]); }
        else ev.push(['Самокат їде! Холодно, але швидко.', 'Scooter works! Cold but quick.']);
        break;
      case 'walk':
        if (r < 0.35) { ride *= 1.25; ev.push(['Почався дощ. Йдеш повільніше.', 'It started raining. Walking slower.']); }
        else ev.push(['Йдеш пішки. Довго.', 'Walking. It takes forever.']);
        break;
      case 'taxi':
        if (r < 0.25) { move = false; cost = 0; wait += 12; ev.push(['Таксі скасувало замовлення.', 'The taxi cancelled the ride.']); }
        else ev.push([`Таксі, сурдж ×${(o.price / (d * 7)).toFixed(1)}: ${o.price} грн.`, `Taxi, surge ×${(o.price / (d * 7)).toFixed(1)}: ${o.price} UAH.`]);
        break;
    }
    if (move && edge.bridge && o.kind !== 'metro' && o.kind !== 'walk' && o.kind !== 'train') {
      if (g.rng() < 0.22) { const w = RI(g, 20, 50); wait += w; ev.push([`${BR[edge.bridge][0]} стоїть у заторі: +${w} хв.`, `${BR[edge.bridge][1]} is jammed: +${w} min.`]); }
    }
    if (g.rng() < 0.08 && o.kind !== 'metro') { const w = RI(g, 15, 40); wait += w; ev.push([`Повітряна тривога, все зупинилось на ${w} хв.`, `Air alert, everything stopped for ${w} min.`]); }
    g.t += Math.round(wait + (move ? ride : 0));
    g.money -= cost;
    if (move) { g.trail.push(to); g.at = to; g.last = edge.id; }
    return finish(g, ev);
  }
  function finish(g, ev) {
    g.turns++;
    for (const x of ev) g.log.unshift({ t: g.t, m: x });
    if (g.at === GOAL && g.t <= CURFEW) { g.over = true; g.won = true; }
    else if (g.t >= CURFEW) { g.over = true; g.won = false; g.t = Math.min(g.t, CURFEW + 120); }
    if (!g.over) offer(g);
    return ev;
  }

  // ---------- bots (for tests/balance) ----------
  function botPick(g, smart) {
    const o = g.opts;
    if (!smart) { const ok = o.map((x, i) => i).filter((i) => o[i].kind !== 'taxi' || o[i].price <= g.money); return ok[(g.rng() * ok.length) | 0]; }
    const here = dist(g.at, GOAL);
    let best = 0, bs = -1e9;
    o.forEach((x, i) => {
      if (x.kind === 'taxi' && x.price > g.money) return;
      const gain = here - dist(x.to, GOAL), exp = { metro: 25, bus: 35, marsh: 50, tram: 20, trolley: 20, train: 50, scooter: 15, walk: 0, taxi: 5 }[x.kind] + dist(g.at, x.to) * MODE[x.kind].spd;
      let s = gain / exp; if (x.kind === 'taxi') s *= (CURFEW - g.t < 120 ? 1.5 : 0.4);
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  function simulate(n, smart) {
    let win = 0, tsum = 0;
    for (let i = 0; i < n; i++) {
      const g = newGame(); offer(g); let k = 0;
      while (!g.over && k++ < 300) choose(g, botPick(g, smart));
      if (g.won) { win++; tsum += g.t - START; }
    }
    return { n, arrived: win, rate: win / n, avgMin: win ? Math.round(tsum / win) : null };
  }

  // ---------- UI ----------
  const T = {
    ua: { title: 'Дорога на Осокорки', pause: 'Пауза', resume: 'Далі', menu: '☰ Меню', goal: 'Оболонь → Осокорки до 00:00', at: 'Ти тут:', money: 'грн',
      startT: 'Дорога на Осокорки', startB: 'Ти на Оболоні, 17:00, у кишені 200 грн. Треба на Осокорки до комендантської. Місто буде проти.', go: 'Поїхали', again: 'Ще раз',
      win: 'Доїхав! 🎉', winB: (m, mo) => `Дорога зайняла ${Math.floor(m / 60)} год ${m % 60} хв. Лишилось ${mo} грн.`, lose: 'Комендантська 🌙', loseB: (p) => `Північ застала тебе тут: ${p}. Ночуєш у друзів.`,
      min: 'хв', walkL: 'дуже довго', taxiL: (p) => `${p} грн, сурдж`, to: '→', noMoney: 'не вистачає', },
    en: { title: 'Road to Osokorky', pause: 'Pause', resume: 'Resume', menu: '☰ Menu', goal: 'Obolon → Osokorky by 00:00', at: 'You are at:', money: 'UAH',
      startT: 'Road to Osokorky', startB: "You're in Obolon, 17:00, 200 UAH in your pocket. Get to Osokorky before curfew. The city will fight you.", go: "Let's go", again: 'Play again',
      win: 'You made it! 🎉', winB: (m, mo) => `The trip took ${Math.floor(m / 60)} h ${m % 60} min. ${mo} UAH left.`, lose: 'Curfew 🌙', loseB: (p) => `Midnight caught you at ${p}. Sleeping at a friend's.`,
      min: 'min', walkL: 'very long', taxiL: (p) => `${p} UAH, surge`, to: '→', noMoney: "can't afford", },
  };
  if (typeof document === 'undefined') return;
  let lang = localStorage.getItem('commute-lang') || 'ua';
  const $ = (id) => document.getElementById(id);
  const cv = $('map'), ctx = cv.getContext('2d');
  const MW = 120, MH = 124; cv.width = MW; cv.height = MH;
  let g = newGame(), paused = false, anim = null, started = false;
  // seeded jitter so lines look hand-drawn but don't wiggle (calm)
  let seed = 7; const sr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const jit = {}; const J = (k) => (jit[k] ??= (sr() - 0.5) * 1.6);
  function line(x1, y1, x2, y2, col, key) {
    const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 2));
    ctx.fillStyle = col;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, x = x1 + (x2 - x1) * u + J(key + 'x' + (i >> 2)), y = y1 + (y2 - y1) * u + J(key + 'y' + (i >> 2));
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  const RIVER = [[72, 0], [68, 18], [62, 38], [60, 52], [61, 68], [66, 88], [70, 104], [73, 124]];
  function draw(now) {
    ctx.fillStyle = '#1a1f33'; ctx.fillRect(0, 0, MW, MH);
    // river (thick wobbly blue)
    for (let w = -4; w <= 4; w++) for (let i = 0; i < RIVER.length - 1; i++) line(RIVER[i][0] + w, RIVER[i][1], RIVER[i + 1][0] + w, RIVER[i + 1][1], Math.abs(w) > 3 ? '#2b4a7a' : '#22406e', 'r' + w + i);
    for (const e of E) {
      const A = N[e.a], B = N[e.b];
      line(A[0], A[1], B[0], B[1], e.bridge ? '#b08a5a' : '#475069', 'e' + e.id);
    }
    // trail
    for (let i = 0; i < g.trail.length - 1; i++) { const A = N[g.trail[i]], B = N[g.trail[i + 1]]; line(A[0], A[1], B[0], B[1], '#fde047', 'e' + i + g.trail[i]); }
    for (const k in N) {
      const [x, y] = N[k];
      ctx.fillStyle = k === GOAL ? '#4ade80' : k === HOME ? '#f472b6' : '#cbd5e1';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    // player
    let px = N[g.at][0], py = N[g.at][1];
    if (anim) {
      const u = Math.min(1, (now - anim.t0) / 900), e = u * u * (3 - 2 * u);
      px = anim.x0 + (px - anim.x0) * e; py = anim.y0 + (py - anim.y0) * e;
      if (u >= 1) anim = null;
    }
    const pulse = 0.6 + 0.4 * Math.sin(now / 600);
    ctx.fillStyle = `rgba(253,224,71,${0.35 * pulse})`; ctx.fillRect(Math.round(px) - 3, Math.round(py) - 3, 7, 7);
    ctx.fillStyle = '#fde047'; ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
    ctx.fillStyle = '#0b1020'; ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    requestAnimationFrame(draw);
  }
  const hhmm = (t) => String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  const nm = (k) => N[k][lang === 'ua' ? 2 : 3];
  function render() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    $('lang').textContent = lang.toUpperCase(); $('title').textContent = L.title; $('menu').textContent = L.menu;
    $('pauseBtn').textContent = paused ? '▶' : '⏸';
    $('clock').textContent = '🕔 ' + hhmm(Math.min(g.t, CURFEW)); $('money').textContent = '💸 ' + g.money + ' ' + L.money;
    $('clock').className = CURFEW - g.t < 90 ? 'late' : '';
    $('where').textContent = L.at + ' ' + nm(g.at) + ' · ' + L.goal;
    const box = $('opts'); box.innerHTML = '';
    if (!g.over && started) g.opts.forEach((o, i) => {
      const m = MODE[o.kind], b = document.createElement('button');
      const sub = o.kind === 'walk' ? L.walkL : o.kind === 'taxi' ? (o.price > g.money ? L.noMoney + ' · ' : '') + L.taxiL(o.price) : m.cost + ' ' + L.money;
      b.innerHTML = `<b>${m.e} ${m[lang]}</b> ${L.to} ${nm(o.to)}<small>${sub}</small>`;
      b.className = 'opt' + (o.kind === 'walk' || o.kind === 'taxi' ? ' alw' : '');
      if (o.kind === 'taxi' && o.price > g.money) b.classList.add('poor');
      b.disabled = paused || !!anim;
      b.onclick = () => act(i);
      box.appendChild(b);
    });
    $('log').innerHTML = g.log.slice(0, 5).map((x, i) => `<div style="opacity:${1 - i * 0.16}"><span>${hhmm(Math.min(x.t, CURFEW))}</span> ${x.m[lang === 'ua' ? 0 : 1]}</div>`).join('');
  }
  function act(i) {
    if (paused || anim || g.over) return;
    const from = N[g.at]; choose(g, i);
    anim = { t0: performance.now(), x0: from[0], y0: from[1] };
    render(); setTimeout(render, 950);
    if (g.over) setTimeout(showEnd, 1100);
  }
  function overlay(t, b, btn) { $('oTitle').textContent = t; $('oBody').textContent = b; $('oBtn').textContent = btn; $('overlay').classList.remove('hidden'); }
  function showEnd() { const L = T[lang]; g.won ? overlay(L.win, L.winB(g.t - START, g.money), L.again) : overlay(L.lose, L.loseB(nm(g.at)), L.again); }
  $('oBtn').onclick = () => { $('overlay').classList.add('hidden'); g = newGame(); offer(g); started = true; paused = false; render(); };
  $('lang').onclick = () => { lang = lang === 'ua' ? 'en' : 'ua'; localStorage.setItem('commute-lang', lang); render(); if (!$('overlay').classList.contains('hidden')) { if (!started) overlay(T[lang].startT, T[lang].startB, T[lang].go); else if (g.over) showEnd(); } };
  $('pauseBtn').onclick = () => { if (!started || g.over) return; paused = !paused; $('pause').classList.toggle('hidden', !paused); $('pauseTxt').textContent = T[lang].pause; render(); };
  $('pause').onclick = () => $('pauseBtn').onclick();
  window.__commute = { simulate, getState: () => ({ at: g.at, t: g.t, money: g.money, over: g.over, won: g.won, opts: g.opts.map((o) => o.kind + '>' + o.to), started, anim: !!anim }), act, start: () => $('oBtn').click() };
  offer(g); render(); overlay(T[lang].startT, T[lang].startB, T[lang].go);
  requestAnimationFrame(draw);
})();
