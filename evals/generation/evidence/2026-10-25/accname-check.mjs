// Offline check: accessible name of a checkbox inside a flex label with two spans (TASK-01 markup).
import { createRequire } from 'node:module'
const require = createRequire(process.argv[2] + '/package.json')
const { chromium } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
for (const display of ['flex', 'block']) {
  await page.setContent(`<style>.l{display:${display};gap:.5rem}</style><label class="l"><input type="checkbox"><span>买牛奶</span><span>未完成</span></label>`)
  const joined = await page.getByRole('checkbox', { name: '买牛奶未完成', exact: true }).count()
  const spaced = await page.getByRole('checkbox', { name: '买牛奶 未完成', exact: true }).count()
  console.log(JSON.stringify({ display, '买牛奶未完成': joined, '买牛奶 未完成': spaced }))
}
await browser.close()
