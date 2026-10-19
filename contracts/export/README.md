# D16-A：指定版本源码导出契约

基线 `03c7905`（D15 合入后的 main），前置 D11-A 不可变版本快照与 D15-A 版本锁定发布。
本目录是 A 独立交付的契约差异；共享 `contracts/openapi.v0.json` 未修改，由最后启用的集成 PR（维护者）登记
`openapi.patch.json`。D16-B「部署封面截图与分享下载界面」按本契约独立接入下载按钮。

## HTTP

`GET /api/v0/versions/{versionId}/export`，只有 GET；平台 session，**只有 owner** 可下载。

| 情况 | 状态 / code |
| --- | --- |
| 成功 | **200** `application/zip`，`Content-Disposition: attachment; filename="codeless-{versionId}.zip"` |
| 未登录 | 401 `UNAUTHENTICATED` |
| 其他 owner（含 ADMIN，无旁路）或版本不存在 | 404 `NOT_FOUND`（两者不可区分） |
| `versionId` 不是 UUID | 400 `INVALID_REQUEST` |
| DRAFT、FAILED、初始空壳，或没有 SUCCEEDED/exit0/已完成的构建 | 409 `EXPORT_VERSION_UNAVAILABLE` |
| 版本没有冻结快照 | 409 `SNAPSHOT_UNAVAILABLE` |
| 冻结源码/报告/产物被篡改、混入额外文件（如 `.env`、`node_modules`、日志）或不可读 | 503 `SNAPSHOT_DIGEST_MISMATCH` / `SNAPSHOT_PATH_REJECTED` / `SNAPSHOT_REPORT_INVALID` 等 |
| 受控模板或运行说明模板缺失、被链接/别名替换或无效 | 503 `EXPORT_TEMPLATE_UNAVAILABLE` / `EXPORT_TEMPLATE_INVALID` |
| 超出固定上限 | 503 `EXPORT_LIMIT_EXCEEDED` |
| POST/PUT 等写方法 | 先经 CSRF（缺失 403），之后 405 |

所有响应 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`。拒绝一律是 JSON `error.schema.json`，
不含主机路径、源码或秘密，**绝不返回部分 ZIP**：全部输入在发送第一个字节前读取并逐字节核对哈希。
没有 path、文件、版本列表或其他选择参数；附加的 query 参数被忽略，不能选中其他文件或版本。

成功响应另带 `X-CodeLess-Version-Id`、`X-CodeLess-Source-Digest`、`X-CodeLess-Artifact-Digest`、
`X-CodeLess-Content-Digest`，与包内清单相同，供界面在保存前核对“下载的就是当前选中的版本”。

## 资格（与 D15 发布相同的已验证判定）

版本 `VERIFIED`；其 `build_id` 对应构建 `SUCCEEDED`、`exit_code=0`、`completed_at` 非空且属于该版本；
冻结 outcome 的 `artifactDigest` 与构建一致，报告 `buildId`、`buildStatus=SUCCEEDED`、`exitCode=0`、
`verificationStatus=PASSED`。归档应用的已验证版本仍可由 owner 下载（只读，不改变状态）。

## 包结构（`codeless-{versionId}/` 单一根目录）

| 路径 | `origin` | 来源 |
| --- | --- | --- |
| `src/pages/*.vue`、`src/components/*.vue`、`src/data/*.ts` | `VERSION_SOURCE` | 该版本冻结源码，逐字节导出；合起来等于版本 `sourceDigest` |
| 未由版本提供的 `src/pages/{Home,Tasks,Catalog}Page.vue` | `TEMPLATE_DEFAULT` | 受控模板默认页，与构建容器覆盖规则一致 |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`index.html`、`tsconfig.json`、`vite.config.ts`、`src/main.ts`、`src/App.vue`、`src/router.ts`、`src/build-node.d.ts` | `TEMPLATE` | 受控模板固定配置与锁文件 |
| `README.md` | `README` | 由 `docs/generated-project-readme.md` 渲染的运行说明 |
| `codeless-export.json` | — | [manifest.schema.json](manifest.schema.json) 清单，不计入 `contentDigest` |

**允许列表**：只打开上表固定路径与版本快照清单中的文件；模板目录不枚举，因此 `.env`、`.npmrc`、密钥、日志、
`node_modules`、`dist`、`fixtures/`、`preview-bridge/`、`allowed-dependencies.json` 以及其他版本都不会被读取。
写入前再做一次与来源无关的路径门禁：拒绝隐藏段、`node_modules`、`..`、绝对/盘符路径、反斜杠、非 ASCII、
Windows 设备名、大小写别名和文件/目录冲突。版本快照读取复用 D11 的全量扫描：快照中任何额外文件都令导出 503，
不会被跳过或打包。

**ZIP 形态**：DEFLATE，UTF-8 名称标志，`version made by` = Unix，每个成员外部属性 `0100644`（普通、不可执行、
非链接）；无目录项、扩展字段、注释、data descriptor、加密或 ZIP64。修改时间固定为版本创建时间（UTC），
成员按路径排序，因此同一版本与模板得到**逐字节相同**的 ZIP。上限：64 个成员、单文件 1 MiB、
未压缩合计 4 MiB、ZIP 8 MiB（版本源码另受 D11 的 40 文件 / 128 KiB / 512 KiB 限制）。
响应以 `StreamingResponseBody` 逐成员压缩写出，不缓存整包、不落临时文件。

## 清单与哈希

`sourceDigest`、`templateDigest`、`contentDigest` 与 D11 相同算法：按路径排序的紧凑 UTF-8 JSON
`[{"path","bytes","digest"}]` 的 SHA-256（`sha256:` + 小写 hex）。`sourceDigest` 只覆盖 `VERSION_SOURCE`，
等于版本记录；`templateDigest` 只覆盖 `TEMPLATE`；`contentDigest` 覆盖清单列出的全部文件。
`artifactDigest`、`reportDigest` 来自冻结 outcome，与 D15 发布记录绑定的值相同，因此源码包、版本和发布记录可互相追溯。
README 中给出离线复核命令。

## 模板来源与已知限制

受控模板与运行说明模板从受信、只读的仓库检出读取：`codeless.export.repository-root`，默认等于
`codeless.agent.repository-root`（生产 `/srv/codeless/repository`），否则为进程工作目录；从不来自请求、任务或模型。
逐文件拒绝符号链接、junction、硬链接、大小写别名和超限文件。文本以 Git 规范 LF 字节导出（Windows 检出的 CRLF
会被规范化，孤立 CR 或非 UTF-8 拒绝），因此 `templateDigest` 与平台无关。

D11 的冻结报告**没有记录构建时使用的模板摘要**；导出使用当前受控模板。若模板在版本构建后被修改，
导出的固定配置可能不同于当时构建镜像中的版本——`templateDigest` 如实记录导出内容，但不证明与构建时相同。
在构建结果中冻结模板摘要属于 runner/Agent 维护者的后续变更。

构建镜像复制的是**工作树字节**。Linux/CI/生产检出为 LF，用导出字节在全新容器重新构建，`dist` 的同算法摘要应与
`artifactDigest` 逐字节相同，D16-A-T1 直接断言。由 Windows `core.autocrlf` 检出构建的镜像编译的是 CRLF 模板
（冻结的 `index.html` 含 CR 即为证据）；此时 T1 在容器内副本恢复同样的 CRLF 呈现（`--crlf-template-diagnostic`，
不改变导出字节、不是验收模式）后断言逐字节复现，证明差异仅来自换行呈现。

## D16-B 接入

- 下载按钮只针对当前选中的版本，且仅在该版本 `status=VERIFIED` 时可用；DRAFT/FAILED 显示不可下载原因。
- 建议 `fetch(url, {credentials: 'same-origin'})`：检查 `res.ok`、`Content-Type: application/zip` 与
  `X-CodeLess-Version-Id === 选中版本`，再以 Blob 保存为 `codeless-{versionId}.zip`；非 200 读取 JSON `code` 显示，
  不要把错误 JSON 当文件保存。可展示 `X-CodeLess-Source-Digest`、`X-CodeLess-Artifact-Digest` 作为追溯信息。
- 不需要 CSRF（GET）；不要拼接 path 或其他参数。

## 复现

```powershell
. ./.local-data/d07-a/env.ps1
node tests/export/record-command.mjs acceptance
node tests/export/record-command.mjs contracts
node tests/export/verify-export.mjs tests/export/evidence/2026-10-19/export-<versionId>.zip
node tests/export/clean-build.mjs tests/export/evidence/2026-10-19/export-<versionId>.zip .local-data/d16-a/rebuild
```

验收使用明确命名的 deterministic-mock 提案；PostgreSQL、Docker 构建、Chromium 验证、冻结快照、真实 HTTP 下载，
以及解包后在全新固定摘要 Node 容器中的 `--frozen-lockfile` 安装与构建都是真实执行，不代表付费模型效果。
