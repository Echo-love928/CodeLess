const { chromium } = require('../../apps/web/node_modules/@playwright/test')
const path = require('node:path')

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const base = 'http://127.0.0.1:4174'
  for (const [name, route] of [['apps', '/apps'], ['workbench', '/workbench/demo'], ['login', '/login']]) {
    await page.goto(base + route)
    await page.screenshot({ path: path.join(__dirname, `implemented-${name}-desktop.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, route] of [['apps', '/apps'], ['workbench', '/workbench/demo'], ['login', '/login']]) {
    await page.goto(base + route)
    await page.screenshot({ path: path.join(__dirname, `implemented-${name}-mobile.png`), fullPage: true })
  }
  await browser.close()
  console.log('Saved implementation screenshots.')
})().catch(error => { console.error(error); process.exit(1) })
