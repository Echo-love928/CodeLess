CodeLess 缺少独立的静态发布与发布确认面板。本 PR 提供按 deploymentId 隔离的不可变静态托管、独立 HTTPS 站点配置、固定目标的隔离探测和明确确认后才提交的工作台发布界面。

本次修复 a8a12bf 互审列出的四项阻塞：

- 托管验收自身准备锁定的 D05 构建镜像，保持真实构建/浏览器/HTTPS 断言，不依赖另一个并发套件。
- 从 VERIFIED snapshot 核对冻结产物摘要，POST 严格 `{applicationId,versionId,artifactDigest}` 与 `Idempotency-Key`；丢失响应后不自动重发，用户显式重试复用同一绑定/key。
- 增加 Java `DeploymentGateway` → 私有 Node stdin 桥接，接受 A 已核验的冻结资产字节，重算完整 manifest，保留 UUID 隔离/原子目录/源码排除。原 live handle 校验保持。A 的同一个 30 秒截止贯穿发布、DNS、实际 HTTPS 探测和清理。
- 冷会话查询 A 的 owner-scoped 应用发布列表，独立展示 `latestSuccessful`；失败或未知 attempt 不抹掉旧成功，旧幂等终态重放也重查最新指针。

验证：静态 exit0（前端103/103，发布专项14项）、runner exit0（74/74，含最大32MiB输入重放与越限拒绝）、本机真实托管 exit0、发布 Chromium5/5。临时组合 A 精确候选 `716abcd` 与 B 实际 Java adapter：原六项断言保留，新增一项，共7/7、exit0；真实HTTP/session/PG/构建/浏览器/冻结字节走到 Node 静态目录。未提供公网DNS时生产probe实际失败，SQL旧成功及真实列表保持，不能把这当作公网成功。

默认10-worker全量 E2E 本轮51/52、exit1：发布四项通过，旧创建应用用例在/login超时。随后新增两项发布回归定向通过，最终54项由当前HEAD CI执行。未修改原 auth/apps 用例、并发、超时或断言，失败记录保留。
本轮本地完整API门禁仍在执行，退出码未知；完成后补交实际结果。不能以专项通过或a8a12bf远端API通过代替本轮结果。

本机自签名 TLS 与私网 CA 探测明确是 fixture。B 桥接源码在本卡目录，已和实际 A 服务组合验证；最终同时含 A/B 的启用 PR 仍须安装/注册网关 bean，并由公共维护者登记 A 的 OpenAPI patch。公网域名、有效TLS与实际服务安装尚缺，完整公网成功里程碑未达成。

证据/复现/历史失败：`docs/handoffs/D15-B.md`、`tests/e2e/deploy/evidence/2026-10-15/`、`infra/hosting/README.md`。继续草稿；不自批、不合并、不推 main；按最终HEAD必需检查和独立复审结果评估，不继承旧提交的CI状态。
