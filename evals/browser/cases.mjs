import { namePattern, createTaskName } from './names.mjs'
// IDs and assertions follow D21-A requirements.json, frozen 2026-10-23.
export const requirementsDigest = 'sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a'
export const cases = [
  { id: 'SHOW-01', route: '/', category: 'SHOWCASE' },
  { id: 'SHOW-02', route: '/', category: 'SHOWCASE' },
  { id: 'SHOW-03', route: '/', category: 'SHOWCASE' },
  { id: 'TASK-01', route: '/tasks', category: 'TASKS' },
  { id: 'TASK-02', route: '/tasks', category: 'TASKS' },
  { id: 'TASK-03', route: '/tasks', category: 'TASKS' },
  { id: 'CAT-01', route: '/catalog', category: 'CATALOG' },
  { id: 'CAT-02', route: '/catalog', category: 'CATALOG' },
  { id: 'CAT-03', route: '/catalog', category: 'CATALOG' },
]

export async function behavior(page, id, expect) {
  const text = value => page.getByText(value, { exact: true })
  const button = value => page.getByRole('button', { name: namePattern(value) })
  const visible = async value => expect(text(value)).toBeVisible()
  const row = title => page.locator('li, article').filter({ has: text(title) }).last()
  const title = 'D21验收任务甲', other = 'D21验收任务乙'
  const add = async (name, control = button('添加')) => {
    await page.getByRole('textbox').first().fill(name)
    await control.click()
    await expect(row(name)).toBeVisible()
  }
  const remove = async name => { await row(name).getByRole('button', { name: namePattern('删除') }).click(); await expect(row(name)).toHaveCount(0) }
  const reload = () => page.reload({ waitUntil: 'load' })
  if (id === 'SHOW-01') {
    await visible('Grace Hopper')
    await visible('计算机科学先驱，COBOL 语言的推动者')
    await expect(page.locator('article')).toHaveCount(3)
    for (const name of ['Harvard Mark I 编程', 'A-0 编译器', 'COBOL 标准化']) {
      await expect(row(name)).toBeVisible()
      await expect(row(name).locator('p')).toContainText(/\S/)
    }
    await visible('grace.hopper@example.com')
    await expect(page.getByRole('link', { name: 'grace.hopper@example.com', exact: true })).toHaveCount(0)
  } else if (id === 'SHOW-02') {
    for (const value of ['2026 杭州前端开发者大会', '2026年11月20日', '杭州国际博览中心']) await expect(page.getByText(value, { exact: false }).first()).toBeVisible()
    const items = page.getByRole('listitem')
    await expect(items).toHaveCount(3)
    for (const [index, pair] of [['09:00', '开幕致辞'], ['10:30', 'Vue 性能优化实战'], ['14:00', '无障碍设计实践']].entries()) {
      for (const value of pair) await expect(items.nth(index)).toContainText(value)
    }
    await expect(text('报名意向已记录（演示）')).toHaveCount(0)
    await button('我要报名').click()
    await visible('报名意向已记录（演示）')
    const signup = await button('我要报名').boundingBox(), message = await text('报名意向已记录（演示）').boundingBox()
    expect(message.y).toBeGreaterThanOrEqual(signup.y + signup.height)
  } else if (id === 'SHOW-03') {
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: namePattern('关于我') }) }).last()
    await expect(section).toBeVisible()
    await button('作品集').click()
    await expect(section).not.toBeVisible()
    const cards = page.locator('article, li, [role="listitem"]').filter({ has: page.getByRole('heading') })
    await expect(cards).toHaveCount(4)
    for (const card of await cards.all()) {
      await expect(card.getByRole('heading')).toContainText(/\S/)
      await expect(card.locator('p')).toContainText(/\S/)
    }
    expect(await page.locator('img[src^="http"]').count()).toBe(0)
    await button('联系方式').click(); await visible('linxia@example.com')
    await button('关于我').click(); await expect(section).toBeVisible()
  } else if (id === 'TASK-01') {
    const pending = page.getByText(/未完成\s*[：:]\s*\d+/).first()
    const count = Number((await pending.innerText()).match(/\d+/)[0])
    await add(title); await add(other)
    await expect(pending).toContainText(new RegExp(`未完成\\s*[：:]\\s*${count + 2}(?!\\d)`))
    await row(title).getByRole('checkbox').check()
    await expect(pending).toContainText(new RegExp(`未完成\\s*[：:]\\s*${count + 1}(?!\\d)`))
    await reload(); await expect(row(title).getByRole('checkbox')).toBeChecked(); await expect(row(other)).toBeVisible()
    await remove(other); await reload(); await expect(row(other)).toHaveCount(0); await remove(title)
  } else if (id === 'TASK-02') {
    const column = name => page.locator('section').filter({ has: page.getByRole('heading', { name: namePattern(name) }) }).last()
    for (const name of ['待开始', '进行中', '已完成']) await expect(column(name)).toBeVisible()
    // The frozen requirement specifies creating a task, not a particular button caption.
    await add(title, page.getByRole('button', { name: createTaskName }))
    await expect(column('待开始')).toContainText(title)
    await row(title).getByRole('button', { name: namePattern('下一步') }).click()
    await expect(column('进行中')).toContainText(title)
    await expect(column('待开始')).not.toContainText(title)
    await expect(row(title)).toHaveCount(1)
    await reload(); await expect(column('进行中')).toContainText(title)
    await row(title).getByRole('button', { name: namePattern('下一步') }).click()
    await expect(column('已完成')).toContainText(title)
    await expect(column('进行中')).not.toContainText(title)
    await reload(); await expect(column('已完成')).toContainText(title); await remove(title)
    await reload(); await expect(row(title)).toHaveCount(0)
  } else if (id === 'TASK-03') {
    const addProduct = async name => { await page.getByRole('textbox').first().fill(name); await page.getByRole('spinbutton').fill('3'); await button('加入清单').click(); await expect(row(name)).toContainText('3') }
    const third = 'D21验收任务丙'
    await addProduct(title); await addProduct(other); await addProduct(third)
    await row(title).getByRole('checkbox').check()
    await row(third).getByRole('checkbox').check()
    await reload(); await expect(row(title).getByRole('checkbox')).toBeChecked(); await expect(row(third).getByRole('checkbox')).toBeChecked(); await expect(row(other)).toContainText('3')
    await button('清除已购买').click(); await expect(row(title)).toHaveCount(0); await expect(row(third)).toHaveCount(0); await expect(row(other)).toBeVisible()
    await reload(); await expect(row(title)).toHaveCount(0); await expect(row(third)).toHaveCount(0); await remove(other); await reload(); await expect(row(other)).toHaveCount(0)
  } else if (/^CAT-/.test(id)) {
    // These semantic selectors are fixed before a run, never generated by the model.
    const cards = page.locator('article, li, [role="listitem"]').filter({ has: page.locator('h1,h2,h3,h4,h5,h6,button') })
    const size = { 'CAT-01': 8, 'CAT-02': 6, 'CAT-03': 9 }[id]
    await expect(cards).toHaveCount(size)
    // Labels are presentation: compare the field values even when cards/details label them differently.
    const fieldValue = value => value.trim().replace(/^(?:作者|分类|类别|所在城区|城区|地区|评分|招牌饮品|推荐饮品|一句简介|简介|简短描述|描述|许可证|许可协议|开源许可证|开源许可)\s*[：:]\s*/, '').trim()
    const cardName = async card => {
      const heading = card.getByRole('heading')
      if (await heading.count() === 1) return (await heading.innerText()).trim()
      const control = card.getByRole('button').first(), spans = control.locator('span')
      return (await spans.count() ? await spans.first().innerText() : (await control.innerText()).split('\n')[0]).trim()
    }
    const detailFor = name => page.locator('[role="region"], section').filter({ hasNot: cards })
      .filter({ has: page.getByRole('heading', { name: new RegExp('详情|' + namePattern(name).source, 'u') }) }).last()
    const initial = []
    for (const card of await cards.all()) {
      const name = await cardName(card)
      let rawFields = await card.locator('p, dd').allTextContents()
      // The requirement permits compact title/author lists with the remaining fields in details.
      // Read the real UI, then prove search/category behaviour against this initial inventory.
      if (id === 'CAT-01' && rawFields.length < 3) {
        await card.getByText(name, { exact: true }).click()
        const detail = detailFor(name)
        await expect(detail).toBeVisible(); await expect(detail).toContainText(name)
        rawFields = await detail.locator('p, dd').allTextContents()
      }
      initial.push({ name, rawFields, fields: rawFields.map(fieldValue) })
    }
    for (const item of initial) {
      expect(item.fields.length).toBeGreaterThanOrEqual(3)
      expect(item.fields.every(field => field.trim())).toBe(true)
      if (id === 'CAT-02') expect(item.fields.join(' ')).toMatch(/(?:[0-5](?:\.\d+)?)[分星]?/)
      if (id === 'CAT-03') expect(item.fields.join(' ')).toMatch(/MIT|Apache|BSD|GPL|ISC|MPL|Unlicense/i)
    }
    const name = initial[0].name, fields = initial[0].fields
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields.every(value => value.trim())).toBe(true)
    const search = page.getByRole('textbox').or(page.getByRole('searchbox')).first()
    const checkSearch = async term => {
      await search.fill(term); await expect(cards).not.toHaveCount(0)
      for (const card of await cards.all()) {
        if (id !== 'CAT-01') await expect(card).toContainText(term)
        else {
          const currentName = await cardName(card), item = initial.find(item => item.name === currentName)
          expect(item).toBeTruthy()
          const labelled = item.rawFields.find(value => /^\s*作者\s*[：:]/.test(value))
          const author = labelled ? fieldValue(labelled) : item.fields.find(value => !['小说', '科技', '历史'].includes(value))
          expect(currentName.includes(term) || author.includes(term)).toBe(true)
        }
      }
    }
    await checkSearch(name)
    expect(await cards.count()).toBeLessThan(size)
    await cards.first().getByText(name, { exact: true }).click()
    const detail = detailFor(name)
    await expect(detail).toBeVisible(); await expect(detail).toContainText(name)
    for (const field of fields) await expect(detail).toContainText(field)
    if (id === 'CAT-02') {
      const cardBox = await cards.first().boundingBox(), detailBox = await detail.boundingBox()
      expect(detailBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height)
    }
    await search.fill('')
    if (id === 'CAT-01') {
      const author = initial[0].rawFields.find(value => /^\s*作者\s*[：:]/.test(value))
      const bareAuthor = fields.find(value => !['小说', '科技', '历史'].includes(value))
      await checkSearch(author ? fieldValue(author) : bareAuthor); await search.fill('')
    }
    const categories = id === 'CAT-01' ? ['小说', '科技', '历史'] : id === 'CAT-03' ? ['构建', '测试', '文档'] : []
    if (id === 'CAT-02') {
      const options = await page.getByRole('combobox').locator('option').allTextContents()
      expect(options.length).toBeGreaterThan(1)
      categories.push(...options.filter(value => !/全部/.test(value)))
    }
    for (const category of categories) {
      if (id === 'CAT-02') await page.getByRole('combobox').selectOption({ label: category })
      else await button(category).click()
      await expect(cards).not.toHaveCount(0)
      expect(await cards.count()).toBeLessThan(size)
      for (const card of await cards.all()) {
        if (id !== 'CAT-01') await expect(card).toContainText(category)
        else {
          const current = await cardName(card)
          expect(initial.find(item => item.name === current)?.fields).toContain(category)
        }
      }
      const categoryNames = new Set(await Promise.all((await cards.all()).map(cardName)))
      // Searching for an item from a different category must keep the category active.
      const matchName = await cardName(cards.first())
      await checkSearch(matchName)
      await search.fill(name)
      for (const card of await cards.all()) {
        const current = await cardName(card)
        expect(current).toContain(name)
        if (id !== 'CAT-01') await expect(card).toContainText(category)
        else expect(initial.find(item => item.name === current)?.fields).toContain(category)
      }
      const excluded = initial.find(item => !categoryNames.has(item.name))
      expect(excluded).toBeTruthy()
      await search.fill(excluded.name); await expect(cards).toHaveCount(0)
      await search.fill('')
    }
    await search.fill('D21绝不存在的检索词')
    await expect(cards).toHaveCount(0)
    if (id === 'CAT-03') await visible('没有匹配的工具')
    await search.fill('')
    if (id === 'CAT-02') await page.getByRole('combobox').selectOption({ label: '全部' })
    else await button('全部').click()
    await expect(cards).toHaveCount(size)
  } else throw new Error('Unknown requirement ' + id)
}
