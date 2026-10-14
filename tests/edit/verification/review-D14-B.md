# D14-B 只读互审

2026-10-14。PR [#42](https://github.com/Echo-love928/CodeLess/pull/42)，精确候选
`59ed05b33f7f2dd8f54d5caf70da2fa302db69a2`，base `418290e`。
独立 detached 工作树 `.local-data/d14-a/review-b-59ed`；B源码/测试未修改，测试后跟踪工作区仍干净。
初交付时B尚无候选属于56cb4e9历史；本次已读取实际PR差异、交接、契约边界和全部报告。

## 阻塞问题

未发现B候选的新功能阻塞。A恢复路由公共登记由A本轮用户授权在PR41负责，
不再要求B修改公共OpenAPI；B不调用restore写接口。最终启用仍须整合已审A/B、核对最终head与审批，
本次批准独立B候选不等于批准组合候选或合并。

## 建议

- 保留UI fixture与真实平台报告的区分，以及历史Windows DirectoryNotEmpty和旧OOM失败，
  当前CI成功不能证明这些底层原因已修复。最后启用PR继续核对确切版本、旧版本留存和公共登记。
- ab-integration/command.json的旧versions三文件是CRLF摘要，其余五个UI文件是LF摘要。
  首次直接Git blob比对出现三项不同；分别重算后8项源码内容一致。建议后续manifest记录EOL变体，
  便于跨平台逐字节复核；没有发现非换行的源码差异，不阻塞本候选。

## 已核验内容

- VisualComponentEditor.vue:31/42/68：可信映射选取、显式共享影响确认，闭合三字段selection，
  不发送路径/实例权限/发布字段；模糊网络失败只允许用户显式重试并保留幂等键。
- edit-flow.ts:36/46/51、version-api.ts:32：READY、成功build/exit0、同taskId/buildId的
  VERIFIED版本唯一匹配才adopt；未知状态、错配、缺构建及读取错误保持旧预览，迟到回调被epoch隔离。
- VersionWorkspace.vue:24/56/61及VisualEditSelector.vue:19/26/34：工作台持有任务生命周期；
  新预览重建iframe/nonce/mapping并清空旧选择；失败可继续旧导航、再选择、再确认及修改。
- flow.spec.ts:11/56/83：四类文案/颜色/间距/共享实例作用范围、连续四个新version/digest、
  FAILED旧页导航和再次修改、脚本日志文本转义、409不自动重试、FUTURE不晋级。
- tests/runner/mapping/platform-checks.mjs:24仅增加一次共享确认；全部原HTTP/源码/hash/预览断言保留。
  没有后端、runner生产、模板、公共契约、锁、CI或迁移变更；未发现秘密或测试削弱。

独立复现（工作树内，固定Node24.16.0/pnpm12.6.0与bundled Chromium）：

| 命令 | 原生结果 |
| --- | --- |
| node tests/e2e/visual-edit/record-command.mjs unit | exit0，26/26 |
| node tests/e2e/visual-edit/record-command.mjs static | exit0，契约11/UI89/lint/typecheck/生产build |
| node tests/e2e/visual-edit/record-command.mjs browser | 构建后exit0，Chromium6/6、0失败/跳过；含四类与原selector边界 |

首轮browser退出1：新工作树尚无dist，webServer未启动、实际测试未执行；补齐必需生产构建后才运行，
未修改断言、重试次数或隔离。相对env路径查找失败后改用现有绝对env入口；按锁offline安装331包，下载0。
自己的成功截图已视觉核验共享文案、红色/间距、确切版本和旧选择清理。

已重算B公开29份artifact摘要；B提交的A56/Ba40组合报告8/8与源码、M2 JSON、截图一致，
实际API/Postgres/Docker/Vue/Chromium及旧selection拒绝均明确记录；这是B提交的真实报告，
本轮没有再次运行该8项Java组合，不把它写成我的独立执行。a40→59ed的运行时代码/测试没有变化。

59ed精确六项CI（static/api/runner/e2e/infra-preflight/ci-gate）均SUCCESS，
[run38534305689](https://github.com/Echo-love928/CodeLess/actions/runs/38534305689)。
独立复测日志/hash、初次未执行失败与本轮CI保存在 evidence/2026-10-14/review-registration/。
正式审查结果/URL由review-result.json记录；不自批A、不合并或发布。
