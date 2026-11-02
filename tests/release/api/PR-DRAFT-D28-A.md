D28-A｜候选版本服务端独立验收与复审修复（HOLD）

PR94@438c0f5的原E2E在120秒全局截止处留下79通过/1未运行和suite/teardown错误；trace显示耗时D08验收约第78秒才开始。将原D08放入首项目排队，其余79项保持原Chromium配置，避免它在总预算末尾才获得执行机会。修改前后80个file/title身份完全相同，原断言、120秒全局截止、零重试及隔离均未改变；新精确HEAD实际门禁仍须验证，不提前记绿。

- 最小范围扩展：仅apps/web/playwright.config.ts的测试项目调度；B仅需同步D08项目名/trace路径。无产品运行代码、公共契约、锁、CI或迁移变更，其余改动在A验收/交接允许范围。
- 验收器修复：Java从显式--java-home或JAVA_HOME_21_X64/JAVA_HOME/PATH发现并验证major21，错误major/探测失败拒绝；当前运行自建pnpm shim。新增4项可移植性控制与原4项证据接纳控制均通过；不把假版本探针当真实JVM验收。
- 原失败保留：438远端E2E/ci-gate失败、2be本机API427/428、ARTIFACT_INVALID/rename EPERM及历史ENOTEMPTY/CLEANUP_FAILED均保留。原Windows完整API在Docker未运行时前置失败已保留；恢复既有Docker29.9.2后第二次原入口及用户授权管理员128MiB文件元数据追踪进行中，不插桩生产、不重试求绿、未结束不填0。
- 当前部署身份：用户授权strict-host SSH只读核验现部署61的实际API打开JAR fd、worker、镜像ID/revision、258源码、7web及agent/export根，9项native0。没有部署新候选、重启、发布或改生产数据。首次整秒btime量化导致的测量失败与CLOCK_BOOTTIME修正回执都保留。
- B互审更新：PR95@80205692材料已审，23处Git blob证据SHA匹配；原gh日志与direct获取方式两组字节已对照，不再列为未解释摘要/材料缺失。A没有安装/独立执行gh，也没有冒称重跑B私有全链。B原完整门禁失败/中断仍保留，未批准或发送review/comment。
- 证据：tests/release/api/evidence/d28-fix/；当前状态见docs/acceptance/backend.md与docs/handoffs/D28-A.md顶部，旧发布/失败快照原样保留。默认明确mock，数据库/Docker/Vue/Chromium真实；付费请求0，合成总用量和开发token UNKNOWN，分别记账。

当前HOLD：新SHA六项必需检查、Windows根因及受影响重测、真实质量/生产cover等尚未同时闭环。未自批、未合并。提交/base变化后只按实际受影响范围验证，旧SHA success不得继承。
