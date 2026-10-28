任务ID：D23-A｜运维配置、备份与恢复流程

目前数据库与私有卷没有成组的备份/恢复流程，恢复时改动绝对数据路径还会导致现有预览证据被拒绝。本 PR 增加停写备份、校验、独立空集群恢复和启用前核验，并把路径约束、P0 清单和未通过验收明确写入运维手册。

- 范围：`scripts/backup/**`、`infra/backup/**`、`docs/operations.md`、`tests/backup/**`、`docs/handoffs/D23-A.md`。无 API 行为、迁移、依赖、根锁、CI、公共契约变化。
- D23-A-01：全库 dump + agent（不可变版本/构建/部署账本/证据/审计）+ workspaces + 外置审计 + hosting + 精确 release；SHA-256 与原绝对根映射。
- D23-A-02：停写服务/worker/数据库会话守卫、前后源一致性校验；目标须为独立 PG17 cluster、空数据库和新目录。pg_restore 单事务；无自动清库/覆盖/上线。绝对路径在独立主机原位恢复，禁止改写不可变 receipt。
- D23-A-03：操作员数据库/卷检查、operationId/backupId、空间预检、失败非零/稳定错误码和最后写入的完成标志。真实 ENOSPC/工具故障不吞掉；旧备份不覆盖。
- D23-A-04：P0 冻结及问题优先级，README/环境/版本/运营手册纳入 M4。

验证（精确命令/源码摘要/原生退出码见 `tests/backup/evidence` 与 handoff）：

- 实现提交 `0fffaee` 的 Python 文件/故障/秘密哨兵专项 **native0、20/20、无跳过**；源码工作字节摘要已复核。数据库适配器明确 MockPg，不作为真实 PG 验收。
- 双真实 PostgreSQL 恢复测试已提供，执行因 Docker daemon 缺失退出 1；T1 未通过，T4 未执行。
- 最新 main `26b95e3` 上四阶段真实执行：static 0（52 Node / 199 web）；api 1（270 tests、103 errors）；runner 1（66 pass / 34 fail）；e2e 1（68 pass / 4 fail / 3 did not run）；ci-gate 1。Docker 不可用；完整原始日志在本地受保护目录，公开记录摘要/退出码。首轮沙盒权限失败独立保留，未改写。
- E2E 生成的已有截图先保存本轮字节，再恢复起始字节，摘要在门禁记录中；未带入越范围更改。

失败路径：服务仍运行/未知、活动数据库客户端、同源 cluster/非空库/既有目录、根重叠、路径/链接/硬链接、密钥文件、dump/restore 非零、源变化、缺件/篡改、磁盘不足、恢复引用不一致、绝对路径搬迁均失败关闭。应用验收始终独立标记 NOT_RUN。

数据/配置：无迁移。JSON 不接受密码/任意命令；真实数据备份机密保存、异机加密、ACL/来源校验由运维负责。恢复后按原安装器重新授予 uid/gid/ACL，单独提供模型/TLS/签名配置。回退为保持原生产环境，不自动替换服务或 DNS。

模型来源：本卡不发起真实付费模型请求；门禁固定 deterministic-mock，协议 fixture 不证明模型效果。开发 token I/O 未知，平台 Mock usage 未知，另账。

剩余事项：T1/T4 独立环境演练、systemd/Linux 守卫与异机备份告警实测、B 安装/导出组合验收、当前候选精确远端 CI 和另一成员批准。新增 Python 专项目前独立运行，CI 维护者需决定登记入口，本卡未越界修改 CI。RTO 未测。

审查者：另一成员。D23-B 材料当前缺失，见 `tests/backup/review-D23-B.md`。作者不自批，不合并；保持 draft。

合并条件：最新 main 组合、所有必需检查真实 success、真实恢复报告、无未解决阻塞讨论和同伴批准。旧 D22 success 不继承，远端 CI 即使通过也不能解除本卡 T1/T4 缺证。
