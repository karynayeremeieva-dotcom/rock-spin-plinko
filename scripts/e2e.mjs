#!/usr/bin/env node
/**
 * End-to-end run of the acceptance checklist (section 8.2) in a real Chrome, through the UI
 * a player uses. Each check opens a fresh browser profile, so saves never leak between them.
 *
 *   node scripts/e2e.mjs                 builds the app and checks the local production build
 *   node scripts/e2e.mjs --url=https://… checks a deployed copy instead (e.g. GitHub Pages)
 *
 * Options: CHROME_PATH=/path/to/chrome. Exits with code 1 if any check fails.
 * Covered here: 2, 3, 5, 8, 9, 10. Checks 1, 4 and 6 are unit tests (npm test),
 * check 7 is npm run perf.
 */
/* global document, innerWidth, innerHeight, requestAnimationFrame -- page code inside page.evaluate() */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 4174;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ARG = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
const SAVE_KEY = 'rockspin.plinko.v1';
const START_CENTS = 100_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function startPreview() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) =>
    p.stdout.on('data', (d) => String(d).includes('localhost') && resolve()),
  );
  return p;
}

const results = [];
const consoleErrors = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A fresh, empty browser profile on the game, with the first-visit tour skipped. */
async function open(browser, base, { width, height, query = '' }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(base + query, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await clickText(page, '^(Пропустить|Skip)$');
  await sleep(300);
  return { page, close: () => context.close() };
}

function clickText(page, pattern) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')].find((x) => re.test(x.textContent.trim()));
    b?.click();
    return Boolean(b);
  }, pattern);
}

const readSave = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);

function ledger(game) {
  const wagered = game.history.reduce((a, e) => a + e.bet, 0);
  const paid = game.history.reduce((a, e) => a + e.payout, 0);
  return { wagered, paid, expected: START_CENTS - wagered + paid };
}

// 9. Layout at the three sizes, both board designs: one screen, no scroll, board ≥ 55 %.
async function layouts(browser, base) {
  for (const [width, height] of [
    [360, 640],
    [390, 844],
    [1440, 900],
  ]) {
    for (const skin of ['guitar', 'minimal']) {
      const { page, close } = await open(browser, base, { width, height, query: `?skin=${skin}` });
      const m = await page.evaluate(() => {
        const board = document.querySelector('canvas').getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect();
        const last = [...document.querySelectorAll('.topbar button')].pop().getBoundingClientRect();
        return {
          scrollW: document.documentElement.scrollWidth,
          scrollH: document.documentElement.scrollHeight,
          w: innerWidth,
          h: innerHeight,
          board: board.height / innerHeight,
          barFits: last.right <= bar.right + 0.5,
        };
      });
      const phone = width < 1000;
      check(
        `9. layout ${width}×${height}, ${skin}`,
        m.scrollW <= m.w && m.scrollH <= m.h + 1 && (!phone || m.board >= 0.55) && m.barFits,
        `board ${(m.board * 100).toFixed(0)}% of height${m.barFits ? '' : ', top bar overflows'}`,
      );
      await close();
    }
  }
}

// 9. RU ⇄ EN from the menu.
async function language(browser, base) {
  const { page, close } = await open(browser, base, { width: 390, height: 844 });
  await page.click('button[aria-label="Меню"]');
  await sleep(300);
  await clickText(page, '^English$');
  await sleep(400);
  const en = await page.evaluate(() => document.body.innerText);
  await clickText(page, '^Русский$');
  await sleep(400);
  const ru = await page.evaluate(() => document.body.innerText);
  check(
    '9. language RU → EN → RU',
    /DROP/i.test(en) && !/БРОСИТЬ/i.test(en) && /БРОСИТЬ/i.test(ru),
  );
  await close();
}

// 8 + 2. Space drops balls; reload keeps balance, rows, history and the muted sound; ledger holds.
async function persistence(browser, base) {
  const { page, close } = await open(browser, base, { width: 390, height: 844 });
  const rowsBefore = Number(
    await page.$eval(
      'button[aria-label="Больше рядов"]',
      (b) => b.previousElementSibling.textContent,
    ),
  );
  await page.click('button[aria-label="Больше рядов"]');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space');
    await sleep(150);
  }
  await sleep(5000);
  await page.click('button[aria-label="Выключить звук"]');
  await sleep(300);
  const shown = () => page.$eval('.balance__value', (e) => e.textContent);
  const balanceBefore = await shown();
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  const save = await readSave(page);
  const muted = Boolean(await page.$('button[aria-label="Включить звук"]'));
  const l = ledger(save.game);
  check('8. Space drops a ball (5 presses → 5 results)', save.game.history.length === 5);
  check('8. reload keeps the balance', (await shown()) === balanceBefore, balanceBefore);
  check('8. reload keeps rows', save.game.rows === rowsBefore + 1, `${save.game.rows} rows`);
  check('8. reload keeps history', save.game.history.length === 5);
  check('8. reload keeps sound off', muted);
  check(
    '2. start − bets + payouts = balance',
    l.expected === save.game.balance,
    `${START_CENTS} − ${l.wagered} + ${l.paid} = ${save.game.balance} (hundredths)`,
  );
  await close();
}

// 3. 300 fast clicks at 100 RC: exactly 10 drops get through, the balance never goes below 0.
async function fastClicks(browser, base) {
  const { page, close } = await open(browser, base, { width: 390, height: 844 });
  await clickText(page, '^50$');
  await clickText(page, '^×2$');
  await sleep(150);
  const lowest = await page.evaluate(async () => {
    const drop = [...document.querySelectorAll('button')].find((b) =>
      /БРОСИТЬ|DROP/i.test(b.textContent),
    );
    for (let i = 0; i < 300; i++) {
      drop.click();
      if (i % 10 === 0) await new Promise((r) => requestAnimationFrame(r));
    }
    let min = Infinity;
    const until = performance.now() + 9000;
    while (performance.now() < until) {
      const v = Number(
        document.querySelector('.balance__value').textContent.replace(/[^\d.-]/g, ''),
      );
      if (!Number.isNaN(v)) min = Math.min(min, v);
      await new Promise((r) => setTimeout(r, 50));
    }
    return min;
  });
  const save = await readSave(page);
  const l = ledger(save.game);
  check(
    '3. 300 fast clicks at 100 RC: 10 drops, never below 0',
    save.game.history.length === 10 && lowest >= 0,
    `${save.game.history.length} drops, lowest shown ${lowest} RC`,
  );
  check('2. ledger after fast clicks', l.expected === save.game.balance);
  await close();
}

// 5. ?dev=1: editable table, live RTP, JSON export, 100 000-drop simulation.
async function devPanel(browser, base) {
  const { page, close } = await open(browser, base, { width: 1440, height: 900, query: '?dev=1' });
  const toggle = await page.$('.dev-toggle');
  check('5. ?dev=1 shows the panel button', Boolean(toggle));
  if (toggle) {
    await toggle.click();
    await sleep(600);
    const inputs = await page.$$('.dev__table input');
    const text = await page.evaluate(() => document.body.innerText);
    check('5. editable multipliers', inputs.length >= 9, `${inputs.length} fields`);
    check('5. table RTP shown', /RTP/.test(text));
    check('5. download JSON button', /JSON/.test(text));
    // Edit one bin: the RTP must change at once.
    const rtp = () => page.$eval('.dev__rtp b', (b) => b.textContent);
    const before = await rtp();
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type('40');
    await sleep(200);
    check('5. RTP recalculates on edit', (await rtp()) !== before, `${before} → ${await rtp()}`);
    await clickText(page, 'Сбросить к конфигу|Reset');
    await sleep(200);
    await clickText(page, '100.000|Симул|Simul');
    await page
      .waitForFunction(() => /Фактический RTP|Actual RTP/i.test(document.body.innerText), {
        timeout: 30000,
      })
      .catch(() => {});
    const sim = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(
        /(?:Фактический RTP|Actual RTP)\s*([\d.]+)%[\s\S]*?(?:Теоретический|Theoretical)\s*([\d.]+)%/i,
      );
      return m ? [Number(m[1]), Number(m[2])] : null;
    });
    check(
      '5. 100 000-drop simulation close to theory',
      Boolean(sim) && Math.abs(sim[0] - sim[1]) < 1.5,
      sim ? `actual ${sim[0]}%, theory ${sim[1]}%` : 'no result',
    );
  }
  await close();
}

async function main() {
  let preview = null;
  let base = URL_ARG;
  if (!base) {
    await run('npx', ['vite', 'build', '--logLevel', 'warn']);
    preview = await startPreview();
    base = `http://localhost:${PORT}/`;
  }
  console.log(`E2E against ${base}\n`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    await layouts(browser, base);
    await language(browser, base);
    await persistence(browser, base);
    await fastClicks(browser, base);
    await devPanel(browser, base);
    check(
      '10. console has no errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '),
    );
  } finally {
    await browser.close();
    preview?.kill();
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
