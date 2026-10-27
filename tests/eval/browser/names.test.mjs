import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { chromium, expect } from '@playwright/test'
import { namePattern } from '../../../evals/browser/names.mjs'

let browser
before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(key)))
  browser = await chromium.launch({ headless: true, env })
})
after(async () => { await browser?.close() })

async function withPage(t, html, action) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  t.after(() => context.close())
  await context.route('**/*', route => route.abort())
  const page = await context.newPage()
  await page.setContent('<!doctype html><html lang="zh"><meta charset="utf-8"><body>' + html + '</body></html>')
  await action(page)
}

for (const layout of ['inline', 'flex', 'block']) test('Han accessible names preserve whole controls across ' + layout + ' children', async t => {
  const display = layout === 'flex' ? 'display:flex' : ''
  const child = layout === 'block' ? 'div' : 'span'
  await withPage(t, `<button id="target" style="${display}" onclick="this.dataset.clicked='yes'"><${child}>下</${child}><${child}>一步</${child}></button>
    <button>下一步全部</button><button>上一步</button><span>全部</span>`, async page => {
    const target = page.getByRole('button', { name: namePattern('下一步') })
    await expect(target).toHaveCount(1)
    await expect(target).toHaveAttribute('id', 'target')
    await expect(target).toHaveAccessibleName(layout === 'inline' ? '下一步' : '下 一步')
    await target.click()
    await expect(target).toHaveAttribute('data-clicked', 'yes')
  })
})

test('adjacent controls cannot be concatenated into one accessible name', async t => {
  await withPage(t, '<button>下一</button><button>步</button><button>下一步全部</button>', async page => {
    await expect(page.getByRole('button', { name: namePattern('下一步') })).toHaveCount(0)
  })
})

test('a flex checkbox label tolerates layout spaces without matching its neighbouring label', async t => {
  await withPage(t, '<label style="display:flex"><input id="milk" type="checkbox"><span>买牛奶</span><span>未完成</span></label>' +
    '<label><input type="checkbox">买牛奶未完成全部</label>', async page => {
    const checkbox = page.getByRole('checkbox', { name: namePattern('买牛奶未完成') })
    await expect(checkbox).toHaveCount(1)
    await expect(checkbox).toHaveAccessibleName('买牛奶 未完成')
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked()
  })
})

test('Latin word boundaries distinguish adjacent inline text from flex separation', async t => {
  await withPage(t, '<h2 id="joined"><span>Grace</span><span>Hopper</span></h2>' +
    '<h2 id="flex" style="display:flex"><span>Grace</span><span>Hopper</span></h2>' +
    '<h2 id="space"><span>Grace</span> <span>Hopper</span></h2><h2>Grace Hopper Extra</h2>', async page => {
    await expect(page.locator('#joined')).toHaveAccessibleName('GraceHopper')
    await expect(page.locator('#flex')).toHaveAccessibleName('Grace Hopper')
    const names = await page.getByRole('heading', { name: namePattern('Grace Hopper') }).evaluateAll(nodes => nodes.map(node => node.id))
    assert.deepEqual(names, ['flex', 'space'])
  })
})
