import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { households, makePlan } from '../src/mocks/fixtures';
import type { Household, SupportMessage } from '../src/types/models';
async function run() {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const origin = process.env.HAVEN_AUDIT_URL ?? 'http://localhost:8081';
  const apiOrigin = process.env.HAVEN_AUDIT_API_URL ?? 'http://localhost:8799';
  const out = resolve('..', '.hallmark', 'screens'); mkdirSync(out, { recursive: true });
  let household: Household = households()[0]!;
  const plan = makePlan(household);
  const source = { name: 'County coordination service', kind: 'government' as const, verified: true };
  if (plan.shelterAssignment) { plan.shelterAssignment.description = 'Family spaces and accessible facilities.'; plan.shelterAssignment.address = '120 Test Avenue, Wilmington, NC'; plan.shelterAssignment.source = source; }
  const messages: SupportMessage[] = [];
  const attempts: { body: string; key: string }[] = [];
  const reports: unknown[] = []; const errors: string[] = []; const results: unknown[] = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (!request.url().startsWith(apiOrigin)) { void request.continue(); return; }
      const url = new URL(request.url()); const path = url.pathname; const method = request.method();
      const respond = (data: unknown, status = 200) => request.respond({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' }, body: JSON.stringify(data) });
      if (method === 'OPTIONS') { void respond(null, 204); return; }
      const body = request.postData() ? JSON.parse(request.postData()!) : null;
      if (path === '/api/v1/households/me' || path === '/api/v1/households') { if (body) household = { ...body, id: household.id, updatedAt: new Date().toISOString() }; void respond(household); }
      else if (path === '/api/v1/plans/current') void respond(plan);
      else if (path === '/api/v1/alerts') void respond([{ id: 'hurricane-1', disasterType: 'Hurricane', title: 'Hurricane watch', message: 'Check local instructions for current conditions.', area: 'New Hanover County', severity: 'watch', source, updatedAt: new Date().toISOString() }]);
      else if (path === '/api/v1/updates' || path === '/api/v1/plans/history') void respond([]);
      else if (path === '/api/v1/messages') {
        if (method === 'POST') {
          attempts.push({ body: body.body, key: request.headers()['idempotency-key']! });
          if (attempts.length === 1) { void respond({}, 503); return; }
          let accepted = messages.find(message => message.idempotencyKey === body.idempotencyKey);
          if (!accepted) { accepted = { ...body, id: 'message-1', sender: 'household', createdAt: new Date().toISOString() }; messages.push(accepted!); }
          void respond(accepted);
        } else void respond(messages);
      } else if (path === '/api/v1/situation-reports') { if (body) reports.push({ ...body, id: 'report-1', acknowledgment: null, createdAt: new Date().toISOString() }); void respond(method === 'POST' ? reports.at(-1) : reports); }
      else void respond({}, 501);
    });
    async function open(route: string) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!document.querySelector('[role="heading"]') && !document.body.innerText.includes('Loading your information') && !document.querySelector('[aria-label="Refresh information"]')?.textContent?.includes('Refreshing'), { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
    }
    for (const [name, route] of [['home', '/(tabs)'], ['plan', '/plan'], ['support', '/assistance'], ['updates', '/updates'], ['household', '/profile'], ['edit-household', '/(onboarding)'], ['report', '/reports'], ['old-request', '/assistance/new'], ['old-detail', '/assistance/previous']] as const) {
      for (const width of [375, 1440]) {
        await page.setViewport({ width, height: 900 }); await open(route);
        if (name === 'plan') await page.waitForSelector('.leaflet-container');
        const measure = await page.evaluate(() => ({ body: document.body.innerText, overflow: Array.from(document.querySelectorAll('[role="button"], [role="checkbox"], [role="tab"], [role="heading"], input, textarea')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(el => el.getAttribute('aria-label') ?? el.textContent?.slice(0, 60)) }));
        assert.deepEqual(measure.overflow, [], `${name} at ${width}`);
        assert(!/\bdemo\b|fictional|simulated|Your requests|Request assistance/.test(measure.body), name);
        if (name === 'edit-household') { assert(await page.$('[aria-label="Full home address"]')); assert(await page.$('[aria-label="Add one dogs"]')); assert(await page.$('[aria-label="Save changes"]')); assert.equal(await page.$('[aria-label="Continue"]'), null); }
        await page.screenshot({ path: resolve(out, `${name}-${width}.png`) }); results.push({ name, width });
      }
    }
    await page.setViewport({ width: 375, height: 900 }); await open('/(onboarding)');
    await page.locator('[aria-label="Number of people in household"]').fill('6');
    await page.locator('[aria-label="Number of children"]').fill('3');
    await page.locator('[aria-label="Add one dogs"]').click();
    await page.locator('[aria-label="Full home address"]').fill('123 Test Street, Wilmington, NC 28401');
    await page.locator('[aria-label="Save changes"]').click();
    await page.waitForSelector('[aria-label="Edit household"]');
    assert.equal(household.adults, 3); assert.equal(household.children, 3); assert.equal(household.pets, 2); assert.equal(household.location.latitude, undefined);
    await open('/(onboarding)');
    assert.equal(await page.$eval('[aria-label="Number of people in household"]', el => (el as HTMLInputElement).value), '6');
    await page.locator('[aria-label="Number of children"]').fill('9'); await page.locator('[aria-label="Save changes"]').click();
    await page.waitForFunction(() => document.body.innerText.includes('Children must be a whole number'));
    assert.equal(household.children, 3);
    await open('/assistance'); await page.waitForSelector('[aria-label="Message support"]');
    await page.locator('[aria-label="Message support"]').fill('Can you help us with transportation?');
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('message-draft:') && localStorage.getItem(key)?.includes('transportation')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (document.querySelector('[aria-label="Message support"]') as HTMLTextAreaElement)?.value.includes('transportation'));
    assert.equal(attempts.length, 0);
    await page.locator('[aria-label="Send message"]').click(); await page.waitForSelector('[aria-label="Retry sending"]');
    assert.equal(await page.$eval('[aria-label="Message support"]', el => (el as HTMLTextAreaElement).value), 'Can you help us with transportation?');
    await page.locator('[aria-label="Retry sending"]').click();
    await page.waitForFunction(() => document.body.innerText.includes(' · Sent'));
    assert.equal(messages.length, 1); assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(await page.$eval('[aria-label="Message support"]', el => (el as HTMLTextAreaElement).value), '');
    messages.push({ id: 'support-reply', sender: 'support', body: 'We are checking your transportation options.', createdAt: new Date().toISOString() });
    await page.locator('[aria-label="Refresh information"]').click();
    await page.waitForFunction(() => document.body.innerText.includes('We are checking your transportation options.'));
    const sendBounds = await page.$eval('[aria-label="Send message"]', el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    assert(sendBounds.top >= 0 && sendBounds.bottom < 900, 'The chat Send control must remain visible');
    await page.screenshot({ path: resolve(out, 'support-conversation-375.png') });
    await open('/(tabs)'); await page.locator('[aria-label="Hurricanes"]').click(); assert.equal(await page.$('[aria-label="Mark myself safe"]'), null);
    await page.locator('[aria-label="Floods"]').click(); await page.waitForSelector('[aria-label="Mark myself safe"]');
    await open('/plan'); await page.waitForSelector('.leaflet-container'); await page.locator('[aria-label="Switch to night mode"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark'); assert(await page.$('.shelter-map.leaflet-container'));
    await page.screenshot({ path: resolve(out, 'plan-night-375.png') });
    assert.deepEqual(errors, []);
    writeFileSync(resolve(out, 'results.json'), JSON.stringify({ screens: results, editSaveRestore: 'passed', messageDraftRetryReceiptReply: 'passed', errors }, null, 2));
    console.log(`Checked ${results.length} screen/viewport combinations, single-page household edits, draft restoration, failed send/retry, server message acknowledgments, incoming replies, and night mode.`);
  } finally { await browser.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
