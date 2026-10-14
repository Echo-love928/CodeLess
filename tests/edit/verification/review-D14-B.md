# D14-B 只读审查记录

2026-10-14，Asia/Tokyo。实际 GitHub API `pulls?state=all&per_page=25` 的最新 PR 为 D13 整合 #40；
`git ls-remote --heads origin '*d14*'` 尚无 D14 候选。本记录不是对未提供代码的批准或缺陷断言。

## 阻塞问题

没有 D14-B PR、契约差异和测试报告，无法审查“四类修改/失败旧版本操作/连续修改过期映射/核心交互”
的新实现，无法完成当天最终 M2 联调。需 B 或最终启用 PR 提供精确 head/base 及真实报告。

## 建议

- 使用现有 D13 selection 三字段与 SOURCE_FILE/shared 范围；不可发送路径、实例权限或自动扩大范围。
- 失败后继续引用 application.latestReadyVersionId；FAILED/DRAFT 不可用，错误和未知退出码原样显示。
- 成功或恢复后重新读取版本对应 sidecar，重建 selector 会话；旧 selection/version/digest 应被拒绝，
  不自动 rebase/retry。四类修改需要分别展示真实作用范围并复测核心交互。
- 恢复时显式 POST restore + expectedCurrentVersionId；409 保留用户操作并提示刷新核对。
  latestReadyVersionId 在恢复后是当前预览/下次编辑基版本；历史发布仍指向原版本，禁止自动发布。
- 最终启用维护者按本卡 additive patch 登记共享 OpenAPI，真实测新版本与恢复后的签名预览。

## 已核验内容

只读读取 D13-B 与 D13 整合交接、mapping/edit/version 契约，核对既有选择器精确 origin/source/nonce/
version/digest 校验及 D13 真实联调记录。A 新测试使用真实 component edit HTTP、Postgres、Docker/Vue/
Chromium，并复用真实签名预览验证恢复后旧源码与新历史版本仍可浏览。
这些内容仅证明 A 和已合入 D13 的边界，不替代 D14-B 新 UI 验收。没有修改 B 模块或进行正式批准。

复现：`node tests/edit/verification/record-command.mjs gate` 自动发现本卡 7 项、D13 局部范围、
D12 编辑生命周期、D10 修复及 PreviewPlatformIntegrationTest；本轮完成结果见 D14-A 交接和 commands.json。
