import { sourcePath, resolveSelection } from '../../services/runner/src/mapping/manifest.mjs'
import { namePattern } from '../browser/names.mjs'

// Only fixture writers use fixture.file/componentId and fixtureBefore. Runtime selection
// comes from semantic DOM targets joined to the rebuilt trusted catalog.
export const edits = [
  { id: 'EDIT-01', base: 'SHOW-01', fixture: { componentId: 'home-page', file: 'src/pages/HomePage.vue' }, kind: 'text', before: 'Grace Hopper', after: 'Grace Hopper · 计算机先驱', prompt: '将姓名标题改为“Grace Hopper · 计算机先驱”，只修改所选组件文件，保留其他内容与文件。' },
  { id: 'EDIT-02', base: 'SHOW-01', fixture: { componentId: 'work-card', file: 'src/components/WorkCard.vue' }, kind: 'css', property: 'color', fixtureBefore: 'rgb(0, 0, 0)', after: 'rgb(29, 78, 216)', prompt: '将所选作品卡片正文颜色改为 #1d4ed8，所有共享实例一起生效，只修改所选组件文件。' },
  { id: 'EDIT-03', base: 'SHOW-01', fixture: { componentId: 'work-card', file: 'src/components/WorkCard.vue' }, kind: 'css', property: 'padding-top', fixtureBefore: '12px', after: '24px', prompt: '将所选作品卡片内边距统一改为24px，所有共享实例一起生效，只修改所选组件文件。' },
  { id: 'EDIT-04', base: 'SHOW-02', fixture: { componentId: 'home-page', file: 'src/pages/HomePage.vue' }, kind: 'text', before: '我要报名', after: '立即报名', prompt: '将报名按钮文案改为“立即报名”，保留点击后的演示确认行为，只修改所选组件文件。' },
  { id: 'EDIT-05', base: 'SHOW-01', fixture: { componentId: 'work-card', file: 'src/components/WorkCard.vue' }, kind: 'css', property: 'border-radius', fixtureBefore: '4px', after: '16px', count: 3, prompt: '将所选作品卡片圆角改为16px，三个共享实例全部生效，保留作品标题和说明，只修改所选组件文件。' },
  { id: 'EDIT-06', base: 'TASK-01', fixture: { componentId: 'tasks-page', file: 'src/pages/TasksPage.vue' }, kind: 'text', before: '个人待办清单', after: '我的每日任务', prompt: '将页面标题改为“我的每日任务”，保留增删、勾选、计数和刷新持久化，只修改所选组件文件。' },
]

export function requestFor(edit, selection, trustedMapping) {
  const resolved = resolveSelection(trustedMapping, { componentId: selection.componentId,
    versionId: selection.versionId, sourceDigest: selection.sourceDigest })
  if (selection.selectable !== true || selection.scope !== 'SOURCE_FILE' || selection.shared !== true ||
      !sourcePath(selection.sourceFile) || !resolved.selectable || resolved.sourceFile !== selection.sourceFile)
    throw new Error('Untrusted or mismatched component selection')
  return { baseVersionId: resolved.versionId, prompt: edit.prompt,
    selection: { componentId: resolved.componentId, versionId: resolved.versionId, sourceDigest: resolved.sourceDigest } }
}

export function scopeDiff(before, after, target) {
  if (!before.length || !after.length) throw new Error('Missing source manifest')
  const index = files => {
    const map = new Map()
    for (const file of files) {
      if (map.has(file.path) || !/^src\/(?:pages|components|data)\/[A-Za-z][A-Za-z0-9_-]*\.(?:vue|ts)$/.test(file.path) || !/^sha256:[a-f0-9]{64}$/.test(file.digest)) throw new Error('Invalid manifest')
      map.set(file.path, file.digest)
    }
    return map
  }
  const a = index(before), b = index(after)
  const changed = [...new Set([...a.keys(), ...b.keys()])].filter(path => a.get(path) !== b.get(path)).sort()
  return { passed: a.has(target) && b.has(target) && changed.length === 1 && changed[0] === target,
    changed, unrelated: changed.filter(path => path !== target), targetChanged: a.has(target) && b.has(target) && a.get(target) !== b.get(target) }
}

export const workTitles = ['Harvard Mark I 编程', 'A-0 编译器', 'COBOL 标准化']
export function semanticTargets(page, edit, phase = 'before') {
  if (edit.kind === 'css') return page.locator('article').filter({ has: page.getByRole('heading', { name: new RegExp(workTitles.map(value => namePattern(value).source).join('|'), 'u') }) })
  return page.getByRole(edit.id === 'EDIT-04' ? 'button' : 'heading', { name: namePattern(edit[phase]) })
}

export async function observeTarget(page, edit, expect, phase = 'before') {
  const targets = semanticTargets(page, edit, phase)
  await expect(targets).toHaveCount(edit.kind === 'css' ? 3 : 1)
  const observations = []
  for (const target of await targets.all()) {
    await expect(target).toBeVisible()
    if (edit.kind === 'css' && edit.property === 'color') await expect(target.locator('p')).not.toHaveCount(0)
    let title = null
    if (edit.kind === 'css') for (const value of workTitles)
      if (await target.getByRole('heading', { name: namePattern(value) }).count() === 1) { title = value; break }
    observations.push({ ...await target.evaluate((node, properties) => ({
      candidateId: node.closest('[data-ai-component]')?.getAttribute('data-ai-component') ?? null,
      text: node.textContent.trim(), descriptions: [...node.querySelectorAll('p')].map(p => p.textContent.trim()),
      css: Object.fromEntries(properties.flatMap(property => property === 'color'
        ? [...node.querySelectorAll('p')].map((p, i) => ['body-color-' + i, getComputedStyle(p).color])
        : [[property, getComputedStyle(node).getPropertyValue(property)]]))
    }), edit.kind === 'css' ? (edit.id === 'EDIT-03' ? ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] : [edit.property]) : []), title })
  }
  if (edit.kind === 'css') for (const title of workTitles)
    await expect(targets.getByRole('heading', { name: namePattern(title) })).toHaveCount(1)
  return observations
}

export async function editTarget(page, edit, expect, phase = 'after', baseline = null) {
  const values = await observeTarget(page, edit, expect, phase)
  if (phase === 'after') {
    if (edit.kind === 'css') {
      for (const value of values) for (const actual of Object.values(value.css)) expect(actual).toBe(edit.after)
      const contents = observations => observations.map(v => JSON.stringify({ title: v.title,
        descriptions: v.descriptions.map(text => text.replace(/\s+/gu, ' ').trim()) })).sort()
      if (baseline) expect(contents(values)).toEqual(contents(baseline))
    }
    if (edit.id === 'EDIT-04') {
      await semanticTargets(page, edit, 'after').click()
      await expect(page.getByText('报名意向已记录（演示）', { exact: true })).toBeVisible()
    }
  }
  return values
}
