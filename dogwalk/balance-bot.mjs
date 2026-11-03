import { chromium } from 'playwright';
import path from 'path';

const REACTION_MS = 400;
const TARGET_S = 60;
const RUNS = 3;

async function oneRun(browser, runId) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = 'file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'index.html');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('#oBtn');
  await page.waitForTimeout(100);

  let pending = null; // { lane, at }
  const t0 = Date.now();
  let lastDismiss = 0;

  while (true) {
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed >= TARGET_S + 5) break; // cushion

    const snap = await page.evaluate(({ reactionPending, now }) => {
      const g = window.__runner;
      const st = g.getState();
      if (!st.running || st.dead) return { ...st, decision: null };

      // Dismiss alerts
      g.dismissAllNotifs();

      const look = 18; // look-ahead z
      const danger = [0, 0, 0];
      for (const h of st.hazards) {
        if (h.z < 5.5 || h.z > look) continue;
        // weight closer hazards higher
        const w = 1.2 - (h.z - 5.5) / look;
        if (h.kind === 'cat') {
          // predict lane when it reaches player depth roughly
          // cat moves laterally; if currently near our x band treat lane
          danger[h.lane] += w * 0.85;
        } else {
          danger[h.lane] += w * (h.kind === 'dog' ? 1.3 : 1);
        }
      }
      // Prefer current lane if safe enough
      let best = st.lane;
      let bestScore = danger[best] - 0.15; // stickiness
      for (let i = 0; i < 3; i++) {
        if (danger[i] < bestScore) { bestScore = danger[i]; best = i; }
      }
      return { ...st, decision: best, danger };
    }, { reactionPending: pending, now: Date.now() });

    if (errors.length) break;
    if (!snap.running || snap.dead) {
      await page.close();
      return { runId, survived: snap.time || elapsed, dead: true, lives: snap.lives, distance: snap.distance, speed: snap.speed, errors };
    }
    if (elapsed >= TARGET_S && snap.lives > 0) {
      const out = { runId, survived: snap.time, dead: false, lives: snap.lives, distance: snap.distance, speed: snap.speed, errors };
      await page.close();
      return out;
    }

    // Human-like reaction delay before applying lane change
    const want = snap.decision;
    if (want != null && want !== snap.lane) {
      if (!pending || pending.lane !== want) pending = { lane: want, at: Date.now() + REACTION_MS };
    } else {
      pending = null;
    }
    if (pending && Date.now() >= pending.at) {
      await page.evaluate((n) => window.__runner.setLane(n), pending.lane);
      pending = null;
    }

    await page.waitForTimeout(50);
  }

  const st = await page.evaluate(() => window.__runner.getState());
  await page.close();
  return { runId, survived: st.time, dead: st.dead, lives: st.lives, distance: st.distance, speed: st.speed, errors };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});

const results = [];
for (let i = 0; i < RUNS; i++) {
  results.push(await oneRun(browser, i + 1));
}
await browser.close();

const ok = results.filter((r) => !r.dead && r.survived >= TARGET_S && !r.errors.length);
const summary = {
  reactionMs: REACTION_MS,
  targetSec: TARGET_S,
  runs: results,
  passes: ok.length,
  passRate: ok.length / results.length,
  minSurvive: Math.min(...results.map((r) => r.survived)),
  avgSurvive: results.reduce((a, r) => a + r.survived, 0) / results.length,
  allClear: results.every((r) => !r.errors.length),
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.allClear || ok.length < RUNS) process.exit(2);
