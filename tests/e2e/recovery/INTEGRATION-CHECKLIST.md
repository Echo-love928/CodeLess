# D18 最后启用 PR 的真实后端断言

D18-B审查建议4的验收约束；A候选 `da842a681594bfbfaf78ea7ef478d95a8e0474d3` / PR54，B以最后启用候选HEAD为准。
本清单不是已执行结果；不能用fixture、其他机器、旧候选的检查替代真实组合验收。

1. 使用真实Spring/PostgreSQL与不可变版本卷，启动A+B组合构建；浏览器与HTTP均不得拦截任务、版本、snapshot接口。可使用显式deterministic-mock阶段，不调用真实模型。
2. 对同一所有者应用准备旧VERIFIED版本和当前DRAFT候选，当前任务处于非终态。分别覆盖进程强杀重启后的INTERRUPTED和重复取消后的CANCELLED。
3. 等待真实服务端收敛后，核对task.status=FAILED、原失败码、恰1条TASK_FAILED；DRAFT候选同事务变为FAILED。旧latestReadyVersionId/预览版本、已发布引用和旧成功URL不变；不能重新发布或创建新生成任务。
4. 通过真实GET版本列表与snapshot核对：冻结报告failureCode为INTERRUPTED/CANCELLED；未发生的buildStatus/exitCode/verificationStatus应为null，不能伪造退出0。
5. 在生产Vue版本记录的确切候选行断言：`验证失败`、`INTERRUPTED`（取消则`CANCELLED`）、`构建 结果未知；退出码 未知`、`浏览器验证 结果未知`。不能显示该候选已通过/当前可用，不能只检查JSON或另一条历史版本。刷新后文案和任务终态仍一致。
6. 保留真实命令/退出码、组合A/B源摘要、task/version/build关联、SQL与snapshot响应、UI截图及清理记录。再重启一次，断言不会多写失败事件或改变终态；失败门禁及缺失证据必须留在交接中。

取消幂等不是无条件重新执行任意动作的许可：只能重试同一任务取消；生成未知提交和发布未知提交继续保留原key/绑定。
