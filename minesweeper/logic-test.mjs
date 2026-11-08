/**
 * Headless logic checks for minesweeper (easy + hard).
 * Run: node minesweeper/logic-test.mjs  (needs playwright-core + Chrome)
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' };

function startServer() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let path = join(root, url === '/' ? 'index.html' : url);
    if (url.endsWith('/')) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('missing'); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = await startServer();
const port = server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(`http://127.0.0.1:${port}/minesweeper/`, { waitUntil: 'networkidle' });
await page.click('#oBtn');

const results = await page.evaluate(() => {
  const M = window.__minesweeper;
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail || '' });

  const expectedSchedule = (cells) => {
    let lights = 0, outages = 0;
    for (const c of cells) {
      if (!c.mine && c.n > 0) lights++;
      else outages++;
    }
    return { lights, outages };
  };

  // ---- easy ----
  M.setMode('easy');
  document.getElementById('overlay').classList.add('hidden');
  ok('easy-dims', M.ROWS === 12 && M.COLS === 14 && M.MINES === 18 && M.state().cells.length === 168);
  ok('easy-corner-n', M.neighbors(0, 0).length === 3);
  ok('easy-center-n', M.neighbors(5, 5).length === 8);
  ok('easy-no-wrap', !M.neighbors(0, 0).includes(M.idx(11, 13)));

  let safe = true;
  for (let t = 0; t < 12; t++) {
    M.reset();
    document.getElementById('overlay').classList.add('hidden');
    const i = M.idx(5, 6);
    M.openAt(i);
    const st = M.state();
    if (st.cells[i].mine || st.over === 'lose' || st.mines !== 18) { safe = false; break; }
  }
  ok('easy-first-safe', safe);

  M.seed([M.idx(2, 2), M.idx(2, 3), M.idx(3, 2)], null);
  ok('easy-count', M.state().cells[M.idx(3, 3)].n === 3);

  // Mine wall so flood from the left cannot clear the whole board / auto-win
  const easyWall = [];
  for (let r = 0; r < 12; r++) easyWall.push(M.idx(r, 5));
  M.seed(easyWall, null);
  M.openAt(M.idx(0, 0));
  const flood = M.state();
  ok('easy-flood', flood.over === false && flood.open > 5 && !flood.cells[M.idx(0, 5)].open && !flood.cells[M.idx(0, 6)].open, 'open=' + flood.open);
  // Zero flood region = outage grey+bolt; boundary = white digits; closed has no bolt
  const outageOpened = document.querySelectorAll('#board .cell.open.outage').length;
  const outageBolts = document.querySelectorAll('#board .cell.open.outage .bolt').length;
  const powerOpened = document.querySelectorAll('#board .cell.light').length;
  const closedNoBolt = [...document.querySelectorAll('#board .cell.closed')].every((el) => !el.querySelector('.bolt'));
  ok('easy-flood-zero-outage', outageOpened > 5 && outageBolts === outageOpened, 'outage=' + outageOpened + ' bolts=' + outageBolts);
  ok('easy-flood-power-boundary', powerOpened > 0 && flood.gridDigits() > 0, 'power=' + powerOpened + ' digits=' + flood.gridDigits());
  ok('easy-closed-no-bolt', closedNoBolt && document.querySelectorAll('#board .cell.closed').length > 0);

  M.seed([M.idx(0, 0), M.idx(11, 13)], null);
  M.toggleFlag(M.idx(0, 0));
  ok('easy-flag', M.state().flags === 1 && document.querySelectorAll('#board .cell.flagged').length === 1);
  M.openAt(M.idx(0, 1));
  ok('easy-play-dark-closed', document.querySelectorAll('#board .cell.closed').length > 0);
  ok('easy-play-has-digits', M.state().gridDigits() >= 1 && M.state().over === false, 'digits=' + M.state().gridDigits());
  ok('easy-play-digit-is-white', document.querySelectorAll('#board .cell.light').length >= 1);

  M.toggleFlag(M.idx(0, 0));
  M.openAt(M.idx(0, 0));
  ok('easy-lose', M.state().over === 'lose');
  {
    const st = M.state();
    const exp = expectedSchedule(st.cells);
    ok('easy-lose-schedule', st.boardEnded() && st.gridDigits() === 0 && st.gridFlags() === 0 && st.gridOutages() === exp.outages && st.gridLights() === exp.lights,
      `out=${st.gridOutages()}/${exp.outages} lit=${st.gridLights()}/${exp.lights}`);
    ok('easy-lose-zeros-stay-outage', exp.outages > st.mines && st.gridOutages() > st.mines);
  }
  ok('easy-lose-banner', document.getElementById('result').classList.contains('show'));

  M.seed([M.idx(11, 13)], M.idx(0, 0));
  for (let i = 0; i < 168; i++) if (i !== M.idx(11, 13) && !M.state().cells[i].open) M.openAt(i);
  ok('easy-win', M.state().over === 'win');
  {
    const st = M.state();
    const exp = expectedSchedule(st.cells);
    ok('easy-win-schedule', st.boardEnded() && st.gridDigits() === 0 && st.gridFlags() === 0 && st.gridOutages() === exp.outages && st.gridLights() === exp.lights,
      `out=${st.gridOutages()}/${exp.outages} lit=${st.gridLights()}/${exp.lights}`);
  }

  M.reset();
  document.getElementById('overlay').classList.add('hidden');
  ok('easy-replay-closed', !M.state().over && document.querySelectorAll('#board .cell.closed').length === 168 && !document.getElementById('result').classList.contains('show'));

  // ---- hard ----
  M.setMode('hard');
  document.getElementById('overlay').classList.add('hidden');
  const hardSt = M.state();
  ok('hard-dims', M.ROWS === 24 && M.COLS === 28 && M.MINES === 120 && hardSt.cells.length === 672, 'len=' + hardSt.cells.length);
  ok('hard-corner-n', M.neighbors(0, 0).length === 3);
  ok('hard-edge-n', M.neighbors(0, 10).length === 5);
  ok('hard-center-n', M.neighbors(12, 14).length === 8);
  ok('hard-no-wrap', !M.neighbors(0, 0).includes(M.idx(23, 27)) && !M.neighbors(23, 27).includes(M.idx(0, 0)));
  ok('hard-board-class', document.getElementById('board').classList.contains('hard'));
  ok('hard-counter', document.getElementById('darkCount').textContent === '120');

  safe = true;
  for (let t = 0; t < 8; t++) {
    M.reset();
    document.getElementById('overlay').classList.add('hidden');
    const i = M.idx(12, 14);
    M.openAt(i);
    const st = M.state();
    if (st.cells[i].mine || st.over === 'lose' || st.mines !== 120) { safe = false; break; }
  }
  ok('hard-first-safe', safe);

  M.seed([M.idx(10, 10), M.idx(10, 11), M.idx(11, 10)], null);
  ok('hard-count', M.state().cells[M.idx(11, 11)].n === 3, 'n=' + M.state().cells[M.idx(11, 11)].n);
  const hardWall = [];
  for (let r = 0; r < 24; r++) hardWall.push(M.idx(r, 10));
  M.seed(hardWall, null);
  M.openAt(M.idx(0, 0));
  const flooded = M.state();
  ok('hard-flood', flooded.over === false && flooded.open > 10 && !flooded.cells[M.idx(0, 10)].open && !flooded.cells[M.idx(0, 11)].open, 'open=' + flooded.open);
  ok('hard-flood-zero-outage', document.querySelectorAll('#board .cell.open.outage .bolt').length > 10);
  ok('hard-flood-power-boundary', flooded.gridDigits() > 0);

  M.seed([M.idx(5, 5)], null);
  M.toggleFlag(M.idx(5, 5));
  ok('hard-flag', M.state().flags === 1 && M.state().cells[M.idx(5, 5)].flag);
  M.toggleFlag(M.idx(5, 5));
  M.openAt(M.idx(5, 5));
  ok('hard-lose', M.state().over === 'lose');
  {
    const st = M.state();
    const exp = expectedSchedule(st.cells);
    ok('hard-lose-schedule', st.boardEnded() && st.gridDigits() === 0 && st.gridFlags() === 0 && st.gridOutages() === exp.outages && st.gridLights() === exp.lights);
  }

  M.setMode('easy');
  document.getElementById('overlay').classList.add('hidden');
  ok('switch-easy', M.mode === 'easy' && M.state().cells.length === 168 && !M.state().placed && M.state().open === 0);
  ok('switch-easy-counter', document.getElementById('darkCount').textContent === '18');
  M.openAt(M.idx(3, 3));
  const mid = M.state();
  M.setMode('hard');
  document.getElementById('overlay').classList.add('hidden');
  const after = M.state();
  ok('switch-hard-reset', after.mode === 'hard' && after.cells.length === 672 && !after.placed && after.open === 0 && after.flags === 0);
  ok('switch-hard-ui', document.getElementById('diffHard').classList.contains('on') && document.getElementById('darkCount').textContent === '120');

  M.seed([M.idx(23, 27)], M.idx(0, 0));
  for (let i = 0; i < 672; i++) if (i !== M.idx(23, 27) && !M.state().cells[i].open) M.openAt(i);
  ok('hard-win', M.state().over === 'win');
  {
    const st = M.state();
    const exp = expectedSchedule(st.cells);
    ok('hard-win-schedule', st.boardEnded() && st.gridDigits() === 0 && st.gridFlags() === 0 && st.gridOutages() === exp.outages && st.gridLights() === exp.lights);
  }

  document.getElementById('lang').click();
  ok('lang-en', document.documentElement.lang === 'en' && document.getElementById('darkLbl').textContent === 'traps');
  document.getElementById('lang').click();
  ok('lang-ua', document.documentElement.lang === 'uk' && document.getElementById('darkLbl').textContent === 'пастки');

  void mid;
  return out;
});

await browser.close();
server.close();

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'OK' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (!r.ok) failed++;
}
if (errors.length) {
  console.log('JS errors:', errors);
  failed += errors.length;
}
if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll logic tests passed.');
