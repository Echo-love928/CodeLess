# 给 B：PR86 独立生产 cover 增量验收任务

A 已创建草稿 [PR86](https://github.com/Echo-love928/CodeLess/pull/86)，基于 PR84/`380811d5270a72706fad0b1a74b7ffab8b97735a`，生产实现候选 `45650b16981b04b6d65742befea8793b21f7a229`。请按最终 PR HEAD 核对文档提交是否只补证据；生产代码有变更时重新固定候选。**本交付不请求批准合并，整体仍 HOLD。**

## A 已完成

1. 接通 owner 元数据/PNG 两个 GET、私有持久协调器、受控功能入口和 UI 链接，默认关闭。A 登记并集成该 PR 的公共 OpenAPI/schema，未改锁、CI、迁移、生成/编辑协议或 main，未部署 VPS。
2. 新增入口、旧根封面不能重标 `/tasks`、绑定变化、未知工作进程、保留旧 FAILED、目录/摘要/PNG、权限及子进程硬截止等回归；Java 专项 18/18，static Node54/54、前端206/206、构建成功。真实 PG/Docker/Vue/Chromium 使用 named mock，付费模型新增 0。
3. 原机原三个不可变发布与六项 REAL 编辑链保留。当前 owner 接口真实公网捕获 2/3：SHOW-01、SHOW-02 成功并可从 PNG 接口读取；TASK-01 `/tasks` FAILED/CAPTURE_FAILED、attempts=2、imageDigest/imageBytes=null，未复位、未重试。18 项匿名/跨 USER/跨 ADMIN 拒绝检查通过，26 行原模型账本及全部 latestReady/publication 前后一致。
4. 修复首轮 Java IntNode/LongNode 严格比较造成的错误隔离；保留首轮1/3和隔离队列，新回归先红后绿。TASK-01 之后只做两次目标解析诊断，均成功；旧捕获失败根因仍 UNKNOWN，新增截图尝试0。
5. 新独立测试应用中，受控非法 Vue 编辑真实构建退出2、FAILED后，旧 latestReady、PUBLISHED及封面仍可读。该 fixture 5 行 mock 账本，**不是自然 FAILED，也不是 REAL 模型效果**。
6. 当前候选不传 cover 启用开关的真实 API 测试：正常登录200、两路404、没有建立队列。完整四门禁、当前 HEAD CI、所有旧失败和证据索引见 README/最终检查记录，未完成或失败不能视作 success。

## 请 B 独立检查

- `CoverEntryProof.java:15`、`CoverService.java:23`：先 owner 检查，再读取自己的不可变版本/报告/日志；唯一 enum 入口、冻结 actions 全部原生 PASSED，缺少/歧义不猜根路径。不要用外部 record、页面文字或源码注释替代平台授权。
- `CoverStore.java:53`、`:80`：元数据/图片完整绑定，PNG 摘要/上限/尺寸复核；匿名401，他人普通 USER/ADMIN404；错摘要404，损坏/未知非终态503；GET不建立或重试 job，旧成功图片在隔离后仍可读。
- `CoverCoordinator.java:28`、`:66`、`:84`：所有者锁、inflight、游标和隔离均持久；未知中断停机，不自动恢复旧锁或重跑 FAILED；不会修改原发布或 latestReady，也不阻塞 generation lease scheduler。
- `NodeCoverGateway.java:28`、`services/runner/src/screenshot/gateway.mjs:23`：固定命令和闭合协议，敏感环境不传入；45秒含清理，内部12秒/2次/100条和3秒资产限制不变；旧 RUNNING/RETRYING 要求人工恢复，TLS/DNS/内网/摘要边界未削弱。
- `apps/web/src/features/deploy/cover-api.ts:12`、`DeploymentCover.vue`：只从自己的 canonical publication URL 与受控 entry 派生链接；失败占位、旧公开地址保持；旧 root PNG 不冒充 `/tasks`。
- `contracts/cover/` 与 `contracts/openapi.v0.json`：只新增两路 owner GET、明确 null/状态/失败语义，没有公共捕获或写接口。若 B 仍持有其他公共契约改动，请仅协调该差异，不整仓覆盖。

可复现命令（Java21、Node24.22.1、pnpm12.6.0；Docker及锁定 Chromium 必须真实可用）：

```powershell
.\services\api\mvnw.cmd -B -ntp -f services/api/pom.xml '-Dtest=CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest,CoverHttpIntegrationTest' test
node --test tests/infra/cover-entry.test.mjs tests/infra/cover-queue-binding.test.mjs tests/infra/cover-gateway.test.mjs
node --test tests/deploy/contracts.test.mjs
corepack pnpm verify:static
corepack pnpm verify:api
corepack pnpm verify:runner
corepack pnpm verify:e2e
```

本机四门禁需串行，不能在 runner 中途重建同名 Docker 镜像。首轮该资源失败已保留；CI 各 job 独立执行，按精确最终 HEAD 检查。完整日志本机路径和 SHA 在 command receipts，可直接核对；公开只含已审计摘要，不含 SQL、会话、模型/SSH密钥或连接配置。

## 仍阻塞及回传格式

请继续以“阻塞问题 / 建议 / 已核验内容”回传，附精确 SHA、文件位置、复现命令、原生退出码和证据路径。以下不能因 CI 成功解除：原九需求6/9、本候选生成 REAL NOT_EVALUATED、TASK-01生产 cover失败、自然 FAILED 尚未观察、B直接公网 DNS 尚未复核。本机私有实时 SSH DNS 与实际 HTTPS/TLS 证据不等于 VPS 部署成功。

本轮仍由 A 原机保留 DB、不可变版本、原 API61997 和新 cover API61998，B审查证据；无需跨机交付密文或密钥。不得清理/导入旧数据库、重置原 FAILED、启动付费复评或启用 VPS生产。下一轮执行或部署须先明确范围；作者修复后仅增量复查受影响范围，不自批、不合并。
