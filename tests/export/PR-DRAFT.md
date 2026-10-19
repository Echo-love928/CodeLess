# D16-A：指定版本源码导出（下载接口、运行说明模板、包内容测试）

任务ID：D16-A（D16-A-01..04，T1–T4）。分支 `codex/d16-a-source-export`，base `main` = `03c7905`（D15 已合入）。

## 问题与结果

- 触发场景：owner 在平台中选中一个已验证（VERIFIED）的不可变版本，点击“下载源码”。
- 修复前：只有 D11 的逐文件只读 JSON 接口；没有可下载、可在本地安装构建、可核对哈希的源码包。
- 修复后：`GET /api/v0/versions/{versionId}/export` 流式返回确定性 ZIP：冻结业务源码（逐字节，等于 `sourceDigest`）、
  受控模板固定配置与锁文件（Git 规范 LF）、由 `docs/generated-project-readme.md` 渲染的运行说明，
  以及记录版本/构建/源码/产物/报告/模板/内容哈希的 `codeless-export.json`。

## 范围

- `services/api/src/main/java/dev/codeless/api/export/`：`SourceExportController`、`SourceExportService`、`ExportArchive`（ZIP 写入器）、
  `ExportTemplate`（模板允许列表）、`ExportConfiguration`、`ExportFailure`。
- `versions/SnapshotStore`、`LocalVolumeSnapshotStore`：新增只读 `sourceBytes`（全量扫描后逐成员重读重哈希），+16 行，不改既有行为。
- `docs/generated-project-readme.md`：运行说明模板。`contracts/export/`：契约 README、清单 Schema、OpenAPI 片段（**共享 `openapi.v0.json` 未改**）。
- `tests/export/`：独立 ZIP 读取/校验、干净容器构建、命令记录器、契约测试、证据。
- 子项：D16-A-01 打包（Service/README 模板）；-02 允许列表排除（ExportTemplate 固定列表、写入前路径门禁、快照全量扫描）；
  -03 流式输出与路径/大小/权限校验（ExportArchive、StreamingResponseBody）；-04 清单哈希（Manifest）。

## 验证

| 命令 | 结果 |
| --- | --- |
| `node tests/export/record-command.mjs acceptance`（HEAD `f08616b`） | native 0，20/20，0 failure/error/skip：T1–T4 + 追溯 5 项真实 HTTP，单元 15 项 |
| `node tests/export/record-command.mjs regression` | native 0，24/24（Publication 7、LocalVolumeSnapshotStore 8、SharedSnapshotPermissions 4、VersionHttp 5） |
| `node tests/export/record-command.mjs contracts` | native 0，契约 4/4；私有组合 OpenAPI Redocly 有效，1 个 warning 与未改动的共享文件相同 |
| `node tests/export/record-command.mjs static` / `runner` / `e2e` | 各 native 0：static（契约 14/14、OpenAPI 有效、web 106/106、build）、runner 90/90、e2e 56/56 |
| `node tests/export/record-command.mjs gate` | **本机 native 1**：verify:api 252 项中 5 failure，全部为 `PreviewAcceptanceProcessTest`；在未修改的 base main `03c7905` 上同样 5 项失败（用例名相同），属既有 Windows 本机问题。远端 CI 以本 PR 最终 HEAD 为准 |

- T1：HTTP 下载的 ZIP 经独立 Node 读取器解包，在与构建镜像同摘要的全新 `node:24.16.0` 容器中
  `corepack pnpm@12.6.0 install --frozen-lockfile` + `run build` 成功（主机解包目录只读、无 `node_modules`）。
  进一步断言重建 `dist` 与冻结 `artifactDigest` 逐字节一致：本机构建镜像来自 Windows CRLF 检出，按镜像的 CRLF 呈现重建后
  `sha256:b8dbdd17…` 完全复现；JS bundle 在两种换行下本就相同。LF（Linux/CI）环境直接断言导出字节复现。
- T2：成员集合与允许列表完全相等；受信模板根中预置的 `.env`、`.npmrc`、`node_modules`、日志、`dist`、额外页面、私钥，
  同应用的 DRAFT/FAILED 版本标记、PG 与演示密码都不在包内；冻结快照中植入 `.env`/`node_modules`/日志时 503，移除后字节恢复一致。
- T3：匿名401、他人（ADMIN）404、不存在404、非 UUID 400、初始空壳/DRAFT/FAILED 409、无 CSRF 的 POST 403、PUT 405、
  编码穿越 400、注入 query 被忽略、源码或报告被篡改 503；拒绝全部为 JSON 且不含 ZIP 字节或秘密。
- T4：两次下载逐字节相同；清单 versionId/applicationId/number/buildId/source/artifact/report 与 D11/D15 记录一致；
  每个文件字节与摘要一致；VERSION_SOURCE 与 D11 `/files`、`/files/content` 逐字节相同；三个规范摘要重算一致；独立 Node 校验器 PASSED。

## 失败路径

权限（401/404，ADMIN 无旁路）、非法输入（400）、版本状态（409）、快照/报告/模板完整性与链接/junction/大小写别名（503）、
上限（成员 64、单文件 1 MiB、合计 4 MiB、ZIP 8 MiB）。所有输入在首字节前校验，失败不会产生部分 ZIP。

## 模型来源

确定性替身 `deterministic-mock`（每个生成任务 4 次 mock 请求）。PostgreSQL、Docker 构建、Chromium 验证、冻结快照、
HTTP 下载、干净容器安装构建均为真实执行。没有真实付费模型调用，不代表模型效果。

## 数据与配置

无迁移、无新依赖、无根锁/CI/共享 OpenAPI 修改。新增可选配置 `codeless.export.repository-root`
（环境变量 `CODELESS_EXPORT_REPOSITORY_ROOT`），默认等于 `codeless.agent.repository-root`，否则工作目录。
回退：撤销本 PR 即可，无持久化数据变化。

## 剩余事项

- 维护者：把 `contracts/export/openapi.patch.json` 登记到共享 OpenAPI，把 `tests/export/contracts.test.mjs` 加入 `scripts/run-static.mjs`。
- 当天集成：D16-B 下载按钮按 `contracts/export/README.md` 接入；公开地址 + 封面 + 源码包 + 版本记录的真实联调由最后启用 PR 完成。
- 已知限制：D11 报告未冻结构建时模板摘要；导出使用当前受控模板（清单如实记录 `templateDigest`）。

审查者：另一名成员；作者不自批。合并条件：最新 main 组合通过全部必需检查（ci-gate=success）、真实报告存在、无未解决阻塞讨论、同伴批准。
