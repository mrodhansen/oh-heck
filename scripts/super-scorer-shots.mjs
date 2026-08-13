import pkg from '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.js';
const { chromium } = pkg;
import { mkdirSync } from 'fs';
import { join } from 'path';

const WEB = process.env.WEB_URL || 'http://localhost:5173';
const OUT = process.env.OUT_DIR || join(process.cwd(), 'screenshots');
mkdirSync(OUT, { recursive: true });

const allViewports = [
  { name: 'phone-portrait', width: 390, height: 844, dpr: 2 },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 2 },
  { name: 'desktop', width: 1440, height: 900, dpr: 1 },
];
const viewports = process.env.VIEWPORT
  ? allViewports.filter((v) => v.name === process.env.VIEWPORT)
  : allViewports;

async function shot(page, file) {
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  console.log('wrote', path);
}

async function fillNames(page) {
  const inputs = page.locator('.player-name-row input');
  await inputs.nth(0).fill('Ann');
  await inputs.nth(1).fill('Bob');
  await inputs.nth(2).fill('Cam');
}

async function bidAll(page) {
  await page.waitForSelector('.phase-title', { timeout: 15000 });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Confirm bid' }).click();
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.card-picker', { timeout: 15000 });
}

const SUIT_INDEX = { C: 0, D: 1, H: 2, S: 3 };
const RANK_INDEX = {
  2: 0,
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
  9: 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

async function pickCard(page, suit, rank) {
  await page.locator('.card-picker-suit').nth(SUIT_INDEX[suit]).click();
  await page.waitForTimeout(80);
  await page.locator('.card-picker-rank').nth(RANK_INDEX[rank]).click();
}

async function confirmPrimary(page, name) {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(280);
}

async function runViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  const page = await context.newPage();

  await page.goto(`${WEB}/new`, { waitUntil: 'networkidle' });
  await fillNames(page);
  await page.waitForTimeout(200);
  await shot(page, `${vp.name}-01-new-game-names.png`);

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('.dealer-pick');
  await page.waitForTimeout(200);
  await shot(page, `${vp.name}-02-dealer-toggle-off.png`);

  await page.getByRole('button', { name: /Super scorer/ }).click();
  await page.waitForTimeout(150);
  await shot(page, `${vp.name}-03-dealer-toggle-on.png`);

  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.card-picker', { timeout: 15000 });
  await shot(page, `${vp.name}-04-trump-picker.png`);

  await pickCard(page, 'H', 'A');
  await page.waitForTimeout(120);
  await shot(page, `${vp.name}-05-trump-selected.png`);

  await confirmPrimary(page, 'Confirm trump');
  await page.waitForSelector('.phase-title', { timeout: 15000 });
  await page.getByRole('heading', { name: 'Bidding' }).waitFor({ timeout: 15000 });
  await shot(page, `${vp.name}-06-bidding.png`);

  await bidAll(page);
  await page.waitForSelector('.super-play-who');
  await shot(page, `${vp.name}-07-first-lead.png`);

  await pickCard(page, 'S', 'A');
  await page.waitForTimeout(120);
  await shot(page, `${vp.name}-08-card-selected.png`);

  await confirmPrimary(page, 'Confirm card');
  await pickCard(page, 'S', '9');
  await confirmPrimary(page, 'Confirm card');
  await shot(page, `${vp.name}-09-mid-trick.png`);

  await pickCard(page, 'C', '3');
  await confirmPrimary(page, 'Confirm card');
  await page.waitForTimeout(200);
  await shot(page, `${vp.name}-10-winner-leads.png`);

  const boardBtn = page.locator('.game-tabs button', { hasText: 'Board' });
  if (await boardBtn.count()) {
    await boardBtn.click();
    await page.waitForTimeout(300);
    await shot(page, `${vp.name}-11-board.png`);
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const vp of viewports) {
    console.log('viewport', vp.name);
    await runViewport(browser, vp);
  }
  await browser.close();
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
