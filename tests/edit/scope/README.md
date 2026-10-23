# D13-A 局部修改范围验收

仓库根执行固定命令，不更改 D01 锁定版本：

```powershell
. ./.local-data/d07-a/env.ps1
node tests/edit/scope/record-command.mjs acceptance
node tests/edit/scope/record-command.mjs gate
node tests/edit/scope/export-evidence.mjs
```

`acceptance` 实际执行 `LocalEditScopeIntegrationTest,LocalEditScopeTest`；Maven 默认 API 门禁也自动发现它们。
`gate` 原样执行根 ci-gate，串行运行 pnpm verify:static/api/runner/e2e。
记录器清除真实模型凭据和浏览器 channel，锁定 deterministic-mock 和已有 Chromium。
无开发环境 env.ps1 时按 docs/environment.md 配置锁定的 Java21/Maven3.9.11/Node24.22.1/pnpm12.6.0。
需要真实 Docker/PostgreSQL/Chromium；缺失直接失败，没有空脚本、skip 或替代构建。

T1：真实 HTTP 拒绝未知 componentId、客户端 sourceFile、版本错配和摘要错配，数据库任务数不变。
T2：明确命名 scope mock 提议写 package.json，执行器拒绝且文件工具结果数不增加。
T3：跨文件 update/read 和 scopeExpansion 都终止失败；保存明确原因，不自动扩大权限。
T4：目标文案 Ada→Hedy 和 scoped CSS 更新形成新 DRAFT，两个非目标文件 SHA256 不变，
真实 Vue 生产构建和 Chromium 断言后才能 READY，基快照不变、publication 数为0。

额外验证 GENERATE/REPAIR 的跨文件 read/update/create/delete、直接 FileToolService 调用、
最终快照完整文件集合和非目标摘要、持久元数据不能重映射可信 component、父组件只得到依赖元数据。
REPAIR 范围用例的 VERIFY 失败为明确 fixture，仅证明范围拒绝，不证明真实失败构建修复。
正常修改与初始基版本的验证都是真实执行。源注释、日志、页面内容及模型解释是数据，不能授予权限。

raw log 留在 .local-data 私有目录；公开 commands.json 保留原生 exit/signal、log SHA 和摘要。
输出各轮账本单列模型请求数，31/17/48 为明确合成 fixture 计数，实际 provider tokens UNKNOWN。
模型 mock 不证明真实模型质量。失败轮不会抹除；导出器拒绝 RUNNING 或日志摘要错配。

接口沿用 contracts/mapping/component-edit.schema.json；无公共闭合 body 字段变化。
任务创建及 GET task/edit 新增响应头 `X-CodeLess-Edit-Scope: SOURCE_FILE`、
`X-CodeLess-Edit-Shared: true`、`X-CodeLess-Edit-Notice: ALL_INSTANCES_OF_SELECTED_SOURCE_FILE`。
D13-B 可以继续使用已存在的 selected.shared/notice，不需依赖新增头；公共 OpenAPI 登记由维护者另行处理。

组件 PLAN 复用原版本 task 的持久已校验 plan，并复核与真实基源码文件集合一致，模型不重规划页面。
如果旧版本原 journal 不可读，任务明确失败，不猜测计划、不从其他工作区回填。
GENERATE/REPAIR 模型只见目标正文（基版本）、导入路径/digest/bytes 摘要、需求与验证诊断；
REPAIR 当前目标摘要/观察结果另列，需读当前内容时只允许 files.read 目标文件。
依赖摘要用有界静态 import 提示识别（含可能的注释），不做 AST 编辑或依赖图推断，绝不授予依赖读写权限。

D13-B续审unit9/9、真实浏览器3/3；A/B私有组合真实联调12/12，见review-D13-B.md及evidence/2026-10-14。
组合复现：record-command.mjs integration --repo .local-data/d13-a/integration-8352-038b，要求显式无冲突MERGE_HEAD，记录父候选和indexTree。
它不修改任务分支；正式启用仍由维护者整合并对新HEAD重新检查批准。
