# D16-A 源码导出验收工具

契约见 [contracts/export/README.md](../../contracts/export/README.md)。本目录只含开发/验收工具，平台 API 不调用它们，
也不提供 shell 或任意命令能力。

| 文件 | 作用 |
| --- | --- |
| `record-command.mjs` | 固定命令记录器：`unit`、`acceptance`、`regression`、`contracts`、`static`、`api`、`runner`、`e2e`、`gate`。记录原生 exit/signal、HEAD、未提交范围文件摘要、原始日志摘要和 JUnit；固定 deterministic-mock，移除模型 key/name 与外部浏览器 channel；同仓库串行锁。输出在 `.local-data/d16-a/runs/`。 |
| `zip-reader.mjs` | 与 Java 写入器无共享代码的独立 ZIP 读取/解包：核对本地与中央目录、CRC、大小、连续性，拒绝加密、data descriptor 和越界路径。 |
| `verify-export.mjs` | 独立 T2/T4 校验：单一根目录、0644 Unix 普通文件、允许列表/禁止路径、清单与成员逐字节一致、重算 `contentDigest`/`sourceDigest`/`templateDigest`、可选期望版本与摘要、禁止字符串。 |
| `clean-build.mjs` | T1：独立解包后，在与构建镜像同摘要的全新 `node:24.16.0` 容器中按锁文件 `--frozen-lockfile` 安装并构建；主机解包目录只读挂载、不产生 `node_modules`；记录 `dist` 摘要并与冻结产物对比。退出码区分两种结果：0 构建成功（指定 `--expect-artifact-digest` 时还须逐字节复现），3 构建成功但未复现，1 构建失败；`reproduction` 字段为 `REPRODUCED` / `NOT_REPRODUCED` / `NOT_REQUESTED`。`--crlf-template-diagnostic` 仅用于解释 Windows 检出构建的镜像，不是验收模式。 |
| `contracts.test.mjs` / `validate-contract.mjs` | 契约测试与私有组合 OpenAPI 的 Redocly lint；共享 `openapi.v0.json` 不改。 |
| `export-evidence.mjs` | 把最新 PASSED 验收轮次的公开报告复制到 `evidence/<日期>/`，`commands.json` 保留全部轮次（含失败）。 |

## 复现

```powershell
. ./.local-data/d07-a/env.ps1
node tests/export/record-command.mjs acceptance   # 真实 PG / Docker 构建 / Chromium / HTTP 下载 / 干净容器构建
node tests/export/record-command.mjs regression   # 受 SnapshotStore 变化影响的既有版本与发布套件
node tests/export/record-command.mjs contracts
node tests/export/export-evidence.mjs 2026-10-19
```

单独复核公开证据中的导出包（只读；第二条需要 Docker 与 npm registry）：

```bash
node tests/export/verify-export.mjs tests/export/evidence/2026-10-19/export-<versionId>.zip
node tests/export/clean-build.mjs tests/export/evidence/2026-10-19/export-<versionId>.zip .local-data/d16-a/rebuild
```

`SourceExportIntegrationTest` 在 `verify:api` 中运行，需要 Docker 和 npm registry 访问（与既有构建镜像准备相同）。
`tests/export/contracts.test.mjs` 尚未登记进 `scripts/run-static.mjs`；这属于维护者在最后启用 PR 中的登记工作。
