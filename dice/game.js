/* One Day in Kyiv — "Кості світла" dice: guess hours of electricity */
(function () {
  'use strict';
  const T = {
    ua: { title: 'Кості світла', guess: 'Скільки годин світла сьогодні буде?', roll: 'Кинути кості', again: 'Грати ще раз', rolling: 'Кидаємо…',
      info: (w, b) => `⚪ ${w} год світла · ⚫ ${b} год без світла`, light: 'є світло', dark: 'немає світла',
      win: (n) => `Вгадав! Світло було ${n} год ⚡`, lose: (n, g) => `Світло було ${n} год, твій прогноз ${g} (різниця ${Math.abs(n - g)})` },
    en: { title: 'Power Dice', guess: 'How many hours of power today?', roll: 'Roll the dice', again: 'Play again', rolling: 'Rolling…',
      info: (w, b) => `⚪ ${w} h power · ⚫ ${b} h outage`, light: 'power on', dark: 'no power',
      win: (n) => `Spot on! ${n} h of power ⚡`, lose: (n, g) => `Power was on ${n} h, you guessed ${g} (off by ${Math.abs(n - g)})` },
  };
  let lang = localStorage.getItem('dice-lang') || 'ua';
  const $ = (id) => document.getElementById(id);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const grid = $('grid'), cells = [];
  for (let h = 0; h < 24; h++) {
    const c = document.createElement('div');
    c.className = 'cell empty';
    c.innerHTML = '<span class="ic"></span>' + String(h).padStart(2, '0') + ':00';
    grid.appendChild(c); cells.push(c);
  }
  for (const d of [$('dw'), $('db')]) for (let i = 0; i < 9; i++) d.appendChild(document.createElement('i'));
  function face(el, n) { [...el.children].forEach((p, i) => p.classList.toggle('on', PIPS[n].includes(i))); }
  face($('dw'), 1); face($('db'), 1);

  let state = 'idle', lightHours = 0, lastInfo = '';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = () => 1 + ((Math.random() * 6) | 0);

  function paint(h, light) {
    const c = cells[h];
    c.className = 'cell ' + (light ? 'light' : 'dark');
    c.querySelector('.ic').textContent = light ? '⚡' : '🚫';
  }
  function reset() {
    cells.forEach((c) => { c.className = 'cell empty'; c.querySelector('.ic').textContent = ''; });
    $('result').textContent = ''; $('result').className = ''; lastInfo = ''; $('rollInfo').textContent = '';
    lightHours = 0;
  }
  async function rollDie(el, v) {
    el.classList.remove('roll'); void el.offsetWidth; el.classList.add('roll');
    for (let i = 0; i < 5; i++) { face(el, rnd()); await sleep(90); }
    face(el, v);
  }
  async function play() {
    if (state === 'rolling') return;
    if (state === 'done') { reset(); state = 'idle'; applyLang(); return; }
    state = 'rolling'; applyLang();
    $('guess').disabled = true;
    const guess = +$('guess').value;
    let h = 0;
    const rolls = [];
    while (h < 24) {
      const w = rnd(), b = rnd();
      rolls.push([w, b]);
      $('rollInfo').textContent = T[lang].rolling;
      await Promise.all([rollDie($('dw'), w), rollDie($('db'), b)]);
      lastInfo = [w, b]; $('rollInfo').textContent = T[lang].info(w, b);
      for (let i = 0; i < w && h < 24; i++, h++) { paint(h, true); lightHours++; await sleep(120); }
      for (let i = 0; i < b && h < 24; i++, h++) { paint(h, false); await sleep(120); }
      await sleep(250);
    }
    window.__dice.lastRolls = rolls;
    state = 'done'; $('guess').disabled = false;
    showResult(guess); applyLang();
  }
  let lastGuess = 0;
  function showResult(g) {
    lastGuess = g;
    const r = $('result'), L = T[lang];
    if (lightHours === g) { r.textContent = L.win(lightHours); r.className = 'win'; }
    else { r.textContent = L.lose(lightHours, g); r.className = 'lose'; }
  }
  function applyLang() {
    const L = T[lang];
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    $('lang').textContent = lang.toUpperCase();
    $('title').textContent = L.title; $('guessLbl').textContent = L.guess;
    $('lgL').textContent = L.light; $('lgD').textContent = L.dark;
    $('btn').textContent = state === 'done' ? L.again : state === 'rolling' ? L.rolling : L.roll;
    $('btn').disabled = state === 'rolling';
    if (lastInfo) $('rollInfo').textContent = L.info(lastInfo[0], lastInfo[1]);
    if (state === 'done') showResult(lastGuess);
  }
  $('guess').addEventListener('input', () => { $('guessVal').textContent = $('guess').value; });
  $('lang').addEventListener('click', () => { lang = lang === 'ua' ? 'en' : 'ua'; localStorage.setItem('dice-lang', lang); applyLang(); });
  $('btn').addEventListener('click', play);
  window.__dice = { play, getState: () => ({ state, lightHours, painted: cells.filter((c) => !c.classList.contains('empty')).length }) };
  applyLang();
})();
