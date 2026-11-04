import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const docs = ['docs/delivery/frontend.md', 'docs/demo/full-script.md', 'docs/user-guide.md', 'docs/handoffs/D29-B.md'];

test('current D28 narrative cites final acceptance, preserving the failed requirement', () => {
  const accepted = JSON.parse(read('tests/release/api/evidence/d28-final-review/summary.json'));
  const quality = JSON.parse(read('tests/release/api/evidence/d28-final-review/quality.json'));
  const delivery = read('docs/delivery/frontend.md');
  assert.ok(delivery.includes(accepted.candidate));
  assert.ok(delivery.includes('d28-final-review/summary.json'));
  const score = `${quality.incrementalRequirements.passed}/${quality.incrementalRequirements.denominator}`;
  for (const path of ['docs/delivery/frontend.md', 'docs/demo/full-script.md']) {
    assert.ok(read(path).includes(`增量组合${score}`), `${path}: final composite quality`);
    for (const id of quality.retainedFailedRequirementIds) assert.ok(read(path).includes(id), `${path}: retained failure ${id}`);
  }
});

test('D29 local Markdown destinations exist (external reachability is not tested)', () => {
  for (const path of docs) {
    for (const match of read(path).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#)/.test(target)) continue;
      assert.ok(existsSync(resolve(root, dirname(path), target.split('#')[0])), `${path}: ${target}`);
    }
  }
});

test('documented critical control names still occur in candidate Vue sources', () => {
  const bindings = {
    'apps/web/src/features/apps/AppsPage.vue': ['新建应用', '数据模式'],
    'apps/web/src/features/workbench/WorkbenchPage.vue': ['开始生成', '刷新任务', '任务恢复链接'],
    'apps/web/src/features/versions/VersionWorkspace.vue': ['刷新版本', '查看源码并预览'],
    'apps/web/src/features/visual-edit/VisualEditSelector.vue': ['选择组件进行修改'],
    'apps/web/src/features/visual-edit/VisualComponentEditor.vue': ['组件修改描述', '创建组件修改', '我确认修改影响整个源码组件及所有共享实例'],
    'apps/web/src/features/deploy/DeployPanel.vue': ['我确认公开发布上方版本', '确认发布', '重新读取版本与发布记录'],
    'apps/web/src/features/deploy/DeploymentCover.vue': ['刷新封面', '查看封面对应页面'],
    'apps/web/src/features/source/SourceDownload.vue': ['下载源码', '下载版本', '源码摘要'],
  };
  const guide = read('docs/user-guide.md');
  for (const [path, labels] of Object.entries(bindings)) {
    for (const label of labels) {
      assert.ok(read(path).includes(label), `${path}: ${label}`);
      assert.ok(guide.includes(label), `user guide: ${label}`);
    }
  }
});
