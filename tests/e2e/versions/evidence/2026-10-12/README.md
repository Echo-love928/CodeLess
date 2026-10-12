# D11-B 2026-10-12证据

本卡适配A 4f364a3，原A实现提交保留；主分支未改。
commands.json记录本轮真实命令和失败；公共截图是明确契约fixture，非真实持久化面板成功。

- verify-static.log：最终65/65、lint/type/build成功；首次新RouterLink测试替身失败在原gate保留。
- verify-runner.log：原gate真实44/44成功。
- verify-e2e.log：原gate完整41/41，含修正后专项8/8及原runner/preview真实检查。
- fixture-before-report-wiring.log：首次路径适配8/8，早于失败报告/来源接线；最终验证以上一行完整gate为准。
- a-contracts.log：3/3；实际A报告来自A已提交证据，不伪造B新生成结果。
- real-panel-failure.json：真实A+B联调在原生成前置Docker EIO失败，新增panel断言没有到达。自有command/nonce确认来源，清理全部完成。

完整API/gate/显式IT原件及JUnit保留于本地忽略目录；API173项28failure/3error/0skip、aggregate exit1。
公开日志仅规范化行尾空白和EOF，原件未修改；commands中的aggregate/real日志hash指向私有原件，公开静态日志hash按UTF-8/LF规范化计算（sha256NormalizedLf），避免Git行尾转换改变校验输入。
没有模型质量证据。显式mock联调4请求、usage未知、paid0；开发tokens UNKNOWN。
剩余：真实UI联调EIO根因定位、全历史来源映射、公共OpenAPI维护者同步、另一人复审/批准。
