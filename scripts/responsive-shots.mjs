import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const WEB = process.env.WEB_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:5173/api';
const OUT = process.env.OUT_DIR || join(process.cwd(), 'screenshots/responsive');
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${path} ${res.status}: ${t}`);
  }
  return res.json();
}

async function setupSevenPlayer() {
  const names = ['Alex', 'Blake', 'Casey', 'Drew', 'Eden', 'Finley', 'Gray'];
  const host = await api('/live', {
    method: 'POST',
    body: JSON.stringify({ name: names[0] }),
  });
  const tokens = [{ name: names[0], token: host.token, playerId: host.playerId, sessionId: host.id }];
  for (let i = 1; i < names.length; i++) {
    const j = await api('/live/join', {
      method: 'POST',
      body: JSON.stringify({ code: host.code, name: names[i] }),
    });
    tokens.push({ name: names[i], token: j.token, playerId: j.playerId, sessionId: j.id });
  }
  let view = await api(`/live/${host.id}/start`, {
    method: 'POST',
    body: JSON.stringify({ token: host.token }),
  });

  // Advance until playing phase if possible: bid around table once
  // Host may not be first bidder — bid with whoever's turn using their token
  for (let guard = 0; guard < 40 && view.phase === 'bidding'; guard++) {
    const seat = view.bidderSeat;
    const p = view.players.find((x) => x.seatIndex === seat);
    const auth = tokens.find((t) => t.playerId === p?.id);
    if (!auth) break;
    // Prefer 0 bid to avoid forbidden-last issues mostly
    let bid = 0;
    if (view.forbiddenLastBid === 0) bid = 1;
    try {
      view = await api(`/live/${host.id}/bid`, {
        method: 'POST',
        body: JSON.stringify({ token: auth.token, bid }),
      });
    } catch (e) {
      // try alternate
      bid = bid === 0 ? 1 : 0;
      view = await api(`/live/${host.id}/bid`, {
        method: 'POST',
        body: JSON.stringify({ token: auth.token, bid, forceBurn: true }),
      });
    }
  }

  // Play a few cards so table has plays
  for (let guard = 0; guard < 12 && view.phase === 'playing'; guard++) {
    const seat = view.turnSeat;
    const p = view.players.find((x) => x.seatIndex === seat);
    const auth = tokens.find((t) => t.playerId === p?.id);
    if (!auth) break;
    // get that player's view for legal cards
    const pv = await api(`/live/${host.id}`, {
      headers: { 'x-live-token': auth.token },
    });
    const key = pv.legalCardKeys?.[0] || pv.hand?.[0]?.key;
    if (!key) break;
    view = await api(`/live/${host.id}/play`, {
      method: 'POST',
      body: JSON.stringify({ token: auth.token, card: key }),
    });
    if (view.table?.complete) break; // leave one completed trick or mid-trick
  }

  const hostAuth = {
    sessionId: host.id,
    playerId: host.playerId,
    token: host.token,
    name: names[0],
    code: host.code,
  };

  return { host, hostAuth, view, tokens };
}

async function shot(page, file) {
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  console.log('wrote', path);
}

async function main() {
  console.log('Setting up 7-player live game…');
  const { host, hostAuth, view } = await setupSevenPlayer();
  console.log('session', host.id, 'code', host.code, 'phase', view.phase, 'players', view.players.length);

  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === 'desktop' ? 1 : 2,
    });
    const page = await context.newPage();

    // Home
    await page.goto(WEB + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await shot(page, `${vp.name}-home.png`);

    // Live hub
    await page.goto(WEB + '/play/live', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await shot(page, `${vp.name}-live-hub.png`);

    // Inject auth and open live session
    await page.addInitScript((auth) => {
      localStorage.setItem(`oh-heck-live:${auth.sessionId}`, JSON.stringify(auth));
      localStorage.setItem('oh-heck-live:last', auth.sessionId);
    }, hostAuth);

    await page.goto(WEB + `/live/${host.id}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.live-play, .lobby-screen, .game-screen', { timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, `${vp.name}-live-7p-play.png`);

    // Board tab if available
    const boardBtn = page.locator('.game-tabs button', { hasText: 'Board' });
    if (await boardBtn.count()) {
      await boardBtn.click();
      await page.waitForTimeout(400);
      await shot(page, `${vp.name}-live-7p-board.png`);
      const playBtn = page.locator('.game-tabs button', { hasText: 'Play' });
      if (await playBtn.count()) await playBtn.click();
    }

    await context.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
