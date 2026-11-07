import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
async function run() {
  const { default: puppeteer } = await import('puppeteer-core');
  const url = process.env.HAVEN_AUDIT_URL ?? 'http://localhost:8081';
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const out = resolve('..', '.hallmark/screens'); mkdirSync(out, { recursive: true });
  const errors: string[] = []; const reports: { id: string; status: string; message: string }[] = [];
  const suffix = randomBytes(8).toString('hex');
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('response', response => { if (/\/api\/families\/[^/]+\/reports$/.test(response.url()) && response.request().method() === 'POST' && response.ok()) void response.json().then(body => reports.push(body)); });
    async function clickVisible(label: string) {
      const elements = await page.$$('[aria-label="' + label + '"]');
      for (const element of elements) { const bounds = await element.boundingBox(); if (bounds && bounds.width > 0 && bounds.height > 0) { await element.click(); return; } }
      throw new Error('No visible action: ' + label);
    }
    await page.goto(url + '/(tabs)', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[aria-label="Create an account"]', { timeout: 30000 });
    await page.locator('[aria-label="Create an account"]').click();
    await page.locator('[aria-label="Email"]').fill('mobile-' + suffix + '@integration.example');
    await page.locator('[aria-label="Password"]').fill(randomBytes(24).toString('hex'));
    await page.locator('[aria-label="Create account"]').click();
    await page.waitForFunction(() => document.body.innerText.includes('Around you'), { timeout: 30000 }).catch(async error => { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2200)); await page.screenshot({ path: resolve(out, 'live-backend-auth-failure.png') }); throw error; });
    await page.goto(url + '/(onboarding)', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[aria-label="Number of people in household"]');
    await page.locator('[aria-label="Number of people in household"]').fill('4');
    await page.locator('[aria-label="Number of children"]').fill('2');
    await page.locator('[aria-label="Continue"]').click();
    await page.locator('[aria-label="Add one dogs"]').click();
    await page.locator('[aria-label="Continue"]').click();
    await page.locator('[aria-label="We have access to a car"]').click();
    await page.locator('[aria-label="Continue"]').click();
    await page.waitForSelector('[aria-label="Full home address"]');
    await page.locator('[aria-label="Full home address"]').fill('100 Integration Street, Tampa, FL 33602');
    await page.locator('[aria-label="Latitude"]').fill('27.95');
    await page.locator('[aria-label="Longitude"]').fill('-82.46');
    await page.locator('[aria-label="Continue"]').click();
    await page.waitForSelector('[aria-label="Save household profile"]');
    await page.locator('[aria-label="Save household profile"]').click();
    await page.waitForFunction(() => document.body.innerText.includes('Shelter assignment'), { timeout: 30000 });
    await page.waitForSelector('.leaflet-container');
    await page.screenshot({ path: resolve(out, 'live-backend-shelter.png') });
    await clickVisible('Support');
    await page.waitForFunction(() => { const input = document.querySelector('[aria-label="Message support"]') as HTMLTextAreaElement; return !!input && !input.readOnly; });
    await page.locator('[aria-label="Message support"]').fill('Live mobile test: can you help with transportation?');
    await page.locator('[aria-label="Send message"]').click();
    await page.waitForFunction(() => document.body.innerText.includes(' · Sent'), { timeout: 20000 });
    assert.equal(reports.length, 1); assert.equal(reports[0]?.status, 'received'); assert.equal(reports[0]?.message, 'Live mobile test: can you help with transportation?');
    await page.screenshot({ path: resolve(out, 'live-backend-support.png') });
    await clickVisible('Household');
    await page.locator('[aria-label="Edit household"]').click();
    await page.waitForSelector('[aria-label="Save changes"]');
    assert.equal(await page.$('[aria-label="Continue"]'), null);
    await page.locator('[aria-label="Number of people in household"]').fill('5');
    await page.locator('[aria-label="Save changes"]').click();
    await page.waitForFunction(() => window.location.pathname.includes('/profile'));
    await page.waitForSelector('[aria-label="Edit household"]', { visible: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[aria-label="Edit household"]', { visible: true }).catch(async error => { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2000)); throw error; });
    await page.locator('[aria-label="Edit household"]').click();
    await page.waitForSelector('[aria-label="Number of people in household"]');
    assert.equal(await page.$eval('[aria-label="Number of people in household"]', el => (el as HTMLInputElement).value), '5');
    assert.equal(await page.$eval('[aria-label="Dogs count"]', el => el.textContent), '1');
    await page.goto(url + '/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[aria-label="Sign out"]');
    await page.locator('[aria-label="Sign out"]').click();
    await page.waitForSelector('[aria-label="Sign in"]');
    assert.deepEqual(errors, []);
    writeFileSync(resolve(out, 'live-backend-results.json'), JSON.stringify({ registration: 'passed', surveyAllocation: 'passed', liveReportReceipt: 'passed', singlePageEdit: 'passed', sessionReload: 'passed', logout: 'passed', errors }, null, 2));
    console.log('Live mobile UI passed: account registration, household survey, actual shelter/map allocation, report message submission, editing, reload persistence, and logout. No mocked API requests.');
  } finally { await browser.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
