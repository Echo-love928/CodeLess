# D14-A 只读互审

2026-10-14，Asia/Shanghai。候选 PR41：`56cb4e93034d25cfa6bd1c3f25693c0c25841c3b`；
base `418290e631be05f7e478ce4d5b61624c4c19360d`。
使用 agent-reach 的 GitHub CLI 后端读取精确提交的源码、契约、测试及证据。
Git fetch PR41 失败（github.com:443 连接超时），未声称获得其 Git 对象；GitHub contents API 读取成功。
没有修改 A 分支、提交远端评论或批准。

## 阻塞问题

本次只读源码检查未发现新的功能阻塞。PR41 当前无独立批准；其新增恢复路由只有增量提案，
公共 OpenAPI 未登记。本卡 B 复用既有 component-edits/task/diagnostics/version 契约，不调用恢复写接口，
不擅自修改公共契约。最终启用/恢复功能维护者仍需登记与验证该路由。
读取 A 独立证据不能替代新 B UI 与 A 候选的实际组合运行；本地组合运行状态另列于 B 交接。

## 建议

- `tests/edit/verification/CONTRACT.md:47` 要求最终启用 PR 注册恢复接口；请将登记责任落实到公共契约维护者，
  与 B 的组件修改 UI 分开评估，不能将原生后台成功当作新增恢复 UI 已实现。
- 保留 A 原有 Windows DirectoryNotEmpty 清理失败和旧 runner OOM 失败；新 HEAD 的 CI 成功不证明其历史根因已解决。

## 已核验内容

- `VersionController.java:42` 的恢复入口闭合 expectedCurrentVersionId，规范 UUID、no-store/nosniff；
  身份/CSRF沿用公共安全链，测试确实覆盖 401/403/404、额外字段/简写 UUID 400。
- `VersionRestoreService.java:23` 同一应用行锁下核对 owner、ACTIVE、VERIFIED、expected 指针及 QUEUED/RUNNING，
  核对 SUCCEEDED/exit0/build digest、冻结源码/产物/浏览器 PASSED；只更新应用指针，不更新历史版本或发布。
- `EditVerificationIntegrationTest.java:145` T1 核验 DRAFT 不晋级、真实 VERIFY 后 READY，目标哈希改变、其他文件哈希不变，旧源码/快照保留。
- 同类 T2/T3 使用真实 TS1109 编译错误，原 action 保持、单轮修复、无进展停止、真实非零退出码，FAILED 不替换可用指针。
- 同类 T4 核验显式恢复后的原源码和最新历史快照均逐项相等，publication 行保持；旧/新真实签名预览及恢复后 edit 基准。
- 同类边界覆盖活动任务、并发 1胜/3冲突、损坏摘要503、缺快照409、归档应用及同指针no-op。
- 精确 HEAD 的六项 GitHub checks（run38516554041）读取时均 COMPLETED/SUCCESS，reviews=[]。
  PR 描述中的 ca51d70 runner 失败属于历史，不将它错写为当前 HEAD 失败。

复现：在 A 精确候选中 `node tests/edit/verification/record-command.mjs acceptance`；
查看 `verified/D14-A-T1..T4.json`、`restore-boundaries.json`、`restore-concurrency.json`。
本次通过 GitHub API逐字读取代码/原始 JSON，未把同伴报告当作自己的本地测试结果。

## B 本地组合验证

随后在独立 `.local-data/d14-ab-integration` 应用 A 精确候选的文本源码补丁，叠加 B 源码候选
`a40af3f30cc35ba37f59f12f29bbec021d09dd6c`；8个改变的UI/单测文件逐字节相等。
`node tests/e2e/visual-edit/record-command.mjs integration` **native exit0**，
EditVerificationIntegrationTest 7/7 + PreviewPlatformIntegrationTest 1/1，0 failure/error/skip，BUILD SUCCESS。
组合树中的每个改动/新增文件SHA256、A/B来源及命令在本卡 evidence 的 ab-integration/command.json。
这次本地结果才是本人的真实组合验收；不替代B远端必需检查或同伴正式批准。
