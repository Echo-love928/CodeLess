# D15-A 对接核验（2026-10-15 更新）

已读取 PR44 的精确候选 `716abcd1ae5ad05fd75d780fc21734952326b98a`：deploy HTTP 契约、
PublicationController/Service、DeploymentGateway、SnapshotStore 字节读取、原六项集成测试及对 B 的互审。
本轮为处理用户列出的 B 阻塞而做的只读契约核验；没有改写 A 分支、公共契约、CI 或 main，没有正式批准。

## 阻塞问题

- 公开 DNS、有效 TLS 和已部署的独立托管入口仍缺；本机 TLS fixture 不是公网验收。
- 最终启用 PR 需在同时包含 A/B 的 checkout 中安装 B 的 NodeDeploymentGateway bean，
  并由公共维护者登记 `contracts/deploy/openapi.patch.json`。B 当前分支不复制/覆盖 A 的业务代码或共享契约。
- B 默认完整 E2E 本轮旧创建应用用例登录超时，51/52；发布四项通过但不能算全门禁成功。
  最终候选仍需另一人复审、精确 HEAD 必需检查成功、未解决讨论关闭；不自批或合并。

## 建议

- 安装说明、私有 stdin 契约、冻结资产/截止校验与 bean 示例见 `infra/hosting/README.md`。
- 保持 A 默认 HOSTING_UNAVAILABLE；缺少完整配置时不启用。A 的事务锁与 SQL 终态逻辑不应由 Node bridge 代替。
- 共同截止从 A 传入同一个 Instant；禁止桥接每阶段重新获取 30 秒。

## 已核验内容

- 严格 POST 三字段/Idempotency-Key；列表 independent latestSuccessful，覆盖最近100条以外的成功记录。
- B 已按上述契约读取 VERIFIED snapshot 摘要、保存提交绑定/幂等键、冷会话列表恢复；单元和真实 Chromium fixtures
  验证请求内容、丢失响应后的显式同 key 重放、FAILED/未知 attempt 保留服务端成功地址。
- `node tests/e2e/deploy/record-command.mjs ab` native0：临时 `git archive` 组合，A 生产源码原样，
  编译实际 B Java adapter；保留 A 原六项断言，新增第七项，共7/7、0failure/error/skip。
  真实 session/CSRF/PG/生成/构建/Chromium/冻结卷 -> A payload -> Java -> B Node child -> 静态文件逐字节匹配。
- 第七项无公网 DNS，生产 probe 真实失败关闭，整体 process 7684ms，SQL FAILED、url=null、旧成功记录整行不变，
  实际列表仍返回它。旧成功由原 A 明确 hosting fixture 产生；不声称此链已在公网成功。
- B 原 live handle 校验仍在，未序列化伪造 WeakMap handle；实际本机 HTTPS 验收也测了关闭 handle 后冻结字节发布。
- 公开证据见 `evidence/2026-10-15/B-frozen-bridge.json`、`ab-summary.json` 与完整命令记录。
  Java/Node 的权限边界、A/B 依赖的部署资源、共同截止限制按安装文档保留。

## 初次交付时的历史记录（已被上述实际候选核验更新）

# D15-A read-only review status

2026-10-14 Asia/Shanghai. Read baseline main `572304e0cc21fbfe2e22cf7c286b4c3f29ad1013`,
existing publication schema/OpenAPI and data repository. `gh pr list -R Echo-love928/CodeLess
--state open --json number,title,headRefName,headRefOid --limit 30` returned `[]`, native exit0.
No D15-A implementation, handoff, candidate or test report was available at review time.

## 阻塞问题

- Authenticated publication controller/coordinator is absent from the baseline. Public end-to-end
  owner/CSRF/version lock/idempotency/SQL last-success retention cannot be verified without A's code.
- Public DNS/TLS/hosting resources have not been provided. Local self-signed Nginx and internal Docker
  probe evidence cannot prove an internet-accessible publication.
- Existing POST/GET publication contract lacks latest-success discovery and lost-POST-ID recovery.
  Panel recovers known server-validated IDs per browser session and blocks uncertain submissions;
  A/public-contract maintainer must establish global recovery/idempotency before enabling the milestone.

## 建议

Use the worker contract in infra/hosting/README.md. Lock the already-verified immutable version at
the explicit user click; deduplicate repeated logical requests in SQL. Reconcile app/version/source/
artifact/receipt/probe identity before marking PUBLISHED. Keep the previous successful pointer on
unknown/failing probe/commit. Do not expose staging directories, publish via model tools or accept
user-selected filesystem/upstream/command arguments.

## 已核验内容

Baseline `contracts/openapi.v0.json:1711` POST accepts applicationId/versionId and requires authenticated
owner/CSRF; `:1731` exposes per-ID GET. `publication.schema.json` has REQUESTED/PUBLISHED/FAILED,
requires HTTPS URL and publishedAt for PUBLISHED. Baseline repository stores deployment IDs separately
from immutable version identity. This is contract/data inspection, **not a review/approval of D15-A**.
When A's precise candidate is available, run draft/failed/foreign owner/concurrent version/repeated click/
failed probe retention scenarios against real PG and B's worker/ingress before enabling the feature.
