/* One Day in Kyiv — "Кості світла" dice: guess hours of electricity */
(function () {
  'use strict';
  const T = {
    ua: { title: 'Кості світла', guess: 'Скільки годин світла сьогодні буде?', hold: '🎲 Затисни й відпусти', shaking: 'Трусимо… відпусти!', hint: 'Затисни кнопку або кості, щоб потрусити, відпусти — кидок', again: 'Грати ще раз', rolling: 'Кидаємо…',
      info: (w, b) => `⚪ ${w} год світла · ⚫ ${b} год без світла`, light: 'є світло', dark: 'немає світла',
      win: (n) => `Вгадав! Світло було ${n} год ⚡`, lose: (n, g) => `Світло було ${n} год, твій прогноз ${g} (різниця ${Math.abs(n - g)})` },
    en: { title: 'Power Dice', guess: 'How many hours of power today?', hold: '🎲 Hold & release', shaking: 'Shaking… let go!', hint: 'Hold the button or dice to shake, release to throw', again: 'Play again', rolling: 'Rolling…',
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
    $('result').textContent = ''; $('result').className = ''; $('meme').textContent = ''; $('wrap').classList.remove('done'); lastInfo = ''; $('rollInfo').textContent = ''; hour = 0;
    lightHours = 0;
  }
  async function rollDie(el, v) {
    el.classList.remove('roll'); void el.offsetWidth; el.classList.add('roll');
    for (let i = 0; i < 5; i++) { face(el, rnd()); await sleep(90); }
    face(el, v);
  }
  let hour = 0, rolls = [], shakeTimer = null;
  const diceEls = () => [$('dw'), $('db')];
  function startHold(ev) {
    if (ev) ev.preventDefault();
    if (state === 'done') return;
    if (state !== 'idle' && state !== 'ready') return;
    if (state === 'idle') { $('guess').disabled = true; hour = 0; rolls = []; lightHours = 0; }
    state = 'holding'; applyLang();
    diceEls().forEach((d) => { d.classList.remove('roll'); d.classList.add('shake'); });
    shakeTimer = setInterval(() => diceEls().forEach((d) => face(d, rnd())), 140);
  }
  async function release() {
    if (state !== 'holding') return;
    clearInterval(shakeTimer); shakeTimer = null;
    state = 'throwing'; applyLang();
    diceEls().forEach((d) => d.classList.remove('shake'));
    const w = rnd(), b = rnd();
    rolls.push([w, b]);
    await Promise.all([rollDie($('dw'), w), rollDie($('db'), b)]);
    lastInfo = [w, b]; $('rollInfo').textContent = T[lang].info(w, b);
    for (let i = 0; i < w && hour < 24; i++, hour++) { paint(hour, true); lightHours++; await sleep(110); }
    for (let i = 0; i < b && hour < 24; i++, hour++) { paint(hour, false); await sleep(110); }
    window.__dice.lastRolls = rolls;
    if (hour >= 24) { state = 'done'; $('guess').disabled = false; showResult(+$('guess').value); $('wrap').classList.add('done'); showMeme(); }
    else state = 'ready';
    applyLang();
  }
  function onBtnClick() { if (state === 'done') { reset(); state = 'idle'; applyLang(); } }
  // memes: drop a file into memes/ and add one line to memes/memes.json
  let memes = [], lastMeme = -1;
  fetch('memes/memes.json').then((r) => r.json()).then((a) => { memes = a.filter((m) => m && m.file); }).catch(() => {});
  function showMeme() {
    const box = $('meme'); box.textContent = '';
    if (!memes.length) return;
    let i = (Math.random() * memes.length) | 0;
    if (memes.length > 1 && i === lastMeme) i = (i + 1 + ((Math.random() * (memes.length - 1)) | 0)) % memes.length;
    lastMeme = i;
    const img = new Image(); img.src = 'memes/' + memes[i].file; img.alt = memes[i].alt || ''; img.decoding = 'async';
    box.appendChild(img);
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
    $('btn').textContent = state === 'done' ? L.again : state === 'holding' ? L.shaking : state === 'throwing' ? L.rolling : L.hold;
    $('btn').disabled = state === 'throwing';
    if (!lastInfo || state === 'idle') $('rollInfo').textContent = state === 'done' ? '' : L.hint;
    if (lastInfo) $('rollInfo').textContent = L.info(lastInfo[0], lastInfo[1]);
    if (state === 'done') showResult(lastGuess);
  }
  $('guess').addEventListener('input', () => { $('guessVal').textContent = $('guess').value; });
  $('lang').addEventListener('click', () => { lang = lang === 'ua' ? 'en' : 'ua'; localStorage.setItem('dice-lang', lang); applyLang(); });
  for (const el of [$('btn'), $('dice')]) {
    el.addEventListener('pointerdown', startHold);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  $('btn').addEventListener('click', onBtnClick);
  window.addEventListener('pointerup', release);
  window.__dice = { startHold: () => startHold(), release, lastMeme: () => lastMeme, getState: () => ({ state, meme: $('meme').querySelector('img')?.getAttribute('src') || null, lightHours, painted: cells.filter((c) => !c.classList.contains('empty')).length }) };
  applyLang();
})();
