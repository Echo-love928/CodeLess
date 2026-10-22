# D20-A 对 D20-B 的只读审查（PR #58）

对象：[PR #58](https://github.com/Echo-love928/CodeLess/pull/58)「D20-B：全产品确定性端到端回归门禁」，head `65e8e6041c04919f695bed366e26b91339a654ac`，base `c5bec00`。
审查方式：只读。读取 D20-B 交接、`tests/e2e/full/**` 全部脚本与 spec、`apps/web/package.json` 与 `.github/workflows/ci.yml` 差异、公开证据文件，以及远端 CI（GitHub 公共 API，读一次）。
未修改 B 的任何文件，未推送、未批准。

## 阻塞问题

本次范围内未发现 B 代码阻塞问题。

## 建议（非阻塞）

1. **CI 文件的维护者登记需维护者确认。** B 在 `.github/workflows/ci.yml:97` 起新增 19 行失败产物上传步骤，并在交接中自行登记“未找到现行共享维护登记”。
   改动只是附加 `if: failure()` 的 `upload-artifact`，不改 jobs、权限或判定；D20-A 没有改 CI，无冲突。
   但仓库规则要求 CI 同一时间只由登记维护者修改，建议当日维护者在 PR 中明确确认，而不是由作者自登记。
2. **本机 Node 版本漂移会让 `verify:e2e` 在本机必然失败（预期内，但需在交接写清）。** `tests/e2e/full/prepare.mjs:6` 要求 `process.version === 'v24.16.0'`，与根 `verify:versions` 一致。
   本审查机器的 `F:\nodejs\node.exe` 现为 v24.22.1（D19 时仍为 24.16.0），因此合入后本机 `pnpm verify:e2e` 会以“Locked Node 24.16.0 required”失败，而非业务失败。
   复现：`node --version` → `v24.22.1`；`node tests/e2e/full/run.mjs` 首步即抛出上述错误。这不是 B 的缺陷；建议 README 在“Run from the repository root with Node 24.16.0”旁注明错误信息与恢复方法，避免被误读为回归失败。
3. **两个用户是顺序执行的。** `business.acceptance.ts:48` 的 `for` 循环先完成用户 1 再开始用户 2，这对确定性门禁是正确选择；并发下的隔离与幂等由 D20-A 的 `ConcurrencyConsistencyTest`（进入 `verify:api`）覆盖。
   建议在 README“Cases”中写明这一分工，免得读者以为全链门禁证明了并发隔离。
4. **跨用户拒绝集合可补两个写路径。** `business.acceptance.ts:156-166` 覆盖 8 个读与 edit/publication 两个写；未覆盖 `POST tasks/{foreign}/cancel` 与 `POST applications/{foreign}/versions/{v}/restore` 这两个会改状态的写。
   API 层已由 D19-A 矩阵覆盖，此项仅为全链门禁的完整性建议，不阻塞。
5. **nginx 镜像只按 tag 固定。** `run.mjs:116` 用 `nginx:1.27.5-alpine`，PostgreSQL 则带摘要。与 `tests/e2e/deploy/hosting.acceptance.mjs:83` 等既有套件一致，非回归；
   但作为合并门禁，建议与 `infra/public/compose.yml:3` 一样带 `@sha256:` 摘要，避免上游重推 tag 影响可重复性。
6. **本地聚合门禁失败仍为 UNATTRIBUTED。** B 如实记录了本机 `verify:e2e` 68/3/4（未启动新套件）与两组干净对照均 75/75 的结果，没有把对照写成修复。
   合并判定以远端最终 HEAD 检查为准；建议在 PR 描述中保留这一未归因项，直到维护者在 Windows 上复现或关闭。

## 已核验内容

- **范围**：`git diff --stat origin/main...65e8e60` 为 36 个文件，除 `tests/e2e/full/**` 外只有 `apps/web/package.json`（smoke 末尾串接 `node ../../tests/e2e/full/run.mjs`）与 `ci.yml` 的失败上传步骤；
  无生产代码、公共契约、迁移、锁文件改动；既有测试的超时/断言/重试未改。
- **完整业务链与跨用户链**：spec 中两个独立 browser context 分别以两个普通 USER 登录，生成→组件编辑→显式发布→公开页回读→ZIP 独立校验；双向 8 个读与 2 个写均断言 404，应用列表各自只含自己的应用。
  远端 [run 39623224869](https://github.com/Echo-love928/CodeLess/actions/runs/39623224869)（head 65e8e60，读一次）六项 success：infra-preflight、static、api、runner、e2e（其“Run browser smoke”步骤即包含新套件）、ci-gate。
- **清洁数据库可重复**：`run.mjs` 每次 `docker run` 新的摘要固定 PostgreSQL 容器，真实 Flyway 后断言 applications/tasks/builds/publications 全为 0；`evidence/summary.json` 两轮数据库 ID 不同（`438efd66…`/`8b5af0cc…`），`distinctCleanDatabases=true`；结束按 ID 与 label 双重校验后删除容器。
- **零重试稳定**：`playwright.full.config.ts` 固定 `workers: 1, retries: 0`，有限 action/navigation/test/global 超时；轮询只观察异步业务状态，不重放用例。b4489fe 本机两轮 clean + 远端两次（b4489fe、65e8e60）均通过，共 4 次零重试绿色。
  单轮完整运行（含 Maven 打包、运行时准备、建库、浏览器）约 2 分 14 秒（`full-1.json` 14:27:45→14:29:59），180 秒用例上限有余量。
- **失败产物可定位任务与提交**：`identities.json` 随流程逐步写入用户/应用/任务/版本/发布 ID；`run.json` 记录起止 HEAD、`git status`、源码 SHA256 与 canonical；
  CI 失败上传名含 `github.sha`/`run_id`/`run_attempt`。`prove-failure-artifacts.mjs` 的负向运行原生 exit 1、0 retry，`summary.json.negativeProof` 记录了任务 ID。
- **真实失败路径**：fixture provider 只对 `D20_BUILD_FAILURE` 标记输出语法错误，由真实非零构建得到 `FAILED/AGENT_BUILD_EXIT`；SQL 断言 4 READY + 1 FAILED、4 成功构建 + 1 非零失败构建、恰 2 个 PUBLISHED；旧 latestReady、预览、公开页与 ZIP 字节保持。
- **秘密**：只有 fixture 值（`demo-password-for-test-only`、`fixture-only-d20`、`'11'.repeat(32)` 等测试密钥）；ZIP 校验带 `forbiddenStrings`；trace 中的会话属于用后即删的测试库。未发现真实凭据。
- **与 D20-A 的组合**：D20-A 只改 `VersionController.list` 与 `PublicationService.list/deployment` 的读快照，响应结构不变；B 的 spec 读取这些接口的字段（`items`、`latestReadyVersionId`、`latestSuccessful`）语义不变。
  两个 PR 均未合并，组合（main + A + B）的真实联调由最后启用 PR 执行。

## 未执行项（如实记录）

- **未在本机运行 B 的 full 套件**：本机 Node 为 v24.22.1，B 的 `prepare.mjs` 与根版本门禁都要求精确 24.16.0；未经用户同意不下载或替换工具链，也不在审查副本里放宽版本检查。以上“稳定性/可重复”结论来自 B 的记录与远端 CI，而非本机复跑。
- 未审查 `.local-data/d20-b/` 私有日志（在 B 的机器上）。

结论：无阻塞问题，建议 1 需维护者确认。

经用户确认，已在 GitHub 提交 [APPROVED review](https://github.com/Echo-love928/CodeLess/pull/58#pullrequestreview-5610339084)
（id 5610339084，2026-10-22T06:57:21Z，commit `65e8e6041c04919f695bed366e26b91339a654ac`）。提交前在页面内用 `crypto.subtle.digest` 核对正文与保存文件 sha256 `cc29a2a0…` 一致、`reviewEvent=approve` 已选中；
提交后经 `GET /pulls/58/reviews` 读回：状态 APPROVED、提交一致、正文与文件逐字节相同。批准只针对该提交，不豁免合并门禁；B 的新提交需重新审查。
