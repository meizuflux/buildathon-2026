import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { MockAdapter } from '../src/services/adapters/mockAdapter';
import type { CacheStore } from '../src/storage/cache';

async function run() {
const { default: puppeteer } = await import('puppeteer-core');
// Isolated fictional fixtures only; this browser never opens the user's profile.
const store = new Map<string, unknown>();
const memory: CacheStore = {
  async get<T>(key: string) { return (store.get(key) ?? null) as T | null; },
  async set(key, value) { store.set(key, value); },
  async remove(key) { store.delete(key); },
};
const mock = new MockAdapter(memory, 0);
await mock.selectHousehold(2);
const request = await mock.createAssistanceRequest({ category: 'transportation', people: 2, requirements: ['Wheelchair accessibility'], description: 'Fictional accessible transport request.', idempotencyKey: 'design-audit-request' });
await mock.trigger('transport');
await mock.trigger('shelter');
const state = store.get('mock-state');
const origin = process.env.HAVEN_AUDIT_URL ?? 'http://localhost:8081';
const out = resolve('..', '.hallmark', 'screens');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const results: unknown[] = [];
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.evaluateOnNewDocument(mockState => {
    if (!localStorage.getItem('haven:mock-state')) localStorage.setItem('haven:mock-state', JSON.stringify(mockState));
  }, state);
  for (const [name, route] of [['home', '/(tabs)'], ['plan', '/plan'], ['assistance', '/assistance'], ['updates', '/updates'], ['household', '/profile'], ['new-request', '/assistance/new'], ['request-detail', `/assistance/${request.id}`], ['report', '/reports'], ['onboarding', '/(onboarding)']] as const) {
    for (const width of [375, 1440]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!document.querySelector('[role="heading"]') && !document.body.innerText.includes('Loading your information') && !document.querySelector('[aria-label="Refresh information"]')?.textContent?.includes('Refreshing'), { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      const measure = await page.evaluate(() => ({
        title: document.querySelector('[role="heading"]')?.textContent,
        overflowing: Array.from(document.querySelectorAll('[role="button"], [role="checkbox"], [role="tab"], [role="heading"], input, textarea')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(el => el.getAttribute('aria-label') ?? el.textContent?.slice(0, 60)),
        body: document.body.innerText,
      }));
      assert.equal(measure.overflowing.length, 0, `${name} at ${width}px: ${measure.overflowing.join(', ')}`);
      assert(!/A little clarity|A way forward|YOUR SPACE|ONE STEP AT A TIME/.test(measure.body));
      if (name === 'plan') {
        assert(measure.body.includes('Preparation checklist'));
        assert(measure.body.includes('Unavailable'));
        assert(measure.body.includes('Version') || measure.body.includes('version'));
      }
      await page.screenshot({ path: resolve(out, `${name}-${width}.png`) });
      results.push({ screen: name, width, title: measure.title, overflow: measure.overflowing });
    }
  }
  // Exercise the existing form wiring after the style changes.
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${origin}/assistance/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="Review request"]');
  await page.locator('[aria-label="Review request"]').click();
  await page.waitForSelector('[aria-label="Submit assistance request"]');
  await page.locator('[aria-label="Submit assistance request"]').click();
  await page.waitForSelector('[aria-label="View request details"]');
  assert((await page.evaluate(() => document.body.innerText)).includes('Submitted'));
  await page.goto(`${origin}/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="Review report"]');
  await page.locator('[aria-label="Review report"]').click();
  await page.waitForSelector('[aria-label="Submit report"]');
  await page.locator('[aria-label="Submit report"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('Your report was received by the coordination service.'));
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ screens: results, assistanceSubmission: 'submitted', reportReceipt: 'coordination service', runtimeErrors: errors }, null, 2));
  console.log(`Checked ${results.length} screen/viewport combinations, assistance submission, and report receipt. No runtime errors or horizontal control overflow.`);
} finally { await browser.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
