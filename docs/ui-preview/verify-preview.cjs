const { chromium } = require('../../apps/web/node_modules/@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  await page.goto(url);
  await page.screenshot({ path: path.join(__dirname, 'apps-desktop.png'), fullPage: true });
  await page.locator('#search').fill('不存在的应用');
  assert(await page.locator('#empty-search').isVisible());
  await page.locator('#clear-search').click();
  assert(await page.locator('#project-card').isVisible());
  await page.locator('.starter').first().click();
  assert((await page.locator('#brief').inputValue()).includes('作品集'));
  await page.locator('#brief-form button[type=submit]').click();
  assert((await page.locator('#toast').textContent()).includes('尚未接入'));
  await page.keyboard.press('Escape');
  await page.locator('#project-card [data-view=workbench]').click();
  await page.locator('#live-page [data-edit=title]').click();
  await page.locator('#element-text').fill('把热爱，\n聚在一起。');
  assert((await page.locator('#live-page [data-edit=title]').innerText()).includes('把热爱'));
  await page.screenshot({ path: path.join(__dirname, 'workbench-desktop.png'), fullPage: true });
  await page.locator('#live-page [data-edit=button]').click();
  await page.locator('#element-text').fill('查看活动日程');
  assert((await page.locator('#live-page [data-edit=button]').innerText()).includes('查看活动日程'));
  await page.locator('[data-device=mobile]').click();
  assert((await page.locator('#editor-canvas').boundingBox()).width <= 360);
  await page.locator('[data-device=desktop]').click();
  for (const state of ['loading', 'empty', 'error']) {
    await page.locator('#state-select').selectOption(state);
    assert(await page.locator('#preview-state').isVisible());
    await page.locator('#state-reset').click();
    assert(await page.locator('#live-page').isVisible());
  }
  await page.locator('.preview-tabs [data-view=login]').click();
  await page.screenshot({ path: path.join(__dirname, 'login-desktop.png'), fullPage: true });
  await page.locator('#screen-login [data-view=apps]').click();
  assert(await page.locator('#screen-apps').isVisible());
  const layout = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    for (const view of ['apps', 'workbench', 'login']) {
      await page.goto(url + '#' + view);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      layout.push({ width, view, overflow });
      assert(!overflow, `${view} horizontal overflow at ${width}px`);
      if (width === 390) await page.screenshot({ path: path.join(__dirname, `${view}-mobile.png`), fullPage: true });
    }
  }
  await page.goto(url + '#workbench');
  await page.locator('#live-page [data-edit=title]').click();
  await page.locator('#element-text').fill('手机端编辑测试');
  assert((await page.locator('#live-page [data-edit=title]').textContent()).includes('手机端编辑测试'));
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify({ browser: await browser.version(), checks: ['page navigation', 'search and empty recovery', 'scenario selection', 'brief demo feedback', 'title and button editing', 'device width switching', 'three preview states and recovery', 'mobile editing'], layout, pageErrors: errors }, null, 2));
  await browser.close();
  console.log('PASS: preview interactions, 15 responsive layouts, no page errors. Six screenshots saved.');
})().catch(e => { console.error(e); process.exit(1); });
