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
    lismas: [101, 27, 'Лісовий масив', 'Lisovyi masyv'], lisova: [99, 41, 'Лісова', 'Lisova'], chern: [90, 46, 'Чернігівська', 'Chernihivska'],
    rusan: [75, 47, 'Русанівка', 'Rusanivka'], berez: [76, 77, 'Березняки', 'Bereznyaky'], vyrl: [97, 108, 'Вирлиця', 'Vyrlytsia'], borys: [106, 114, 'Бориспільська', 'Boryspilska'],
  };
  const LEFT = new Set(['troie', 'livob', 'darn', 'pozn', 'khark', 'osok', 'lismas', 'lisova', 'chern', 'rusan', 'berez', 'vyrl', 'borys']);
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
    ['troie', 'lismas', 'bus marsh'], ['lismas', 'lisova', 'bus tram'], ['lisova', 'chern', 'metro bus'], ['chern', 'darn', 'metro bus'],
    ['troie', 'chern', 'marsh tram'], ['livob', 'rusan', 'bus marsh'], ['rusan', 'darn', 'bus'], ['livob', 'berez', 'bus trolley'],
    ['berez', 'pozn', 'bus marsh'], ['darn', 'berez', 'marsh'], ['khark', 'vyrl', 'metro bus'], ['vyrl', 'borys', 'metro bus'],
    ['borys', 'osok', 'marsh bus'], ['vyrl', 'osok', 'marsh'],
  ].map(([a, b, m, br], i) => ({ id: i, a, b, modes: m.split(' '), bridge: br || null }));
  const BR = { pivn: ['Північний міст', 'Pivnichnyi bridge'], metro: ['міст Метро', 'Metro bridge'], paton: ['міст Патона', 'Paton bridge'], pivd: ['Південний міст', 'Pivdennyi bridge'], darnb: ['Дарницький міст', 'Darnytskyi bridge'] };
  // what each bridge normally lets across
  const BRIDGE_BASE = { pivn: ['bus', 'marsh', 'taxi', 'scooter', 'train'], metro: ['metro', 'walk', 'bus'], paton: ['bus', 'marsh', 'trolley', 'taxi', 'scooter'], pivd: ['taxi', 'marsh', 'bus', 'metro'], darnb: ['train', 'marsh', 'taxi'] };
  const BR_ORDER = ['pivn', 'metro', 'paton', 'pivd', 'darnb'];
  const MODE = {
    metro: { e: '🚇', ua: 'метро', en: 'metro', spd: 0.55, cost: 8 }, bus: { e: '🚌', ua: 'автобус', en: 'bus', spd: 1.3, cost: 8 },
    marsh: { e: '🚐', ua: 'маршрутка', en: 'marshrutka', spd: 1.0, cost: 15 }, tram: { e: '🚋', ua: 'трамвай', en: 'tram', spd: 1.2, cost: 8 },
    trolley: { e: '🚎', ua: 'тролейбус', en: 'trolleybus', spd: 1.3, cost: 8 }, train: { e: '🚆', ua: 'електричка', en: 'city train', spd: 0.6, cost: 10 },
    scooter: { e: '🛴', ua: 'самокат', en: 'e-scooter', spd: 0.9, cost: 35 }, walk: { e: "🚶", ua: "пішки", en: "walk", spd: 2.0, cost: 0 },
    wait: { e: '⏳', ua: 'чекати', en: 'wait', spd: 0, cost: 0 },
    taxi: { e: '🚕', ua: 'таксі', en: 'taxi', spd: 0.7, cost: 0 },
  };
  const TAXI_K = 12;
  const START = 17 * 60, CURFEW = 24 * 60, MONEY0 = 500, GOAL = 'osok', HOME = 'obolon';
  const dist = (a, b) => Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
  const other = (e, n) => (e.a === n ? e.b : e.a);
  const edgesOf = (n) => E.filter((e) => e.a === n || e.b === n);

  // ---------- core (pure, rng injectable) ----------
  function newGame(rng) {
    const gg = { rng: rng || Math.random, alert: 0, phone: 0, bridges: {}, at: HOME, t: START, money: MONEY0, last: -1, trail: [HOME], log: [], over: false, won: false, opts: [], turns: 0 };
    for (const k of BR_ORDER) gg.bridges[k] = { closed: false, allow: BRIDGE_BASE[k].slice() };
    tickBridges(gg, true);
    return gg;
  }
  // the city keeps flipping air alerts and bridge rules every turn
  function tickBridges(g, first) {
    const ev = [];
    if (g.alert > 0) { g.alert--; if (!g.alert) ev.push(['Відбій тривоги.', 'All clear.']); }
    else if (!first && g.rng() < 0.22) { g.alert = 1 + ((g.rng() * 3) | 0); ev.push(['🚨 Повітряна тривога! Мости перекривають.', '🚨 Air alert! Bridges are being closed.']); }
    for (const k of BR_ORDER) {
      const b = g.bridges[k], was = b.closed;
      if (b.closed) { if (g.rng() < (g.alert ? 0.2 : 0.45)) b.closed = false; }
      else if (g.rng() < (g.alert ? 0.45 : 0.15)) b.closed = true;
      if (k === 'metro' && g.alert) b.closed = true;
      b.allow = BRIDGE_BASE[k].filter(() => true);
      if (g.rng() < 0.35 && b.allow.length > 1) b.allow.splice((g.rng() * b.allow.length) | 0, 1);
      if (!first && was !== b.closed) ev.push(b.closed ? [`⛔ ${BR[k][0]} закрито.`, `⛔ ${BR[k][1]} closed.`] : [`✅ ${BR[k][0]} знову відкрито.`, `✅ ${BR[k][1]} reopened.`]);
    }
    return ev;
  }
  // once on the left bank the city never sends you back across the river
  const okEdge = (g, e) => e.id !== g.last && !(LEFT.has(g.at) && !LEFT.has(other(e, g.at)));
  const canCross = (g, e, m) => !e.bridge || (!g.bridges[e.bridge].closed && g.bridges[e.bridge].allow.includes(m));
  const R = (g, a, b) => a + g.rng() * (b - a);
  const RI = (g, a, b) => Math.round(R(g, a, b));
  function walkTarget(g) {
    const cand = edgesOf(g.at).filter((e) => okEdge(g, e) && canCross(g, e, 'walk')).sort((x, y) => dist(other(x, g.at), GOAL) - dist(other(y, g.at), GOAL));
    return cand[0];
  }
  function taxiPrice(g, e) { return Math.round(dist(g.at, other(e, g.at)) * TAXI_K * (1.6 + g.rng() * 2.6)); }
  function offer(g) {
    // the city offers exactly two transport options, preferring ones that lead away or are slow
    const here = dist(g.at, GOAL), cands = [];
    for (const e of edgesOf(g.at)) {
      if (!okEdge(g, e)) continue;
      const to = other(e, g.at), gain = here - dist(to, GOAL);
      for (const m of e.modes.concat(g.rng() < 0.25 && !g.phone ? ['scooter'] : [])) {
        if (!canCross(g, e, m)) continue;
        if (m === 'train' && g.rng() < 0.6) continue; // elektrychka is rare
        cands.push({ e, m, to, w: Math.exp(-gain / 45) * (MODE[m].spd > 1 ? 1.4 : 1) });
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
    const tt = edgesOf(g.at).filter((e) => okEdge(g, e) && canCross(g, e, 'taxi')).sort((x, y) => dist(other(x, g.at), GOAL) - dist(other(y, g.at), GOAL))[0];
    const opts = pick.map((p) => ({ kind: p.m, e: p.e, to: p.to }));
    if (wt) {
      opts.push({ kind: 'walk', e: wt, to: other(wt, g.at) });
    }
    if (tt && !g.phone) opts.push({ kind: 'taxi', e: tt, to: other(tt, g.at), price: taxiPrice(g, tt) });
    if (opts.length < 2) opts.push({ kind: 'wait', e: null, to: g.at });
    g.opts = opts;
    return opts;
  }
  // msg: [ua, en]
  // a neighbour that takes you away from the goal (never back across from the left bank)
  function awayEdge(g, exclId, mode) {
    const c = edgesOf(g.at).filter((e) => okEdge(g, e) && e.id !== exclId && canCross(g, e, mode));
    const prev = g.trail[g.trail.length - 2];
    return c.find((e) => other(e, g.at) === prev && dist(prev, GOAL) > dist(g.at, GOAL)) ||
      c.sort((x, y) => dist(other(y, g.at), GOAL) - dist(other(x, g.at), GOAL))[0];
  }
  const walkMin = (d, k) => Math.round(d * k * MODE.walk.spd);
  function choose(g, idx) {
    const o = g.opts[idx]; if (!o || g.over) return null;
    const ev = [], m = MODE[o.kind];
    let to = o.to, edge = o.e, wait = 0, move = true, cost = o.kind === 'taxi' ? o.price : m.cost;
    const d = dist(g.at, o.to);
    let ride = d * m.spd;
    if (cost > g.money) { ev.push(['Не вистачає грошей. Стоїш і думаєш 5 хв.', 'Not enough money. You stand there thinking for 5 min.']); g.t += 5; return finish(g, ev); }
    const r = g.rng();
    if (o.kind === 'wait') { g.t += 20; ev.push(['Чекаєш 20 хв, поки щось відкриють.', 'You wait 20 min for something to open.']); return finish(g, ev); }
    switch (o.kind) {
      case 'metro':
        if (r < (g.alert ? 0.6 : 0.1)) { const w = RI(g, 10, 35); wait += w; ev.push([`Повітряна тривога — метро стоїть ${w} хв.`, `Air alert — metro halted for ${w} min.`]); }
        else if (r < 0.32) { const w = RI(g, 15, 35); wait += w; ev.push([`Застряг у тунелі на ${w} хв. Світла нема.`, `Stuck in the tunnel for ${w} min. Lights out.`]); }
        else if (r < 0.52) { move = false; wait += 12; cost = 0; ev.push(['Станцію закрито. Виходиш нагору.', 'Station closed. Back up to the street.']); }
        else if (r < 0.6) { move = false; wait += 15; cost = 0; ev.push(['Вхід у метро закрили через натовп. Постояв 15 хв і пішов.', 'Metro entrance shut — too many people. Stood 15 min, gave up.']); }
        else if (r < 0.7) {
          const a = awayEdge(g, o.e.id, 'metro');
          if (a) { edge = a; to = other(a, g.at); ride = dist(g.at, to) * m.spd; wait += 8; ev.push([`На пересадці сів не в той бік. Задумався і доїхав до: ${N[to][2]}. Ну, буває.`, `Took the wrong direction at the transfer. Zoned out and rode to ${N[to][3]}. Happens.`]); }
          else { wait += 6; ev.push(['Мало не сів не в той бік. Вчасно вискочив.', 'Almost took the wrong direction. Jumped out just in time.']); }
        }
        else { const w = RI(g, 3, 9); wait += w; ev.push([`Тиснява, пропустив два потяги (+${w} хв).`, `Packed, missed two trains (+${w} min).`]); }
        break;
      case 'bus':
        if (r < 0.38) {
          const away = edgesOf(g.at).filter((e) => okEdge(g, e) && e.id !== o.e.id && canCross(g, e, 'bus')).sort((x, y) => dist(other(y, g.at), GOAL) - dist(other(x, g.at), GOAL))[0];
          wait += RI(g, 10, 18);
          if (away) { edge = away; to = other(away, g.at); ride = dist(g.at, to) * m.spd; ev.push([`Автобус прийшов за 15 хв… але їде не туди. Вийшов: ${N[to][2]}.`, `Bus came in 15 min… going the wrong way. Off at ${N[to][3]}.`]); }
          else ev.push(['Автобус прийшов за 15 хв, повний.', 'Bus came in 15 min, packed.']);
        } else if (r < 0.75) { const w = RI(g, 10, 35); wait += w; ev.push([`Автобус ходить раз на годину. Чекав ${w} хв.`, `Bus runs once an hour. Waited ${w} min.`]); }
        else if (r < 0.85) { wait += 25; ev.push(['Вулицю перекрили під кортеж. Автобус їде в об\'їзд через пів міста (+25 хв).', 'Street closed for a motorcade. The bus detours through half the city (+25 min).']); }
        else { const w = RI(g, 5, 15); wait += w; ev.push([`Пробка, +${w} хв.`, `Traffic jam, +${w} min.`]); }
        break;
      case 'marsh': {
        const q = Math.round(Math.pow(g.rng(), 2.6) * 120); wait += q; ev.push([`Черга на маршрутку: ${q} хв.`, `Marshrutka queue: ${q} min.`]);
        if (r < 0.2) { wait += 15; ev.push(['«Місць нема!» — чекаєш наступну.', '"No seats!" — waiting for the next one.']); }
        else if (r < 0.34) { wait += 25; ev.push(['Злива. Маршрутки набиті як банка шпротів, пропустив дві (+25 хв).', 'Downpour. Marshrutkas packed like sprat tins, let two go by (+25 min).']); }
        break;
      }
      case 'tram': case 'trolley':
        if (r < 0.3) { move = false; cost = 0; const w = RI(g, 10, 25); wait += w; ev.push([`Знеструмлення — ${m.ua} стоїть. Втратив ${w} хв.`, `Power cut — the ${m.en} is dead. Lost ${w} min.`]); }
        else if (r < 0.42) { wait += 12; ev.push(['«Київ Цифровий» завис — квиток не купується. Перезапуск, ще перезапуск… +12 хв.', '"Kyiv Digital" app froze — can\'t buy a ticket. Restart, restart again… +12 min.']); }
        else { const w = RI(g, 5, 20); wait += w; ev.push([`Чекав ${w} хв на зупинці.`, `Waited ${w} min at the stop.`]); }
        break;
      case 'train': { const w = RI(g, 25, 80); wait += w; ev.push([`Електричка рідко ходить: чекав ${w} хв, але їде швидко.`, `City train is rare: waited ${w} min, but it's fast.`]); break; }
      case 'scooter':
        if (r < 0.35) { const w = 5 + walkMin(d, 0.8); move = true; ride = 0; wait += w; ev.push([`Самокат сів через 5 хвилин. Далі пішки до розвилки (${w} хв), гроші не повернули.`, `Scooter died after 5 minutes. Walked the rest to the next fork (${w} min); no refund.`]); }
        else ev.push(['Самокат їде! Холодно, але швидко.', 'Scooter works! Cold but quick.']);
        break;
      case 'walk':
        if (g.alert && g.rng() < 0.4) {
          // GPS jamming during an alert: navigator thinks you're in Peru, you wander off to a random wrong stop
          const pool = Object.keys(N).filter((k) => k !== g.at && k !== o.to && k !== GOAL && LEFT.has(g.at) === LEFT.has(k) && dist(k, g.at) < 40);
          const lost = pool[(g.rng() * pool.length) | 0];
          if (lost) {
            to = lost; edge = { id: -1, bridge: null }; ride = 0; wait += RI(g, 25, 45);
            ev.push([`📡 РЕБ! Навігатор каже, що ти в Перу 🇵🇪. Йдучи за ним, заблукав і вийшов на: ${N[lost][2]}. Лам не бачив.`, `📡 GPS jamming! The navigator says you're in Peru 🇵🇪. Following it, you got lost and came out at ${N[lost][3]}. No llamas seen.`]);
            break;
          }
        }
        if (r < 0.35) { ride *= 1.25; ev.push(['Почався дощ. Йдеш повільніше.', 'It started raining. Walking slower.']); }
        else if (r < 0.5) { wait += 20; ev.push(['Зрізав через будмайданчик — а там глухий паркан. Назад (+20 хв).', 'Took a shortcut through a construction site — dead-end fence. Back you go (+20 min).']); }
        else ev.push(['Йдеш пішки. Довго.', 'Walking. It takes forever.']);
        break;
      case 'taxi':
        if (r < 0.25) { move = false; cost = 0; wait += 12; ev.push(['Таксі скасувало замовлення.', 'The taxi cancelled the ride.']); }
        else if (o.to === GOAL && g.at !== 'pozn' && r < 0.45) { to = 'pozn'; edge = { id: -1, bridge: null }; ride = dist(g.at, 'pozn') * m.spd; ev.push([`Таксист: «Осокорки? Це де взагалі?» Висадив на Позняках за ${o.price} грн.`, `Driver: "Osokorky? Where's that even?" Dropped you at Pozniaky for ${o.price} UAH.`]); }
        else ev.push([`Таксі, сурдж ×${(o.price / (d * TAXI_K)).toFixed(1)}: ${o.price} грн.`, `Taxi, surge ×${(o.price / (d * TAXI_K)).toFixed(1)}: ${o.price} UAH.`]);
        break;
    }
    if (move && o.kind === 'marsh' && g.rng() < 0.35) {
      // driver didn't hear "stop at the stop!" — you end up one stop past (same bank rule applies)
      const past = edgesOf(to).map((e) => other(e, to)).filter((k) => k !== g.at && LEFT.has(k) === LEFT.has(to));
      const k = past[(g.rng() * past.length) | 0];
      if (k) { ride += dist(to, k) * m.spd; ev.push([`«Зупиніть на зупинці!» — водій не почув. Проїхав ${N[to][2]}, вийшов аж на: ${N[k][2]}.`, `"Stop at the stop!" — the driver didn't hear. Missed ${N[to][3]}, got off at ${N[k][3]}.`]); to = k; edge = { id: -1, bridge: null }; }
    }
    if (move && ['bus', 'trolley', 'marsh'].includes(o.kind) && g.rng() < 0.07) { const w = walkMin(d, 0.6); ride *= 0.4; wait += w; ev.push([`ДТП на маршруті! Всіх висадили. Далі пішки до розвилки (${w} хв).`, `Road accident on the route! Everyone off. Walking on to the next fork (${w} min).`]); }
    if (g.alert && move && ['bus', 'trolley', 'marsh', 'tram', 'taxi'].includes(o.kind) && g.rng() < 0.25) {
      if (g.rng() < 0.5) ev.push(['Тривога. Водій за законом сам вирішує — вирішив їхати далі. Пощастило.', 'Air alert. By law the driver decides — he keeps going. Lucky.']);
      else { const w = 15 + walkMin(d, 0.5); ride *= 0.5; wait += w; ev.push([`Тривога. Водій висадив усіх біля укриття. 15 хв перечекав, далі біжиш сам на свій страх і ризик (${w} хв).`, `Air alert. The driver dropped everyone at a shelter. Waited 15 min, then ran on at your own risk (${w} min).`]); }
    }
    if (g.rng() < 0.05) { wait += 20; ev.push(['Зустрів знайомого. «Та я на хвилинку!» — 20 хв пролетіли.', 'Ran into an old friend. "Just a minute!" — 20 minutes gone.']); }
    if (g.rng() < 0.04) { const f = Math.min(50, Math.max(0, g.money - cost)); g.money -= f; wait += 30; ev.push([`📵 Телефон сів. 30 хв у кав'ярні на зарядці, капучино ${f} грн.`, `📵 Phone died. 30 min charging in a coffee shop, cappuccino ${f} UAH.`]); }
    if (move && edge && edge.bridge && o.kind !== 'metro' && o.kind !== 'walk' && o.kind !== 'train') {
      if (g.rng() < 0.15) { const w = RI(g, 20, 45); wait += w; ev.push([`${BR[edge.bridge][0]} стоїть у заторі: +${w} хв.`, `${BR[edge.bridge][1]} is jammed: +${w} min.`]); }
    }
    if (g.alert && g.rng() < 0.3 && o.kind !== 'metro') { const w = RI(g, 15, 40); wait += w; ev.push([`Повітряна тривога, все зупинилось на ${w} хв.`, `Air alert, everything stopped for ${w} min.`]); }
    g.t += Math.round(wait + (move ? ride : 0));
    g.money -= cost;
    if (move) { g.trail.push(to); g.at = to; g.last = edge.id; }
    return finish(g, ev);
  }
  function finish(g, ev) {
    g.turns++;
    if (g.phone > 0) g.phone--;
    if (!g.over) ev.push(...tickBridges(g));
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
      const gain = here - dist(x.to, GOAL) + (x.kind === 'wait' ? 0.01 : 0), exp = { wait: 20, metro: 25, bus: 35, marsh: 50, tram: 20, trolley: 20, train: 50, scooter: 15, walk: 0, taxi: 5 }[x.kind] + dist(g.at, x.to) * MODE[x.kind].spd;
      let s = gain / exp; if (x.kind === 'taxi') s *= (CURFEW - g.t < 120 ? 1.5 : 0.4);
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  function simulate(n, smart) {
    let win = 0, tsum = 0, back = 0;
    for (let i = 0; i < n; i++) {
      const g = newGame(); offer(g); let k = 0;
      while (!g.over && k++ < 300) { const was = g.at; choose(g, botPick(g, smart)); if (LEFT.has(was) && !LEFT.has(g.at)) back++; }
      if (g.won) { win++; tsum += g.t - START; }
    }
    return { n, arrived: win, rate: win / n, avgMin: win ? Math.round(tsum / win) : null, crossedBack: back };
  }

  // ---------- UI ----------
  const T = {
    ua: { title: 'Дорога на Осокорки', pause: 'Пауза', resume: 'Далі', menu: '☰ Меню', goal: 'Оболонь → Осокорки до 00:00', at: 'Ти тут:', money: 'грн',
      startT: 'Дорога на Осокорки', startB: 'Ти на Оболоні, 17:00, у кишені 500 грн. Треба на Осокорки до комендантської. Місто буде проти.', go: 'Поїхали', again: 'Ще раз',
      win: 'Доїхав! 🎉', winB: (m, mo) => `Дорога зайняла ${Math.floor(m / 60)} год ${m % 60} хв. Лишилось ${mo} грн.`, lose: 'Комендантська 🌙', loseB: (p) => `Північ застала тебе тут: ${p}. Ночуєш у друзів.`,
      full: '📜 Читати всю подорож', min: 'хв', walkL: 'дуже довго', taxiL: (p) => `${p} грн, сурдж`, to: '→', noMoney: 'не вистачає', },
    en: { title: 'Road to Osokorky', pause: 'Pause', resume: 'Resume', menu: '☰ Menu', goal: 'Obolon → Osokorky by 00:00', at: 'You are at:', money: 'UAH',
      startT: 'Road to Osokorky', startB: "You're in Obolon, 17:00, 500 UAH in your pocket. Get to Osokorky before curfew. The city will fight you.", go: "Let's go", again: 'Play again',
      win: 'You made it! 🎉', winB: (m, mo) => `The trip took ${Math.floor(m / 60)} h ${m % 60} min. ${mo} UAH left.`, lose: 'Curfew 🌙', loseB: (p) => `Midnight caught you at ${p}. Sleeping at a friend's.`,
      full: '📜 Read the whole trip', min: 'min', walkL: 'very long', taxiL: (p) => `${p} UAH, surge`, to: '→', noMoney: "can't afford", },
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
      line(A[0], A[1], B[0], B[1], e.bridge ? (g.bridges[e.bridge].closed ? '#ef4444' : '#d6a35c') : '#475069', 'e' + e.id);
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
    $('bridges').innerHTML = (g.alert ? `<div class="al">${lang === 'ua' ? '🚨 ТРИВОГА' : '🚨 AIR ALERT'}</div>` : '') + BR_ORDER.map((k) => {
      const b = g.bridges[k];
      return `<div class="${b.closed ? 'cl' : ''}"><b>${BR[k][lang === 'ua' ? 0 : 1]}</b> ${b.closed ? '⛔' : b.allow.map((x) => MODE[x].e).join('')}</div>`;
    }).join('');
    const box = $('opts'); box.innerHTML = '';
    if (!g.over && started) g.opts.forEach((o, i) => {
      const m = MODE[o.kind], b = document.createElement('button');
      const sub = o.kind === 'wait' ? '20 ' + L.min : o.kind === 'walk' ? L.walkL : o.kind === 'taxi' ? (o.price > g.money ? L.noMoney + ' · ' : '') + L.taxiL(o.price) : m.cost + ' ' + L.money;
      b.innerHTML = o.kind === 'wait' ? `<b>${m.e} ${m[lang]}</b>` : `<b>${m.e} ${m[lang]}</b> ${L.to} ${nm(o.to)}${o.e && o.e.bridge ? ' 🌉' : ''}<small>${sub}</small>`;
      b.className = 'opt' + (o.kind === 'walk' || o.kind === 'taxi' ? ' alw' : '');
      if (o.kind === 'taxi' && o.price > g.money) b.classList.add('poor');
      b.disabled = paused || !!anim;
      b.onclick = () => act(i);
      box.appendChild(b);
    });
    const lg = $('log');
    lg.innerHTML = logHtml();
    if (logStick) lg.scrollTop = lg.scrollHeight;
  }
  // full trip, chronological (log is stored newest-first)
  // follow newest entries unless the player scrolled up to read
  let logStick = true;
  $('log').addEventListener('scroll', () => { const l = $('log'); logStick = l.scrollTop + l.clientHeight >= l.scrollHeight - 12; }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => { if (logStick) $('log').scrollTop = $('log').scrollHeight; }).observe($('log'));
  function logHtml() {
    return g.log.slice().reverse().map((x) => `<div><span>${hhmm(Math.min(x.t, CURFEW))}</span> ${x.m[lang === 'ua' ? 0 : 1]}</div>`).join('');
  }
  function openFull() {
    $('fullTitle').textContent = T[lang].full; $('fullClose').textContent = '✕';
    const f = $('fullLog'); f.innerHTML = logHtml(); $('full').classList.remove('hidden'); f.scrollTop = 0;
  }
  function act(i) {
    if (paused || anim || g.over) return;
    const from = N[g.at]; choose(g, i);
    anim = { t0: performance.now(), x0: from[0], y0: from[1] };
    render(); setTimeout(render, 950);
    if (g.over) setTimeout(showEnd, 1100);
  }
  function overlay(t, b, btn) { $('fullBtn').classList.toggle('hidden', !(started && g.over)); $('fullBtn').textContent = T[lang].full; $('oTitle').textContent = t; $('oBody').textContent = b; $('oBtn').textContent = btn; $('overlay').classList.remove('hidden'); }
  function showEnd() { const L = T[lang]; g.won ? overlay(L.win, L.winB(g.t - START, g.money), L.again) : overlay(L.lose, L.loseB(nm(g.at)), L.again); }
  $('fullBtn').onclick = openFull; $('fullClose').onclick = () => $('full').classList.add('hidden');
  $('oBtn').onclick = () => { $('overlay').classList.add('hidden'); g = newGame(); offer(g); started = true; logStick = true; paused = false; render(); };
  $('lang').onclick = () => { lang = lang === 'ua' ? 'en' : 'ua'; localStorage.setItem('commute-lang', lang); render(); if (!$('overlay').classList.contains('hidden')) { if (!started) overlay(T[lang].startT, T[lang].startB, T[lang].go); else if (g.over) showEnd(); } };
  $('pauseBtn').onclick = () => { if (!started || g.over) return; paused = !paused; $('pause').classList.toggle('hidden', !paused); $('pauseTxt').textContent = T[lang].pause; render(); };
  $('pause').onclick = () => $('pauseBtn').onclick();
  window.__commute = { simulate, getState: () => ({ at: g.at, t: g.t, money: g.money, over: g.over, won: g.won, opts: g.opts.map((o) => o.kind + '>' + o.to), started, anim: !!anim }), act, openFull, logCount: () => g.log.length, start: () => $('oBtn').click() };
  offer(g); render(); overlay(T[lang].startT, T[lang].startB, T[lang].go);
  requestAnimationFrame(draw);
})();
