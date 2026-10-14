# D13 整合验收

2026-10-14，Asia/Shanghai。**本地功能验收与四阶段门禁通过**。真实 A/B 联调完成；本分支作为最终启用候选，仍需针对新的 HEAD 独立审查和远端必需检查。没有修改或推送 main，没有自批、合并或发布。

## 候选与范围

- 分支：`codex/d13-integration-acceptance`；独立工作树 `.local-data/d13-integration`。
- main 基线：`37755c43a7f34b1b90b1e5b8dd877ea516580a74`，通过 GitHub API 核验。
- D13-A：[PR38](https://github.com/Echo-love928/CodeLess/pull/38)，`5f951f63367d7d8d6f47ab1af7c39c00775e7270`，Echo-love928 对此提交 APPROVED。
- D13-B：[PR39](https://github.com/Echo-love928/CodeLess/pull/39)，`038b6c17ea41b0b194fde4075860c4fdeeec89b2`，yuanqizuimeng 对此提交 APPROVED。
- 无冲突合入两份已核验提交；完整本地门禁测试 HEAD：`fa8c8edb5ac04b7d6e50e53df267a2e736ebffb7`。启动时生产源码与测试均无未提交修改；没有同工作树并发 Maven/E2E。
- 此次没有新增运行时代码、公共契约、依赖、根锁、CI 或迁移修改；合入既有 A/B 实现后，仅增加本交接及独立验收证据。后续交付提交不冒称为本地原始测试 HEAD。
- 本地已有精确提交对象；本次 Git fetch 网络失败后，通过 GitHub API 核对远端 SHA 再使用这些对象，未声称 fetch 成功。原 A/B 分支、main 和原有 `.idea/` 均保留。

## 本卡验收

| 要求 | 本轮实际结果 | 证据 / 复现位置 |
| --- | --- | --- |
| A-01 / A-T1 可信选择 | 未知 componentId 409、额外 sourceFile 400、旧 versionId 409、错 sourceDigest 409；真实 HTTP/Postgres 任务数 1→1。 | `D13-A-T1.json`；LocalEditScopeIntegrationTest 的 T1 |
| A-02 局部上下文 | 模型仅接收一个目标正文及有界依赖摘要，依赖正文未提供；PLAN/REPAIR 不扩大文件权限。 | `dependency-context.json`、`D13-A-T4.json`；LocalEditScopeIntegrationTest / LocalEditScopeTest |
| A-03 / A-T2 受保护文件 | package.json 的修改在工具执行前被拒，未增加 tool.result。 | `D13-A-T2.json`、`protected-GENERATE.json` |
| A-03 / A-T3 范围限制 | GENERATE/REPAIR 跨文件 read/update、create/delete、scopeExpansion 均明确失败；底层工具及非目标哈希篡改也被拒。 | `D13-A-T3.json`、`*-REPAIR.json`、`defense-in-depth.json` |
| A-04 / A-T4 作用范围与正常修改 | 文案 Ada→Hedy 及 scoped CSS 创建新 READY 草稿；ProfileCard.vue 哈希改变，HomePage.vue 与 Unrelated.ts 哈希逐项相等，旧版本保持，publication=0。 | `D13-A-T4.json`、`integration-audit.json` |
| B-01 / B-T1 嵌套选择 | 真实浏览器悬停高亮，点击嵌套 strong 定位最近组件根；取消选择可用。 | `tests/e2e/selector/flow.spec.ts`，本轮 E2E 摘要 |
| B-02/03 / B-T2 受控通信 | 双方精确 origin、WindowProxy source、闭合 schema、nonce、version/digest 校验；真实同 origin 兄弟窗口、错误 nonce、过期版本与旧会话重放均拒绝。 | 同文件第三项；static 包含 selector-session 单测 |
| B-01/04 / B-T3 普通预览 | 编辑态阻止原点击行为；取消与双方 Esc 退出后恢复 hash 导航。 | 同文件第一项 |
| B-04 / B-T4 共享提示 | 第 2/3 实例映射同一源码，提示影响整个源码组件及跨页面共享实例；桌面及手机布局可见，无水平溢出。 | `T4-shared.png`、`T4-shared-mobile.png`；同文件第二项 |
| 当天真实 A/B 联调 | 登录/CSRF→真实跨源预览点击→可信源文件与共享提示→提交三字段 selection→局部 executor→真实 Docker/Vue/Chromium→新 READY→旧源码保留。 | `component-platform.json`、`component-edit-platform.png`、PreviewPlatformIntegrationTest |

上述 JSON/日志/截图均在 [final-integration](../../tests/edit/scope/evidence/2026-10-14/final-integration/)；`artifact-digests.json`记录逐文件 SHA256。选择器专测使用明确 API fixture；真实平台联调没有拦截 API 或伪造 postMessage。REPAIR 范围反例使用显式 VERIFY 故障 fixture，只证明权限阻断；正常 A-T4 与平台联调均真实执行数据库、构建与浏览器。

真实平台报告确认请求 `selection` 只有 `componentId/versionId/sourceDigest`，不包含浏览器路径或实例权限。API 服务端解析 `src/components/ProfileCard.vue`；新版本预览显示 Hedy Lamarr。旧请求针对新版本返回 `VERSION_MISMATCH`，旧源码内容逐字节保留。审计从实际前后 mapping 再次核验 ProfileCard.vue 改变、HomePage.vue 不变；A-T4 的完整源清单另核验 Unrelated.ts 不变。

## 门禁与失败历史

固定复现命令（仓库根目录，Java 21、Node 24.16.0、corepack/pnpm 12.6.0；嵌套命令 PATH 同样固定）：

```powershell
corepack pnpm install --frozen-lockfile --offline
node tests/edit/scope/record-command.mjs gate
```

本机采用既有 `.local-data/d13-b/bin` corepack shim 与 `E:/nodejs`，JAVA_HOME 为 `C:/Program Files/Java/jdk-21.0.12.1`。依赖从本地缓存按锁安装，下载数 0，版本未变。Docker Desktop 真实运行；浏览器为锁定的 bundled Chromium。不要在同目录并发运行专项或使用需要未提交 MERGE_HEAD 的记录器 `integration` 模式；本轮使用有效的 `gate` 模式。

| 阶段 | 最终完整轮结果 |
| --- | --- |
| verify:static | 退出 0；契约 11/11、前端 72/72，lint/typecheck/生产构建通过 |
| verify:api | 退出 0；203/203，0 failure/error/skip；D13-A 8+3、编辑生命周期 15、真实 repair 21、平台预览 1 均通过 |
| verify:runner | 退出 0；69/69、0 fail/skip；真实容器与浏览器检查 |
| verify:e2e | 退出 0；45/45，含选择器 3 项及历史失败的登录回归 |
| ci-gate | 原生退出 0、signal=null、完成标记 verified，`all stages passed` |

完整轮开始 `2026-10-14T03:17:05.624Z`，结束 `03:41:52.119Z`；原始日志 SHA256：
`08ef51bcdc757c7f79242c53b8b8be3a81a72c961ac98688d3e240d8e3682a6f`。
原件：`.local-data/d13-a/runs/2026-10-14T03-17-05.445Z-gate-1cd3eab2-b762-4c47-a5e6-8324eadd236a/command.log`。
`commands.json`逐轮记录原生退出码、HEAD、时间、完成标记、摘要及原件路径；`gate-results.json`给出本轮计数。

本次前两轮门禁均原生退出 1，未启动任何测试：03:15:03Z 因沙箱不允许写 pnpm 的 AppData 存储锁；03:15:42Z 获权后发现 pnpm 拒绝 junction hoist 目录。仅移除已核验的两个依赖 junction，再按冻结锁从本地缓存安装实际依赖目录，之后运行上述完整轮。两份失败日志/摘要与原生退出码均保留，没有改断言、timeout、隔离或跳过检查。既有 A 并发污染、B Windows 登录失败等历史也继续保留在原交接/证据中；本轮通过不证明历史未知根因已修复。

门禁自动更新的 8 张 D10/版本旧截图，已完整备份 `.local-data/d13-acceptance/generated-gate-evidence/` 后恢复跟踪原件；本交付只增加本轮独立证据。已目视核验真实新预览、桌面和手机作用范围截图。

## 审查与合并状态

阻塞问题：本轮没有发现 D13 功能或门禁阻塞。建议：A 的记录器在启动前校验失败时可能遗留锁，已有 [PR38 非阻塞讨论](https://github.com/Echo-love928/CodeLess/pull/38#discussion_r4266347101)，本次未改动该工具。该讨论当前仍未解决，合并前由作者/维护者处理。

已核验内容：A/B 精确提交均有另一人批准，各自六项 CI success；见 `peer-status.json` 和 `peer-discussions.json`。这些批准与 CI 不覆盖新的整合 HEAD。最终整合 PR 保持草稿；它的远端检查结果与新 HEAD 审查以 PR 实时状态为准，不能继承单独 A/B 的结果。需要新候选独立批准、当前 main 同步、必需检查全部 success 且无未解决讨论后才具备合并条件；本任务不执行合并或发布。

## 用量与限制

开发 input/output/total tokens：UNKNOWN，计量来源未知。本轮 D13-A 专项 SQL 账本：deterministic-mock 21 请求、付费模型请求 0，实际 input/output tokens UNKNOWN；31/17/48 是每次合成 fixture 计数。整个 API 的其他 mock 请求总数 UNKNOWN，不能以 21 代替整体累计。选择器 fixture 专测模型请求 0。真实模型效果未评测，不用 mock 结果证明模型质量，也不混入开发 token 账。
