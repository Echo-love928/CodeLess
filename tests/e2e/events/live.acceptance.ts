import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

// Isolated Spring/PostgreSQL fixture, production scheduler disabled. No model/READY claim.
function advance(taskId: string, stage: 'GENERATE' | 'VERIFY') {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('Invalid fixture task ID')
  const sql = `BEGIN;
    SELECT id FROM generation_tasks WHERE id='${taskId}' FOR UPDATE;
    UPDATE generation_tasks SET status='${stage}',event_sequence=event_sequence+1,updated_at=clock_timestamp() WHERE id='${taskId}';
    INSERT INTO task_events(id,task_id,sequence,type,stage,message)
    SELECT gen_random_uuid(),id,event_sequence,'STAGE_STARTED','${stage}','Deterministic fixture stage' FROM generation_tasks WHERE id='${taskId}';
    COMMIT;`
  execFileSync('docker', ['exec', '-i', process.env.CODELESS_D06_DB_CONTAINER!, 'psql', '-U', 'codeless', '-d', 'codeless', '-v', 'ON_ERROR_STOP=1'], { input: sql })
}

test('live D06: real HTTP creation → durable SSE → offline catchup → reload/reopen → cancel → terminal stop', async ({ page, context }) => {
  const transportIds: string[] = []
  page.on('request', request => {
    if (request.url().includes('/events') && request.headers().accept === 'text/event-stream') transportIds.push(request.headers()['last-event-id'])
  })
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill(process.env.CODELESS_DEMO_PASSWORD!)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await page.locator('.dashboard-heading').getByRole('button', { name: '新建应用', exact: true }).click()
  await page.getByLabel('应用名称').fill(`D06 live fixture ${Date.now()}`)
  await page.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click()
  await expect(page).toHaveURL(/\/workbench\//)
  const url = page.url()
  await page.getByLabel('需求描述').fill('确定性任务：测试 SSE 与取消，不生成 READY')
  const response = page.waitForResponse(res => res.url().endsWith('/api/v0/tasks') && res.request().method() === 'POST')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  const task = await (await response).json() as { id: string }
  await expect(page.locator('[data-sequence="1"]')).toHaveCount(1)
  await expect(page.getByText('事件已连接', { exact: true })).toBeVisible()
  await context.setOffline(true)
  advance(task.id, 'GENERATE')
  advance(task.id, 'VERIFY')
  await expect(page.getByText(/连接中断，正在恢复/)).toBeVisible()
  await context.setOffline(false)
  await expect(page.locator('[data-sequence]')).toHaveCount(3)
  await expect(page.locator('.task-status')).toContainText('正在验证')
  await expect.poll(() => transportIds.includes('3')).toBe(true)
  await page.reload()
  await expect(page.locator('[data-sequence]')).toHaveCount(3)
  await expect(page.locator('.task-status')).toContainText(task.id)
  const reopened = await context.newPage()
  await page.close()
  await reopened.goto(url)
  await expect(reopened.locator('[data-sequence]')).toHaveCount(3)
  await reopened.getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(reopened.locator('.task-status')).toContainText('任务已取消')
  await expect(reopened.locator('[data-sequence]')).toHaveCount(4)
  await expect(reopened.getByRole('button', { name: '重试生成', exact: true })).toBeEnabled()
  await expect(reopened.getByText('任务事件已同步', { exact: true })).toBeVisible()
  const requests: string[] = []
  reopened.on('request', request => { if (request.url().includes('/events')) requests.push(request.url()) })
  await reopened.waitForTimeout(2100)
  expect(requests).toEqual([])
  await reopened.screenshot({ path: '../../.local-data/d06-b/live-cancelled.png', fullPage: true })
  const db = execFileSync('docker', ['exec', process.env.CODELESS_D06_DB_CONTAINER!, 'psql', '-U', 'codeless', '-d', 'codeless', '-tAc',
    `SELECT status||'/'||failure_code||'/'||event_sequence FROM generation_tasks WHERE id='${task.id}'`], { encoding: 'utf8' }).trim()
  expect(db).toBe('FAILED/CANCELLED/4')
  console.log(JSON.stringify({ source: 'real Spring/Tomcat + PostgreSQL, deterministic stage fixture', taskId: task.id, resumeCursors: transportIds, database: db }))
})
