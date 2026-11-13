/* One Day in Kyiv — "Кості світла" dice: guess hours of electricity */
(function () {
  'use strict';
  const T = {
    ua: { title: 'Кості світла', guess: 'Скільки годин світла сьогодні буде?', hold: '🎲 Затисни й відпусти', shaking: 'Трусимо… відпусти!', hint: 'Затисни кнопку або кості, щоб потрусити, відпусти — кидок', again: 'Грати ще раз', rolling: 'Кидаємо…',
      info: (w, b) => `⚪ ${w} год світла · ⚫ ${b} год без світла`, light: 'є світло', dark: 'немає світла',
      winTitle: 'Вгадали!', loseTitle: 'Не вгадали', winIcon: '✓', loseIcon: '✕',
      lightLbl: 'Світло', guessLbl: 'Ваш прогноз', hours: (n) => `${n} год`,
      diff: (d) => d === 0 ? 'Точно в ціль' : `Різниця: ${d} год` },
    en: { title: 'Power Dice', guess: 'How many hours of power today?', hold: '🎲 Hold & release', shaking: 'Shaking… let go!', hint: 'Hold the button or dice to shake, release to throw', again: 'Play again', rolling: 'Rolling…',
      info: (w, b) => `⚪ ${w} h power · ⚫ ${b} h outage`, light: 'power on', dark: 'no power',
      winTitle: 'You got it!', loseTitle: 'Not quite', winIcon: '✓', loseIcon: '✕',
      lightLbl: 'Power', guessLbl: 'Your guess', hours: (n) => `${n} h`,
      diff: (d) => d === 0 ? 'Exact match' : `Difference: ${d} h` },
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
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint(h, light) {
    const c = cells[h];
    c.className = 'cell ' + (light ? 'light' : 'dark');
    c.querySelector('.ic').textContent = light ? '⚡' : '🚫';
  }
  function clearResult() { $('result').className = ''; }
  function reset() {
    cells.forEach((c) => { c.className = 'cell empty'; c.querySelector('.ic').textContent = ''; });
    clearResult(); $('wrap').classList.remove('done'); lastInfo = ''; $('rollInfo').textContent = ''; hour = 0;
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(false);
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
    if (hour >= 24) { state = 'done'; $('guess').disabled = false; showResult(+$('guess').value, true); $('wrap').classList.add('done'); }
    else state = 'ready';
    applyLang();
  }
  function onBtnClick() { if (state === 'done') { reset(); state = 'idle'; applyLang(); } }
  let lastGuess = 0;
  function showResult(g, animate) {
    if (typeof setZsuDonateVisible === 'function') setZsuDonateVisible(true);
    lastGuess = g;
    const r = $('result'), L = T[lang], win = lightHours === g, diff = Math.abs(lightHours - g);
    const enter = animate ? (!reduceMotion() ? ' enter' : '') : (r.classList.contains('enter') ? ' enter' : '');
    r.className = 'show ' + (win ? 'win' : 'lose') + enter;
    $('resultIcon').textContent = win ? L.winIcon : L.loseIcon;
    $('resultTitle').textContent = win ? L.winTitle : L.loseTitle;
    $('resultLightLbl').textContent = L.lightLbl;
    $('resultGuessLbl').textContent = L.guessLbl;
    $('resultLightVal').textContent = L.hours(lightHours);
    $('resultGuessVal').textContent = L.hours(g);
    $('resultDiff').textContent = L.diff(diff);
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
    if (state === 'done') showResult(lastGuess, false);
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
  window.__dice = {
    startHold: () => startHold(),
    release,
    /** Test/helper: paint a finished day and show the result card (does not roll). */
    forceResult(hours, guess) {
      reset();
      lightHours = 0;
      for (let h = 0; h < 24; h++) {
        const light = h < hours;
        paint(h, light);
        if (light) lightHours++;
      }
      $('guess').value = String(guess);
      $('guessVal').textContent = String(guess);
      state = 'done';
      $('wrap').classList.add('done');
      showResult(guess, true);
      applyLang();
    },
    getState: () => ({
      state,
      lightHours,
      painted: cells.filter((c) => !c.classList.contains('empty')).length,
      result: state === 'done' ? { win: lightHours === lastGuess, lightHours, guess: lastGuess } : null,
    }),
  };
  applyLang();
})();
