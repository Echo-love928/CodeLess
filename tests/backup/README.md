# D23-A 备份与恢复验收

所有入口均使用仓库锁定 Node/Java/pnpm、原 PostgreSQL 摘要，无新付费模型请求。生产操作使用 `scripts/backup/backup.py` 和 `docs/operations.md`；以下为独立测试。

```sh
python -B tests/backup/record.py unit
python -B tests/backup/record.py live
python -B tests/backup/record.py application
python -B tests/backup/export_application.py
```

- `unit`：确定性文件/失败/秘密哨兵专项；MockPg 不是数据库恢复证明。
- `live`：两个实际 PG cluster 的 dump/restore、真实迁移/FK、五表引用与文件一致性；保留 `T4=NOT_RUN`，不混淆验收范围。
- `application`：真实 source API + 命名 Mock 建议 + 受限 Docker build + Chromium → owner 点击发布 → 停源进程 → 全库/7个数据根备份 → 原目录封存且原 PG 销毁 → 独立空 PG + staging 恢复 → 原绝对路径新目录/同一备份 release → 新生产 API 主类、preview 进程、原 owner 新会话 → 旧版本预览/刷新、旧发布与源码包读取 → 新固定 Node 容器构建并精确复现原 artifactDigest。期间删除 index 的负向检查必须拒绝，复原字节后才能启用。
- `export_application`：校验真实报告、退出码、源/目标隔离、ZIP/构建摘要和清理；仅发布白名单 fixture ZIP、iframe 截图、构建日志与去敏摘要。数据库 dump、完整备份、会话/签名 key、API日志/stack 和实际绝对路径都不公开。首次运行未通过时导出器非零，不生成成功摘要；失败批次另列，不覆盖。

固定 runtime release 取精确 Git blob 字节（LF），含 jar、web、受控模板/锁、runner 和其跨目录 `services/api/src/main/resources/network/site-policy.json`。测试启动前解析真实 preview import 图；源 test composition 在 API jar 外，仅增加命名 Mock 与本地 HTTPS 探测适配器。恢复 API 使用备份 jar 的**生产主类**，关闭 task/deploy/sweep 后验证读路径。Node/Java 平台依赖由本机已有锁定环境提供，ZIP 构建使用新容器与新 store。

此 application 证据来自同一宿主的独立 cluster、全新 JVM/preview、移走源目录后重新创建的运行根；证明独立空集成环境的真实应用恢复。生产 Linux/systemd stop 守卫、跨主机 UID/GID/ACL、异机存储和 RTO 仍需要上线环境演练，本测试不伪装这些结果。测试 guard 只属于 import-based fixture，不为生产 CLI 增加跳过守卫的开关。

私有文件位于 `tests/backup/.private/`，会保留失败现场与备份，结束只清理自有随机标签容器/进程；有原镜像 tag 时以临时自有引用保留并还原，首次准备的可信镜像缓存可以保留，未存在的原引用记 null。新实验不得并发修改共享 Vue build tag 或 Maven target。Windows 需有读取不可变版本 ACL 的操作员权限；不要放宽 ACL 让记录器通过。导出器要求最后一次运行成功、被测代码未变，不能用旧成功覆盖新失败或未完成运行。

B 复审固定归档入口与依赖见 `review_peer.py`；只读检查，不发送模型请求。完整交接见 `docs/handoffs/D23-A.md`。
