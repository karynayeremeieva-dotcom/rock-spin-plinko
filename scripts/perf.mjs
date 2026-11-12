#!/usr/bin/env node
/**
 * Performance checks from section 6 of the task, run against the production build in
 * a local Chrome via the DevTools protocol (puppeteer-core, no browser download).
 *
 *   node scripts/perf.mjs           bundle size, first paint on mobile networks, FPS at 1/10/50 balls
 *   node scripts/perf.mjs --soak    10 minutes of auto mode: heap, DOM nodes and FPS every 30 s
 *
 * Options: --minutes=N (soak length), CHROME_PATH=/path/to/chrome.
 * Phone profile: 390×844 @2x, CPU throttled 4× (DevTools "4× slowdown").
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4173;
const URL_ = `http://localhost:${PORT}/`;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SOAK = process.argv.includes('--soak');
const MINUTES = Number(process.argv.find((a) => a.startsWith('--minutes='))?.split('=')[1] ?? 10);

// DevTools network presets (Chrome 120+): throughput in bytes/s, latency in ms.
const NETWORKS = {
  'Fast 4G': { latency: 60, download: (9 * 1024 * 1024) / 8, upload: (1.5 * 1024 * 1024) / 8 },
  'Slow 4G': { latency: 150, download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function startPreview() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });
  await new Promise((resolve) =>
    p.stdout.on('data', (d) => String(d).includes('localhost') && resolve()),
  );
  return p;
}

function bundleSize() {
  const dir = join(ROOT, 'dist/assets');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const rows = files.map((f) => {
    const buf = readFileSync(join(dir, f));
    return { file: f, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  });
  const entry = rows.filter((r) => r.file.startsWith('index-'));
  return {
    files: rows,
    initialGzipKB: +(entry.reduce((s, r) => s + r.gzip, 0) / 1024).toFixed(1),
    totalGzipKB: +(rows.reduce((s, r) => s + r.gzip, 0) / 1024).toFixed(1),
  };
}

async function newPage(browser, { cpu = 4 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: false,
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return { page, cdp };
}

async function firstPaint(browser, name, net) {
  const { page, cdp } = await newPage(browser);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: net.latency,
    downloadThroughput: net.download,
    uploadThroughput: net.upload,
  });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.drop-btn');
  const paint = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const ready = Math.round(performance.now());
        new PerformanceObserver((list, observer) => {
          const fcp = list.getEntriesByName('first-contentful-paint')[0];
          if (!fcp) return;
          observer.disconnect();
          resolve({ fcp: Math.round(fcp.startTime), interactive: ready });
        }).observe({ type: 'paint', buffered: true });
        setTimeout(() => resolve({ fcp: undefined, interactive: ready }), 3000);
      }),
  );
  await page.close();
  return { network: name, fcpMs: paint.fcp, gameReadyMs: paint.interactive };
}

/** Frame stats from rAF inside the page for `ms` milliseconds. */
function measureFrames(page, ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const deltas = [];
        let balls = 0;
        let samples = 0;
        let last = performance.now();
        const start = last;
        const frame = (now) => {
          deltas.push(now - last);
          last = now;
          balls += Number(document.querySelector('.drop-btn__count')?.textContent ?? 0);
          samples += 1;
          if (now - start < ms) requestAnimationFrame(frame);
          else {
            const sorted = [...deltas].sort((a, b) => a - b);
            const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
            resolve({
              fps: +(1000 / avg).toFixed(1),
              p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
              worstFrameMs: +sorted[sorted.length - 1].toFixed(1),
              avgBallsInFlight: Math.round(balls / samples),
            });
          }
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );
}

async function fpsTests(browser) {
  const results = [];
  for (const target of [1, 10, 50]) {
    const { page } = await newPage(browser);
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForSelector('.drop-btn');
    await sleep(500);
    if (target === 1) {
      await page.keyboard.press('Space');
      await sleep(400);
      results.push({ balls: target, ...(await measureFrames(page, 1500)) });
    } else {
      // Keep the board full: Space keydowns dispatched inside the page (protocol key
      // presses are too slow under 4x CPU), topping up as balls land.
      await page.evaluate((target) => {
        const press = () =>
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        const inFlight = () => Number(document.querySelector('.drop-btn__count')?.textContent ?? 0);
        window.__perfTopUp = setInterval(() => {
          for (let i = inFlight(); i < target; i++) press();
        }, 30);
      }, target);
      await sleep(1500);
      results.push({ balls: target, ...(await measureFrames(page, 3000)) });
      await page.evaluate(() => clearInterval(window.__perfTopUp));
    }
    await page.close();
  }
  return results;
}

async function soak(browser) {
  const { page, cdp } = await newPage(browser);
  await cdp.send('Performance.enable');
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.auto-btn');

  // Auto mode: endless, fastest interval.
  await page.click('.auto-btn');
  await page.waitForSelector('.auto-form');
  await page.evaluate(() => {
    const set = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('.auto-form input'), '0');
    set(document.querySelector('.auto-form .range'), '150');
  });
  await page.click('.auto-form button[type=submit]');
  // Count landings: every landed ball prepends a chip to the results feed.
  await page.evaluate(() => {
    window.__landed = 0;
    new MutationObserver((records) => {
      for (const r of records) window.__landed += r.addedNodes.length;
    }).observe(document.querySelector('.feed'), { childList: true });
  });

  const metric = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const get = (n) => metrics.find((m) => m.name === n)?.value ?? 0;
    return { heapMB: +(get('JSHeapUsedSize') / 1048576).toFixed(2), nodes: get('Nodes') };
  };

  const samples = [];
  const started = Date.now();
  while (Date.now() - started < MINUTES * 60_000) {
    const frames = await measureFrames(page, 2000);
    const m = await metric();
    const state = await page.evaluate(() => ({
      running: !!document.querySelector('.drop-btn--stop'),
      landed: window.__landed,
      balance: document.querySelector('.balance__value')?.textContent,
    }));
    const sample = {
      minute: +((Date.now() - started) / 60000).toFixed(1),
      ...m,
      ...frames,
      ...state,
    };
    samples.push(sample);
    console.log(JSON.stringify(sample));
    await sleep(28_000);
  }
  await page.close();
  const first = samples[1] ?? samples[0];
  const last = samples[samples.length - 1];
  return {
    minutes: MINUTES,
    samples,
    heapGrowthMB: +(last.heapMB - first.heapMB).toFixed(2),
    nodeGrowth: last.nodes - first.nodes,
    fpsFirst: first.fps,
    fpsLast: last.fps,
    landed: last.landed,
  };
}

async function main() {
  await run('npx', ['vite', 'build', '--logLevel', 'warn']);
  const preview = await startPreview();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-first-run'],
  });
  const out = {
    date: new Date().toISOString(),
    chrome: await browser.version(),
    cpuThrottle: '4x',
  };
  try {
    if (SOAK) {
      out.soak = await soak(browser);
    } else {
      out.bundle = bundleSize();
      out.firstPaint = [];
      for (const [name, net] of Object.entries(NETWORKS)) {
        out.firstPaint.push(await firstPaint(browser, name, net));
      }
      out.fps = await fpsTests(browser);
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  mkdirSync(join(ROOT, 'perf-results'), { recursive: true });
  const file = join(ROOT, 'perf-results', SOAK ? 'soak.json' : 'perf.json');
  writeFileSync(file, JSON.stringify(out, null, 2));
  if (!SOAK) {
    console.log(
      '\nBundle:',
      out.bundle.initialGzipKB,
      'KB gzip initial,',
      out.bundle.totalGzipKB,
      'KB total',
    );
    console.table(out.firstPaint);
    console.table(out.fps);
  } else {
    const summary = { ...out.soak };
    delete summary.samples;
    console.log('\nSoak:', summary);
  }
  console.log(`Saved ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
