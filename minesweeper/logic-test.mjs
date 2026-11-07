/**
 * Headless logic checks for minesweeper via Playwright-like page, or jsdom fallback.
 * Run: node minesweeper/logic-test.mjs
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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
await page.click('#oBtn'); // dismiss start overlay

const results = await page.evaluate(() => {
  const M = window.__minesweeper;
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail || '' });

  ok('api', !!M && M.ROWS === 12 && M.COLS === 14 && M.MINES === 18);
  ok('cells', M.state().cells.length === 168);

  // neighbours: corner has 3, edge 5, center 8; no wrap
  ok('corner-n', M.neighbors(0, 0).length === 3);
  ok('edge-n', M.neighbors(0, 5).length === 5);
  ok('center-n', M.neighbors(5, 5).length === 8);
  ok('no-wrap', !M.neighbors(0, 0).includes(M.idx(11, 13)));

  // first click safety: open center repeatedly on fresh boards
  let safe = true;
  for (let t = 0; t < 20; t++) {
    M.reset();
    document.getElementById('overlay').classList.add('hidden');
    const i = M.idx(5, 6);
    M.openAt(i);
    const st = M.state();
    if (st.cells[i].mine || st.over === 'lose') { safe = false; break; }
    if (!st.placed || st.mines !== 18) { safe = false; break; }
  }
  ok('first-click-safe', safe);

  // seeded flood + counts
  // Place mines at (0,2),(0,3),(1,2) around (0,0) far — open (5,5) with no nearby mines for flood
  const mines = [];
  for (let c = 0; c < 14; c++) mines.push(M.idx(0, c)); // top row all mines except we'll open bottom
  // Actually use a sparse pattern:
  const mineSet = [M.idx(2, 2), M.idx(2, 3), M.idx(3, 2)];
  M.seed(mineSet, null);
  // count at (3,3) should be 3
  const n33 = M.state().cells[M.idx(3, 3)].n;
  ok('count-3', n33 === 3, 'n=' + n33);
  const n11 = M.state().cells[M.idx(1, 1)].n;
  ok('count-1', n11 === 1, 'n=' + n11);
  const n00 = M.state().cells[M.idx(0, 0)].n;
  ok('count-0', n00 === 0, 'n=' + n00);

  M.openAt(M.idx(0, 0));
  const afterFlood = M.state();
  ok('flood-opened', afterFlood.cells[M.idx(0, 0)].open && afterFlood.open > 5, 'open=' + afterFlood.open);
  ok('flood-mines-closed', !afterFlood.cells[M.idx(2, 2)].open && !afterFlood.cells[M.idx(2, 3)].open && !afterFlood.cells[M.idx(3, 2)].open);
  ok('flood-border-open', afterFlood.cells[M.idx(3, 3)].open && afterFlood.cells[M.idx(3, 3)].n === 3);

  // flag + lose
  M.seed([M.idx(4, 4)], null);
  M.toggleFlag(M.idx(4, 4));
  ok('flag', M.state().cells[M.idx(4, 4)].flag && M.state().flags === 1);
  M.openAt(M.idx(4, 5)); // safe
  ok('open-safe', M.state().cells[M.idx(4, 5)].open && !M.state().over);
  M.toggleFlag(M.idx(4, 4)); // unflag
  M.openAt(M.idx(4, 4));
  ok('lose', M.state().over === 'lose');

  // win: one mine, open all else
  const only = [M.idx(11, 13)];
  M.seed(only, M.idx(0, 0));
  for (let i = 0; i < 168; i++) if (i !== only[0] && !M.state().cells[i].open) M.openAt(i);
  ok('win', M.state().over === 'win');

  // language toggle does not throw
  document.getElementById('lang').click();
  ok('lang-en', document.documentElement.lang === 'en');
  document.getElementById('lang').click();
  ok('lang-ua', document.documentElement.lang === 'uk');

  return out;
});

await browser.close();
server.close();

let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'OK' : 'FAIL';
  console.log(`${mark}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
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
