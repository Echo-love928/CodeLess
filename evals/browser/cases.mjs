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
  const button = value => page.getByRole('button', { name: value, exact: true })
  const visible = async value => expect(text(value)).toBeVisible()
  const row = title => page.locator('li, article').filter({ has: text(title) }).last()
  const title = 'D21验收任务甲', other = 'D21验收任务乙'
  const add = async (name, label = '添加') => {
    await page.getByRole('textbox').first().fill(name)
    await button(label).click()
    await expect(row(name)).toBeVisible()
  }
  const remove = async name => { await row(name).getByRole('button', { name: '删除', exact: true }).click(); await expect(row(name)).toHaveCount(0) }
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
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '关于我', exact: true }) }).last()
    await expect(section).toBeVisible()
    await button('作品集').click()
    await expect(section).not.toBeVisible()
    await expect(page.locator('article')).toHaveCount(4)
    for (const card of await page.locator('article').all()) {
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
    const column = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
    for (const name of ['待开始', '进行中', '已完成']) await expect(column(name)).toBeVisible()
    await add(title)
    await expect(column('待开始')).toContainText(title)
    await row(title).getByRole('button', { name: '下一步', exact: true }).click()
    await expect(column('进行中')).toContainText(title)
    await reload(); await expect(column('进行中')).toContainText(title)
    await row(title).getByRole('button', { name: '下一步', exact: true }).click()
    await expect(column('已完成')).toContainText(title)
    await reload(); await expect(column('已完成')).toContainText(title); await remove(title)
    await reload(); await expect(row(title)).toHaveCount(0)
  } else if (id === 'TASK-03') {
    const addProduct = async name => { await page.getByRole('textbox').first().fill(name); await page.getByRole('spinbutton').fill('3'); await button('加入清单').click(); await expect(row(name)).toContainText('3') }
    await addProduct(title); await addProduct(other)
    await row(title).getByRole('checkbox').check()
    await reload(); await expect(row(title).getByRole('checkbox')).toBeChecked(); await expect(row(other)).toContainText('3')
    await button('清除已购买').click(); await expect(row(title)).toHaveCount(0); await expect(row(other)).toBeVisible()
    await reload(); await expect(row(title)).toHaveCount(0); await remove(other); await reload(); await expect(row(other)).toHaveCount(0)
  } else if (/^CAT-/.test(id)) {
    // These semantic selectors are fixed before a run, never generated by the model.
    const cards = page.locator('article')
    const size = { 'CAT-01': 8, 'CAT-02': 6, 'CAT-03': 9 }[id]
    await expect(cards).toHaveCount(size)
    const initial = await Promise.all((await cards.all()).map(async card => ({ name: (await card.getByRole('heading').innerText()).trim(), fields: await card.locator('p').allTextContents() })))
    const first = cards.first(), name = initial[0].name
    const fields = await first.locator('p').allTextContents()
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields.every(value => value.trim())).toBe(true)
    const search = page.getByRole('textbox').first()
    const checkSearch = async term => { await search.fill(term); await expect(cards).not.toHaveCount(0); for (const card of await cards.all()) await expect(card).toContainText(term) }
    await checkSearch(name)
    expect(await cards.count()).toBeLessThan(size)
    await cards.first().click()
    const detail = page.locator('[role="region"][aria-label="详情"], section').filter({ has: page.getByRole('heading', { name: /详情/ }) }).last()
    await expect(detail).toBeVisible(); await expect(detail).toContainText(name)
    for (const field of fields) await expect(detail).toContainText(field)
    if (id === 'CAT-02') {
      const cardBox = await cards.first().boundingBox(), detailBox = await detail.boundingBox()
      expect(detailBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height)
    }
    await search.fill('')
    if (id === 'CAT-01') { await checkSearch(fields[0]); await search.fill('') }
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
      for (const card of await cards.all()) await expect(card).toContainText(category)
      // Searching for an item from a different category must keep the category active.
      const matchName = await cards.first().getByRole('heading').innerText()
      await checkSearch(matchName)
      await search.fill(name)
      for (const card of await cards.all()) { await expect(card).toContainText(category); await expect(card).toContainText(name) }
      const excluded = initial.find(item => !item.fields.includes(category))
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
