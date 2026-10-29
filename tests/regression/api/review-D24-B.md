# D24-B 只读互审

对象：[PR #78](https://github.com/Echo-love928/CodeLess/pull/78)，固定 `b98c02314c77736965cecabaa1df728dfb6c0222`，base/main `5a0f14d`。未修改 B 分支、原 apps/web、runner、公共契约或业务断言。

## 阻塞问题

本次检查范围未发现需阻塞 B 生产修复的具体问题。PR 尚为草稿；B 文档中的本地完整 gate 为 RUNNING，不将它推断为本地成功。远端精确 b98c023 的六个检查已读回 completed/success；它们不替代 A 的检查、真实模型验收或 A+B 组合验收。

## 建议

- `docs/handoffs/D24-B.md:30-36` 和 PR 正文完成后补实际本地门禁及新的 A 候选，保留原失败。现有 RUNNING/“无 A PR”是撰写时状态，不能用远端 success 回填本地结果。
- `apps/web/src/features/preview/PreviewPanel.test.ts:95,118`：可在测试清理中无条件 unmount，避免红色断言提前返回时残留 window listener。当前两项仍稳定暴露原缺陷，未发现该清理问题导致假绿，非阻塞建议。

## 已核验内容

- 生产差异仅 `PreviewPanel.vue:66-78`，在版本读取 Promise 之前调用既有 dispose：generation 递增、取消旧请求和两种定时器、清空旧 credential。`message:53-62` 先检查凭据、origin 和 contentWindow；清空凭据后旧 loaded 消息无法重置ready。旧到期定时器已清除，不能覆盖新loading。
- watch/异步generation检查保持，晚到的旧版本响应和旧refresh异常不能移除新frame；sandbox/referrerpolicy、15秒加载超时和unavailable错误分支未放宽。没有增加API/runner权限、秘密、任意网络或依赖。
- 作者的两个新增反例先红后绿日志已读。本人独立把同一测试blob（SHA256 `d18eb05d01d8b4ee4019afe4b24f3a37fd70ddb78f1bdd8c0afbd1843e1cc1b6`）放入基线前端私有副本，仅切换被测组件：旧组件6/8、native1；B组件8/8、native0。命令与字节摘要在 `evidence/peer-b98c023-2026-10-29T02-40-55.843Z/`。模型/凭据API为Mock，环境为jsdom，不冒充真实浏览器。
- 六项文件差异和精确检查源记录在 `evidence/peer-pr.json`。API契约没有差异；A的128 KiB输入限制不影响这些小体积凭据请求；真实A+B组合仍由最后启用PR执行。

独立复测的两次准备失败均保留：首次 pnpm 在junction处自举依赖失败，第二次直接CLI发现该自举影响了指向原workspace的依赖链接，测试均未开始。随后根目录 `corepack pnpm install --offline --frozen-lockfile` 恢复锁定链接，直接require验证成功，源码/锁文件无差异，才取得上述真实6/8→8/8结果。没有改 B 测试、替换断言或把准备失败覆盖成通过。

给 B 的交接：本卡无HTTP结构/错误码变化，超大请求使用现有400；A候选与门禁见D24-A最新节。旧D21模型与D23运营启用仍按原交接，不凭本卡互审解除。此文件是审查结论，GitHub正式批准状态须以独立review回执为准。
