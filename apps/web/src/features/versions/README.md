# D11-B 版本面板与只读源码

基线 main `413e5b8` 只有 `GET /api/v0/versions/{versionId}` 的 v0 详情和
`POST /api/v0/applications/{applicationId}/versions/{versionId}/preview-credentials`。
2026-10-11 只读 `gh pr list --state open` 返回 `[]`，没有 D11-A 交接。
以下两个接口是 **B 的待对接建议，不是已存在的公共契约或后端实现**。
没有改公共 OpenAPI/schema、迁移、锁文件、CI 或后端。

## 待 A/契约维护者确认的最小读取契约

- `GET /api/v0/applications/{applicationId}/versions?page=0&size=20`：
  `{items, page, size, total}`，按版本号倒序稳定分页，size 固定 20。
  item 沿用 v0 version schema（id/applicationId/number/sourceDigest/status/buildId/createdAt），
  增加可空 UUID `taskId` 和可空字符串 `errorSummary`（最多 2000 字符）。
  未提供来源/摘要显示“未提供”，不推测对应任务或错误。
  VERIFIED 必须有 buildId；未知状态/错误应用/重复条目/损坏分页返回前端错误。
- `GET /api/v0/versions/{versionId}/source`：
  `{versionId, sourceDigest, files:[{path,content}]}`，只读取按 versionId 保存的不可变快照。
  摘要必须与版本条目相同；不接受工作目录路径或任务目录作为读取入口。
  files 最多 200，单文件最多 256,000 JS 字符，总内容最多 1,000,000 JS 字符，
  path 最多 240 字符、相对 POSIX 路径，不能有 `.`/`..` 段或重复路径。
  A 应依据已有 runner 快照限制收紧这些上限，并在响应前实施字节/权限边界。
  浏览器只校验关联摘要，不重算 runner 的规范化快照哈希；真实哈希一致性由 A 验收。

两个接口必须使用真实 session/应用所有权过滤、响应 no-store。
401 返回登录；404 不区分不存在/无权限；没有快照不能虚构空源码。
有快照但没有文件返回 `files:[]`。列表真实为空返回 `total:0,items:[]`。
后端资源限制和源码快照的摘要/所有权仍由 D11-A 承担。

## UI 接线与边界

`VersionWorkspace.vue` 复用未修改的 D09 `PreviewPanel`；默认预览仍取应用的
latestReadyVersionId，由已有凭据服务最终校验。用户只能为 VERIFIED + buildId
条目切换预览。这个动作让源码和预览使用同一个 versionId；不会更新应用元数据。
查看 DRAFT/FAILED 源码保留原预览，两块分别显示 ID。
列表失败、空列表及分页均不会覆盖已有预览；源码请求失败立即清掉旧源码，避免错标版本。
新任务 READY 的 latestReadyVersionId 变化会读取新版本；任务状态变更重读列表。
所有请求只消费当前应用/选择的结果，旧请求 abort + 序号保护。
源码只使用 Vue 文本插值到 pre/code，无 v-html、eval、在线 IDE 或源码下载执行。

工作台跨默认范围的唯一改动：将 PreviewPanel 挂载改为 VersionWorkspace，
传入 task id/status 作为刷新标记；任务逻辑、预览安全设置和凭据实现只读。
同日最后启用 PR 必须确认上述读取契约或调整这两个局部适配器，并完成真实联调。
当前后端会诚实显示列表尚不可用，既有预览继续可用。

## 验收入口

在锁定 Node24.16.0/pnpm12.6.0 与 Chromium 已安装的仓库根执行：

    corepack pnpm --filter @codeless/web build
    corepack pnpm --filter @codeless/web exec playwright test --config playwright.config.ts versions/flow.spec.ts

API/auth/source/预览页面使用明确 fixture，平台生产 UI 和 Chromium 真实运行。
截图 `tests/e2e/versions/evidence/2026-10-11/`。它们证明前端行为，
不能证明真实后端持久快照、生成结果/模型效果或当日完整集成。
