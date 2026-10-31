# D26-A 限定回归

## B 复审后的独立修复

后续分支 `codex/d26-a-cleanup-followup` 基于 PR88 最终 `6ceeb5a`，不覆盖下方历史结果。两份 runner 文件是为复现截图清理失败而进行的最小跨模块扩展；没有修改公共契约、依赖、隔离、超时或原断言。PR89 的 signal/cleanupProof 诊断仍是独立依赖，不把诊断 PR 当修复。

```powershell
node tests/regression/release-api/record.mjs followup
node tests/regression/release-api/freeze.mjs check
node tests/regression/release-api/freeze.mjs check-raw
node tests/regression/release-api/restore-runtime-bytes.mjs
node tests/regression/release-api/record.mjs screenshot-diagnostic
node tests/regression/release-api/record.mjs cover-boundaries
node tests/regression/release-api/record.mjs runner
node tests/regression/release-api/record.mjs e2e
```

`check-raw` 保留旧快照逐字节检查，正常 Git 换行转换也可能失败。`check` 附加核验固定 PR88 Git blob，只接受登记的 LF/CRLF 检出形式，输出所有差异；运行时提示词和原七份失败记录始终要求原始字节。四份混合换行原件、摘要和原机 runner 完整阶段日志见 `evidence/followup-2026-10-31/`。不得重新 capture 旧冻结以消除差异。

B 已提供的报告精确核对在 `peer-byte-verification.json`：四份均为上述 CRLF 形式，另两份提示词 `generate-v1.txt` / `repair-v1.txt` 发生了 CRLF 检出变化。`restore-runtime-bytes.mjs` 默认只读；明确执行 `--write` 时，只对这两份与已知 CRLF 摘要完全相符的文件备份并恢复固定 Git blob，恢复后必须匹配原 raw 冻结；遇到未知内容先拒绝整组操作。它不修改 Git 提交、提示词内容或冻结快照，之后重新执行 `freeze.mjs check`。不要将原生失败改写成成功。

`screenshot-diagnostic` 从固定 PR89 `30a2474` 提取未经修改的七项截图验收并校验摘要；结束后只删除本次新建且未变的临时副本。它不修改 PR89 原断言。完整 runner/E2E 默认不启用进程观察器；两次旧诊断运行受观察器 overload 缺陷干扰，原退出保留且不能作为生产根因证据，详见 `observer-interference.json`。

真实许可边界回归使用独立 stdio worker 和真实 Chromium、明确命名的无公网传输 fixture；不证明公网生产 capture 成功。整体发布仍 HOLD，完整状态见交接中的后续补记。

当前结论 **HOLD**。平台代码候选 `3286dd3`，基线 `df6822e`；全部命令、原生退出和证据边界见 `docs/handoffs/D26-A.md`。原完整 ci-gate=1，runner276/285；独立映射15/15不替代失败门禁。

从仓库根执行（锁定Node24.22.1、pnpm12.6.0、Java21、Maven3.9.11，需真实Docker与已锁定Chromium）：

```text
node tests/regression/release-api/freeze.mjs check
node tests/regression/release-api/record.mjs boundaries
node tests/regression/release-api/record.mjs cover-green
node tests/regression/release-api/record.mjs affected
node tests/regression/release-api/record.mjs gate
```

记录器仅开放固定命令，剥离模型凭据、使用deterministic-mock；真实数据库/工具/Docker/Vue/Chromium由原测试执行。`static`复验原静态入口；`mapping-diagnostic`仅诊断原映射入口，不能登记完整runner成功。完整日志和JUnit XML在 `.local-data/d26-a/commands/<时间戳>/`，公开回执提供SHA256和原生结果。`evidence/**`按原字节存储，失败日志空白不改写。

复现代码修复前失败：在独立检出 `df6822e` 中只加入 `3286dd3` 的 `services/api/src/test/java/dev/codeless/api/cover/D26CoverCoordinatorTest.java`，运行 `services/api/mvnw.cmd -f services/api/pom.xml -Dtest=D26CoverCoordinatorTest test`（非Windows使用mvnw）。原结果是3项中1失败，cursor.json不应存在却存在，见 **`2026-10-31T10-22-15.092Z-cover-red`**。在修复后的源码执行同一测试为3/3；记录器的`cover-red`模式只选择测试，不自动切换源码，必须核对回执HEAD和源摘要。

冻结检查使用当前工作区实际文件字节，并包含全部契约（含OpenAPI外部封面schema）和API执行适配器；这是本机执行快照。跨平台换行差异应按Git blob及实际运行时字节核查后重新审查冻结，不能手改摘要将未知变化登记为成功。204文件最终冻结、140文件原代码候选冻结和原起点冻结分别保留。

模型质量、原机公网/生产capture、自然REAL FAILED编辑、双方最终组合联调均不由这些fixture证明；既有6/9、13/14及原失败保持。不要部署、启用或复位原队列来让报告变绿。
