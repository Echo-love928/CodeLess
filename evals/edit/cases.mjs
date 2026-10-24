export const edits = [
  { id: 'EDIT-01', base: 'SHOW-01', componentId: 'home-page', file: 'src/pages/HomePage.vue', selector: 'h1', kind: 'text', before: 'Grace Hopper', after: 'Grace Hopper · 计算机先驱', prompt: '将姓名标题改为“Grace Hopper · 计算机先驱”，只修改所选组件文件，保留其他内容与文件。' },
  { id: 'EDIT-02', base: 'SHOW-01', componentId: 'work-card', file: 'src/components/WorkCard.vue', selector: 'article', kind: 'css', property: 'color', before: 'rgb(0, 0, 0)', after: 'rgb(29, 78, 216)', prompt: '将所选作品卡片正文颜色改为 #1d4ed8，所有共享实例一起生效，只修改所选组件文件。' },
  { id: 'EDIT-03', base: 'SHOW-01', componentId: 'work-card', file: 'src/components/WorkCard.vue', selector: 'article', kind: 'css', property: 'padding-top', before: '12px', after: '24px', prompt: '将所选作品卡片内边距统一改为24px，所有共享实例一起生效，只修改所选组件文件。' },
  { id: 'EDIT-04', base: 'SHOW-02', componentId: 'home-page', file: 'src/pages/HomePage.vue', selector: 'button', kind: 'text', before: '我要报名', after: '立即报名', prompt: '将报名按钮文案改为“立即报名”，保留点击后的演示确认行为，只修改所选组件文件。' },
  { id: 'EDIT-05', base: 'SHOW-01', componentId: 'work-card', file: 'src/components/WorkCard.vue', selector: 'article', kind: 'css', property: 'border-radius', before: '4px', after: '16px', count: 3, prompt: '将所选作品卡片圆角改为16px，三个共享实例全部生效，保留作品标题和说明，只修改所选组件文件。' },
  { id: 'EDIT-06', base: 'TASK-01', componentId: 'tasks-page', file: 'src/pages/TasksPage.vue', selector: 'h1', kind: 'text', before: '个人待办清单', after: '我的每日任务', prompt: '将页面标题改为“我的每日任务”，保留增删、勾选、计数和刷新持久化，只修改所选组件文件。' },
]

export function requestFor(edit, selection) {
  if (selection.selectable !== true || selection.scope !== 'SOURCE_FILE' || selection.shared !== true ||
    selection.componentId !== edit.componentId || selection.sourceFile !== edit.file ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(selection.versionId) || !/^sha256:[a-f0-9]{64}$/.test(selection.sourceDigest)) throw new Error('Untrusted or mismatched component selection')
  return { baseVersionId: selection.versionId, prompt: edit.prompt,
    selection: { componentId: selection.componentId, versionId: selection.versionId, sourceDigest: selection.sourceDigest } }
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

export async function editTarget(page, edit, expect, phase = 'after') {
  const targets = page.locator(edit.selector)
  if (edit.count) await expect(targets).toHaveCount(edit.count)
  else await expect(targets).not.toHaveCount(0)
  for (const target of await targets.all()) {
    if (edit.kind === 'css') {
      const properties = edit.id === 'EDIT-03' ? ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] : [edit.property]
      for (const property of properties) await expect(target).toHaveCSS(property, edit[phase])
    }
    else await expect(target).toHaveText(edit[phase])
  }
  if (edit.id === 'EDIT-04' && phase === 'after') {
    await page.getByRole('button', { name: edit.after, exact: true }).click()
    await expect(page.getByText('报名意向已记录（演示）', { exact: true })).toBeVisible()
  }
}
