局部修改继续通过 D13 的受限克隆工作区和 D10 的有限修复执行真实构建/浏览器验证；新测试覆盖文案和颜色成功晋级、实际 TS1109 修复、无进展失败保留及旧版本恢复。失败候选的源码、差异和错误保留，当前可用版本不会被失败覆盖。

新增已鉴权用户显式恢复接口，带 expectedCurrentVersionId。在应用锁内核对归属、VERIFIED 状态、预期指针和活动任务，并验证成功构建记录及冻结源码/产物/浏览器报告后才移动现有 latestReadyVersionId。恢复后的版本也是下一次编辑的基版本；不可变版本及历史发布记录不改写，不触发发布。

验证：完整gate中本卡7/7、D12生命周期15、D13范围8+3、D10修复21与真实平台选择/编辑预览全部通过。static退出0（契约11/UI72/lint/type/build）、runner退出0（69/69）、E2E退出0（45/45）。API退出1（210项、0failure/1error/0skip）：既有FileToolsIntegrationTest清理报DirectoryNotEmpty，EMPTY_AT_FAILURE/remaining0；ci-gate仍退出1。首轮专项ledger SQL error退出1已修正，原失败保留。真实恢复HTTP响应与新增契约schema8项校验退出0。模型为命名deterministic-mock，数据库、构建和浏览器真实执行，不证明真实模型效果。

源代码ca51d70远端API成功210/210（本卡7/7），static/E2E/infra-preflight成功；runner失败68/69，ci-gate失败：OOM fixture实际exit137/oomKilled=false/NO_OOM_EVENT，未满足原OOM断言。底层原因未知；本PR保留BUILD_EXIT及失败断言，没有跨范围修改runner、添加重试或掩盖失败。Linux API成功不关闭Windows清理error。两项门禁阻塞交对应维护者处理，不能合并。公开canonical明确本卡PASSED、完整命令FAILED/exit1；不以单卡通过冒充整体绿色。证据/交接提交后精确HEAD checks需重新读取，不继承源代码候选结果。

新增路由的契约提案在 `tests/edit/verification/CONTRACT.md` 和 `openapi.restore.patch.json`；公共契约、迁移、锁、CI、前端及 runner 均未修改。D14-B 候选尚未提供；新 UI 互审及最终启用 PR 的真实 M2 联调待维护者接手。保持草稿，待另一人批准和精确 HEAD 必需检查成功后再讨论合并。
