# D26-A 后端发布阻塞与限定回归

2026-10-31，Asia/Tokyo。**总体 HOLD，禁止合并/绕过门禁。** D26-A 分支 `codex/d26-a-release-blockers`，最终基线 `df6822e2330d82f0ed5cffaf033e4b54368e6e31`。初查基线 `794725fa160ebd5ab6282ae461ecf96df8d5c765` 的结果单独保留，不冒充新 main 组合测试。

## 阻塞登记与原任务映射

| ID / 优先级 | 原任务与证据 | 本卡处理 / 关闭条件 |
| --- | --- | --- |
| D26-A-COVER-01 / P1 | D25-A-COVER / D25 I1 生产封面链；新 main 的 `CoverCoordinator.tick()` 在 binding 抛 404/503 时仍 advance。发布 SQL 的 PUBLISHED 与文件台账 SUCCEEDED 是两个资源，短暂 UNKNOWN 或入口读取错误可能永久漏过该发布。原 D25 TASK-01 CAPTURE_FAILED 是既有独立失败，**没有证据表明它由本缺陷导致** | 新增精确回归，先红后绿；入口未确认时不推进游标、不创建 capture，持久化 quarantine/manualRecoveryRequired，重启不自动重试。确认的 FAILED 保持失败并只推进一次；未知 capture 保留 inflight。具体回执见 release-api/evidence。该代码缺陷关闭不解除整体质量 HOLD |
| D25-A-F1/F3 / P1 | TASK-02 `bb4501fa-b19b-4753-b4d8-2862cb58e116`、CAT-01 `e2eec89d-4cd9-4ca1-a48c-a09e77551e2e` 原 JSON 失败；历史非法动作、重复 content 等失败源已保留 | 新 main 已包含 D25 的严格协议/提议反馈及 PR84 的序列化提示修复；不再重复改提示词，不容错修 JSON、不加模型重试。确定性回归不能关闭真实模型效果阻塞；新完整 REAL 复评未执行 |
| D25 TASK-03 / P1 | `fb95b253-52d8-4c3f-ba69-a6ae96665be9` 平台 READY，但原冻结 `/tasks` 显示占位，实际购物页生成在 `/` | 新 main 已包含固定 route/file 提示修复；既有路由校验与独立冻结路径保留。真实同候选复评未执行，不能把 READY 计为需求通过 |
| D25 CODE-02/03、ENV-01 / P1 | 原任务 ID 与 SHA256 在 `tests/regression/release-api/release-freeze.json`；provider HTTP503 / UNKNOWN 用量 | 保留原失败，不加外层重试或把 UNKNOWN 填零。缺少已确认的真实复评范围/金额，不能宣称故障门槛达标 |
| D25 ENV-02 / P1 | 原 14 位置批次只执行13，ENV-02 `CNY_BUDGET_NOT_STARTED`，没有 taskId；单列首次补验历史另存 | 原批次保持13/14；不把单列补验改成原完整通过。7 份原失败/拒绝记录摘要冻结 |
| D25 自然 FAILED 编辑 / P1 | 原六项真实编辑6/6，无自然失败；原需求6/9，未达8/9 | D26 新回归是受控 mock 提议 + 真实坏 Vue 构建，不是自然 REAL 失败；证明 latestReady/历史源码/迟到提交保护，不能填入原真实分母。自然观察继续 NOT_COVERED |
| 生产自动 capture / P1 | D25-A-COVER 默认关闭，历史三版本 cover 联调2/3，TASK-01两次 CAPTURE_FAILED | 本卡只修协调器可靠性，不部署、不启用、不复位旧队列；功能截图、fixture、operator 公网补验不能代替生产 capture 成功 |
| 同日组合联调 / P1 | D26-B [PR87](https://github.com/Echo-love928/CodeLess/pull/87)，HEAD b0fc773，独立六项 CI success | A 已只读审查，未发现 B 新增代码阻塞。A/B 组合候选和最终 HEAD 检查、另一人批准尚待；最后启用功能的 PR 承担真实联调 |
| D26-A-RUNNER-01 / P1 | 完整本地runner **276/285**，9项映射验收共同before hook失败；`tests/runner/mapping/acceptance.test.mjs:28`固定imageId创建容器时`No such image`；原始build exitCode=null | **OPEN / 阻塞**。独立映射15/15仅证明该组单独准备镜像后可执行，不关闭原门禁失败。多个入口并行构建共享标签可见，但具体镜像失效机制/删除者UNKNOWN。runner/公共门禁维护者协调D26-B处理；A未改runner、infra、根脚本、断言或隔离，未重试整套runner。原ci-gate=1保留 |

没有据当前有限回归发现新 P0；这不是“没有严重数据/权限问题”的全局证明。任何未解决 P0 仍是延期信号，不允许绕过门禁。

## 冻结与重开

本卡不改变公共 HTTP API、契约、根锁、CI、迁移、依赖版本或模型提示词。后端行为唯一变更是封面入口未知时从永久跳过改为隔离并保留游标。生产 `codeless.cover.enabled` / worker 默认开关不变。

`node tests/regression/release-api/freeze.mjs check` 检查204个生产 API/资源/运行时适配器、运行时提示词、全部契约（包含外部封面schema）及7份原失败文件集合和 SHA256。任何变更必须登记清单、重跑对应真实样本和确定性回归；新增文件同样使冻结检查失败。冻结不是质量成功判据。原代码候选140文件冻结保留，扩大覆盖后静态复验0。

操作恢复：quarantine 表示需要人工核对原 published 版本、原台账和不可变入口证明；未确认前保留 cursor/inflight/quarantine，不用 GET 创建新 job，不猜测路由，不删除或重置旧失败。当前版本没有自动恢复端点。

## 证据边界

本卡所有模型阶段均明确命名 deterministic-mock，付费请求0。生成后的数据库、工具、Docker/Vue构建和 Chromium 由真实测试执行；协调器专项的 hosting/capture 是明确命名的边界 fixture，不代表公网发布、截图或VPS部署。

精确命令、原生退出、日志摘要、JUnit、源文件摘要与历史截图恢复记录在 `tests/regression/release-api/evidence/`；完整日志保留 `.local-data/d26-a/commands/`，私有 SQL、会话和凭据不公开。验收逐项结果及最终门禁状态见 `docs/handoffs/D26-A.md`。任何旧成功都不继承到新 HEAD。
