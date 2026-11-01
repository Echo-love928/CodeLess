任务ID：D28-A｜候选版本服务端独立验收（HOLD）

此前没有把D28独立门禁、封存API、前置B报告、当前部署和未关闭缺陷放在同一可审计记录中。新增只读验收记录器与逐项证据，将新main候选 `2be793dc3318c2308d18a7fd45afb201342206a7` 的真实检查与已部署61候选分开绑定；缺失、错误和未知均保持非成功。

- 范围：`docs/acceptance/backend.md`、`tests/release/api/**`、`docs/handoffs/D28-A.md`。对应A01–A04；无产品源码、公共契约、依赖、根锁、CI、迁移或权限配置变更。起始他人未跟踪目录保留。
- 验证：精确命令/原生退出/输入与日志摘要/JUnit见 `tests/release/api/d28-candidate.json` 的显式回执引用及 `evidence/d28/summary.json`。原四阶段在干净固定提交worktree真实执行；最终交接提交不继承候选或旧61的CI。
- 当前新失败：完整API native1、427/428、failure1/error0/skip0；RoundFive BARE预期NO_PROGRESS、实际ARTIFACT_INVALID，build0后产物rename EPERM。46份原现场私存/公开SHA，原因UNKNOWN，未重试或放宽断言；T1失败。需要对应维护者修复并形成新候选，当前没有可放行的新版本。
- 最终原门禁：static0（Node64/UI212）、API1（427/428）、runner0（285/285）、E2E0（80/80+完整平台browserExit0）、ci-gate1。源码/HEAD前后相同，90份JUnit与原日志摘要复算无不一致；汇总native1/HOLD。精确2be远端六success单列，未覆盖本机失败。
- 失败/边界：权限与CSRF、预算/取消/恢复、不可变版本由本次API具体用例关联；新封存JAR另执行真实PG空库/前迁/恢复/权限/坏摘要，包与模块闭包单测/实测分账。证据接受负对照拒绝stale/skip/neutral/缺件/重复检查名。
- B互审：`evidence/d28/peer-review.md`。61两份manifest和258源码blob已严格核验，公开7+2文件与匿名401/404独立验证；取回4份原CI日志，static/E2E摘要一致，API/runner与B声明不一致，原因UNKNOWN，不作归一化放行。原桥缺件已由B修复，不再当当前缺陷。
- 模型：deterministic-mock/明确loopback provider fixture；PG、Docker/Vue构建、Chromium真实。无新付费模型请求；真实模型效果与生产cover HOLD不解除。开发token与合成运行用量UNKNOWN，分账保存。
- 数据/配置：仅创建本机隔离候选/临时PG与私有日志；不部署、发布、改生产DB、启用cover或重置旧失败。新API包独立manifest，JAR与61相同；归档/备份/凭据/原日志不上传。
- 剩余限制：原ENOTEMPTY、PR93历史CLEANUP_FAILED未闭环；D28-B PR/报告未出现；B同摘要原日志/成组包及当前受保护部署身份仍待交付。T2/T3/T4与M5不能宣称通过。
- 审查者：另一位成员，未自批。当前为草稿/HOLD；最新main、当前PR精确HEAD全部必需success、无未解决讨论及同伴批准前不得合并。代码或base变化后新候选与受影响重测，不手改绿。
