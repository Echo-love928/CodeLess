# M1真实付费验收：预算停止，未通过

执行候选：`4ebf0bb1fc641a18f3c72a113e4067dd7d917605`。日期：2026-10-10，Asia/Shanghai。任务：`45d37a80-c152-4672-9c0c-1fcf425fa014`。本目录只记录已执行的单个真实付费任务，不修改生产代码；失败与未知保持原值。

- `M1-run-record.md`：一段式最终结果及A整改事项。
- `acceptance.json`、`source/`：实际模型回复、冻结候选及真实构建结果；只有一个失败候选，没有真实修复补丁。
- `event-replay.json`、`BudgetReplay.java`、`budget-replay.json`：公开合成数据的离线预算重放，零模型调用。
- `runtime-verification.json`：实际SQL终态、用量、失败路径及截图缺失边界。
- `commands.json`、`logs/`：各次命令、真实退出码、私有原日志摘要及脱敏副本。第一次准备exit1未覆盖。
- 三层cleanup及process回执：浏览器/runtime/Job完成，compose down0，可信项目资源remaining0；不使用全局进程或容器清理。
- `historical-preservation.json`、`manifest.json`、`credential-scan.json`：旧证据完整性、新证据字节摘要、当前密钥精确匹配检查。

## 停止原因与整改位置

`services/api/src/main/java/dev/codeless/api/agent/AgentLoop.java:92/100/113`累计保留每次工具观察；本次REPAIR有4个读取，其中3次相同HomePage/相同digest。`AgentModel.java:32`调用`RuntimeBudget.inputReservation`，在送出模型请求之前将policy/input的UTF-8字节数、512 framing与4096最大输出一起预留；`AgentRunStore.java:53`正确拒绝总预留超出50,000。生产策略正确停止，不能因实测仅31,596而断言预算实现错误。本次第11次请求需18,720，余额18,404；原4次REPAIR预留分别12,332/13,962/15,458/17,089，Java逐项精确匹配。模型为何重复读取的内部原因仍UNKNOWN，尚未验证某一种新提示或整理算法能完成真实修复。

A整改建议：改善工具观察的文件归属、重复未变内容和累计上下文；让读取依赖后能提出带真实expectedDigest的最小files.update和原actions的done。保留完整原journal，并对预算边界、缺usage保守预留及无进展停止做离线录制回归；在原上限不变的条件下验证修复闭环。不能把本次合法tool回复证明为真实协议问题已永久消除。

## 不付费复现

在包含候选4ebf0bb的工作树中，使用Java21和已锁定依赖编译测试入口（`services/api/mvnw.cmd -f services/api/pom.xml -DskipTests test-compile`）。取已有本次JUnit XML中的`java.class.path`，执行`java -cp <该classpath> docs/evidence/D10/M1/45d37a80-c152-4672-9c0c-1fcf425fa014/BudgetReplay.java docs/evidence/D10/M1/45d37a80-c152-4672-9c0c-1fcf425fa014/event-replay.json <新的输出文件>`。它调用实际RuntimeBudget及FileToolRegistry，只读事件与classpath资源；4个已接受预留必须精确相同，并断言10请求/13工具/31,596计量及下一预留超过预算。预期exit0，`rejectedBeforeProvider=true`。修改源码后的新结果须单独保存，不能覆盖这里原始实测摘要。

完整付费入口是`services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealRepairPreviewPlatformAcceptanceIT -DreuseForks=false -DforkCount=1 test`，本次已执行且exit1；本说明不授权再次执行。默认CI不会发现该IT，也不设置CODELESS_M1_REAL_APPROVED。

## 门禁和合并边界

执行候选4ebf0bb原Windows重定向ci-gate exit0、远端六项success。它们不证明M1通过。本次证据提交的新HEAD必须独立核对远端结果，不继承旧SHA的成功标签。真实付费M1失败保留，PR维持草稿，未批准、未合并。旧模型协议/TLS/504/TCP/cleanup/exit137等事件按原证据保持，不由一次传输或清理成功关闭。
