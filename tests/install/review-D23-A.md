# D23-A 只读互审

对象：[PR #76](https://github.com/Echo-love928/CodeLess/pull/76)，精确 head `6fb9836125b6e87737f762eeb4f8eb46846af302`，base `26b95e3`。首次按 D23 查询无候选，交付前再次查询发现此 PR，已完成源码、手册、示例和报告只读检查。没有修改 A 分支、生产服务或 main，没有提交批准/评论或向 A 发送消息。

## 阻塞问题

- **验收缺证，未批准**：`docs/operations.md:78-88` 与 `tests/backup/test_live.py:1-5` 明确不证明恢复后的登录、既有版本预览、源码导出和独立构建。当前 B 的 fresh-install/full-product/ZIP 构建也发生在新建环境，并非从 A 备份恢复，因此不能替代 A-T4。需独立 Linux/systemd 恢复主机、固定 release/原绝对数据根/服务账号与恢复后的原 owner 读路径，完成手册 T4 后才解除。属于已披露的集成阻塞，无新生产代码缺陷结论。

## 建议

- A 更新交接中的 Docker 不可用/T1 缺证状态时，引用本次独立双 PG 结果，继续保留原失败历史。此结果仅含真实 PG dump/restore、既有迁移/FK 与 fixture 引用/文件核对，不含 systemd 守卫、真实应用恢复或 RTO。
- 安装交付需封存同一精确 release 的 jar/web/模板/锁及摘要，按 `docs/operations.md:66-69` 保持原绝对数据路径、恢复权限后执行 check-restored；不能用当前 main 模板替换被恢复版本的 release。
- 新增 Python 专项仍为独立入口，公共 CI 登记由维护者处理，不由 B 越界改动。

## 已核验内容

- 变更仅在 A 卡允许的 backup、operations、handoff 与测试目录，无公共契约、迁移、根锁、CI 或生产 API/runner 变化。
- `scripts/backup/backup.py:25,235-274,304-353`：全库 dump、五表引用前后比较、独立 cluster/空库/全新目录、源/目标文件摘要、恢复后的引用对比、完成标志与 applicationAcceptance=NOT_RUN 分离。
- `backup.py:366-404`：失败返回非零与关联 operationId/FAILED；故障专项实际验证 dump/restore/空间/篡改/目标冲突、旧备份保留，未吞异常冒充成功。
- `infra/backup/*.example.json` 无 password/API key；Pg 参数拒绝 password/URL/任意命令，不回显 pg stderr。真备份仍应机密保存，示例不作为密钥备份。
- `python -B tests/backup/test_backup.py`：**exit 0，20/20、无跳过**，在 PR 精确内容归档副本运行。
- `python -B tests/backup/test_live.py`：**exit 0，PG_RESTORE_AND_FILES_PASSED**，两个独立 PostgreSQL 17.6 固定摘要容器、network=none、自有随机名字；真实 pg_dump/pg_restore、五表引用和全部文件比较通过，结束清理自有容器，无模型调用。输出 A-T1=PASSED，A-T4=NOT_RUN。
- 源码/归档 SHA-256、命令、native exit/signal 和原始安全 fixture 日志在 [peer 证据](evidence/2026-10-28/peer-D23-A/result.json)。本地包装器最初相对导入错误发生在测试启动前；修正仅在忽略目录，A 的测试和逻辑始终未修改。

结论：确定性单测与真实双 PG 前置验收通过；**A-T4 / Linux 操作员恢复演练仍阻塞，不批准合并**。没有将本次双 PG 前置通过冒充完整恢复或源码包可用的证明。
