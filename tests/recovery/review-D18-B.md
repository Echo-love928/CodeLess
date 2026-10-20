# D18-A 对 D18-B 的只读互审

- 对象：草稿 PR #53 `codex/d18-b-recovery`，候选 `1cf20cf02e94e385c05ef9b325fd1e6a58cafa79`（运行时代码最终候选 `2a0d284`），基线 `436c04a`。
  第二轮增量复审对象为新 HEAD `63c5153`（运行时代码 `e63f5e6`），见文末。
- 方式：隔离 worktree `.d18-b-review/`（detached，只读，未提交、未推送、未改 B 代码），`pnpm install --frozen-lockfile`，B 自带记录器 `tests/e2e/recovery/record-command.mjs`。
- 重点：错误状态无死按钮或无限 loading；重试不会重复旧请求；键盘能完成提交和退出选择；窄屏可以查看任务与预览；范围、失败路径、秘密与测试强度。
- 结论：已提交 [APPROVED review](https://github.com/Echo-love928/CodeLess/pull/53#pullrequestreview-5586470309)，只针对 `1cf20cf`，不豁免合并门禁；新提交需要重新审查。

## 阻塞问题

本次检查范围内**未发现** D18-B 代码阻塞。

按仓库规则，B 的 PR 自身仍不具备合并条件：B 记录的完整门禁 e2e 为 73/74（D16-B 截图 T1 的 30 秒超时，未归因）。最终 HEAD 的必需检查必须为真实 success；本审查不能替代该条件。

## 建议（非阻塞）

1. `apps/web/src/features/workbench/feature-request.ts:8` 使用 `AbortSignal.any`。诊断请求总会传入调用方 signal，所以不支持该 API 的旧浏览器（Safari < 17.4、Firefox < 124）会立即 `TypeError`，诊断区一直报错。
   当前 Baseline 已普遍可用；若受控试用需要支持旧浏览器，可改为监听调用方 signal 再中止内部 controller 的写法。
2. 取消请求同样受 15 秒客户端截止约束。D18-A-T2 已在真实 PostgreSQL 上证明：重复/并发取消（所有者 8 次、管理员 4 次，并与过期回收、runner 清理并发）不抛异常，只产生 1 条 `TASK_FAILED`。
   因此超时后再次点“取消任务”是安全的。建议在 `docs/ui-errors.md` 写明这一点，与“提交结果未知”的处理区分。
3. D18-A 之后，服务重启时任务在服务恢复后约一个租约（默认 60 秒）内转为 `FAILED/INTERRUPTED`，此前最长可达 12 分钟。
   “连接中断，正在恢复”期间可提示“服务恢复后约一分钟内确认最终状态”，减少用户在过渡期反复提交。
4. D18-A 会把中断/取消任务遗留的 DRAFT 版本收敛为 FAILED，冻结报告只有 `failureCode`（`INTERRUPTED`/`CANCELLED`），构建与退出码为空。
   main 上已有的 `version-api.ts:64` 会显示 `INTERRUPTED · 构建 结果未知；退出码 未知`，语义正确（未知不改成功）。最后启用 PR 应在真实后端上断言这段文案。
   （第二轮更正：分隔符写错了。`version-api.ts:64-65` 用 `；` 连接，完整文案为 `INTERRUPTED；构建 结果未知；退出码 未知；浏览器验证 结果未知`。B 的清单按子串断言，不受影响。）

## 已核验内容

| 项 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 范围 | `git diff --stat origin/main...1cf20cf -- services contracts scripts .github infra pnpm-lock.yaml package.json` | 空：只改 `apps/web/src/features/**`、`tests/e2e/recovery/**`、`docs/ui-errors.md`、`docs/handoffs/D18-B.md`。 |
| 单测 | `node tests/e2e/recovery/record-command.mjs unit`（worktree 内，run `2026-10-20T14-06-00.600Z-unit`） | exit 0，26 个文件，196/196。 |
| 构建 | `record-command.mjs build`（`2026-10-20T14-07-19.538Z-build`） | exit 0。首次直接跑 `browser` 因缺少 `dist` 而 webServer 启动失败（exit 1，`2026-10-20T14-07-05.700Z-browser` 保留），属于前置条件，不是 B 缺陷。 |
| 浏览器 | `record-command.mjs browser`（`2026-10-20T14-07-28.209Z-browser`） | exit 0，17/17（D18 十项 + 原发布七项），30.3 秒。 |
| 无死按钮/无限 loading | flow.spec `D18-B-T1` ×5（含 `INTERRUPTED` 与未知码）及 hanging 用例；`use-workbench-task.ts` 的 `canStart`/`canCancel`/`canRefresh` | 终态 `aria-busy=false`，重试与刷新可用、无取消按钮；刷新 503 后按钮释放；挂起 POST 在 15 秒截止后转为“核对本次提交”，只有 1 次 POST。 |
| 重试不重复旧请求 | `D18-B-T2` 两条；代码中未知结果保留 `{prompt,key}`，明确 4xx 才清除 | 已受理失败：新 key、新 ID，旧任务保持 FAILED；丢失响应：同 key 同 prompt 重放，只有 1 个任务。与服务端 D05 幂等及 D18-A-T2 一致。 |
| 键盘 | `D18-B-T3` 两条；`WorkbenchPage.vue` 的 `shortcut`（`isComposing` 保护）、`VisualEditSelector.vue` 的 Esc 回焦 | Ctrl/⌘+Enter 提交、Enter 只换行；平台与 iframe 两侧 Esc 退出后焦点回到选择框。 |
| 窄屏 | `D18-B-T3/T4`；人工查看本次生成的 `workbench-375.png` | 375×812 与 812×375 无横向溢出，任务、日志、iframe 标题“版本 2 页面”、版本记录均可见。 |
| 安全 | `grep v-html/innerHTML`；`LogMessage.vue`；秘密模式扫描 | 无 `v-html`；日志按文本渲染，`<script>` 文本未执行；B 的改动与测试中无密钥/令牌模式。 |
| 与 D18-A 语义 | `failure-description.ts` 的 `INTERRUPTED` 文案；发布失败文案 | 与 D18-A 的重启收敛（INTERRUPTED、不转 READY、保留可用版本）以及 D18-A-T1 的“上次成功发布与 URL 保留”一致。 |

B 的 fixture 是明确的 HTTP doubles，只证明 UI 行为。数据库重启、资源回收与发布引用保护由 D18-A 的真实 PostgreSQL/子进程测试证明，两者的真实组合联调仍由最后启用 PR 承担。

## 第二轮：增量复审 `1cf20cf..63c5153`

- 对象：#53 新 HEAD `63c5153133ac3ced532bee37fc5c0038aeb6b9ac`，运行时代码 `e63f5e6`（`e63f5e6..63c5153` 只改文档与证据），基线仍为 `436c04a`。
- 方式：同一隔离 worktree 切到 `63c5153`（detached，只读），`pnpm install --frozen-lockfile --prefer-offline`，用 B 的记录器跑 `static` 与 `e2e`；deterministic-mock，Docker 29.8.2。
- 结论：增量无阻塞。经用户确认已提交 [APPROVED review 5587340323](https://github.com/Echo-love928/CodeLess/pull/53#pullrequestreview-5587340323)（2026-10-20T15:25:08Z，commit `63c5153`）。
  API 读回的状态、提交与正文（2,399 字符）一致。批准只针对该提交，不豁免合并门禁；旧批准不沿用，新提交需要重新审查。

### 阻塞问题

增量范围内**未发现**阻塞。

- 合并门禁：远端 ci [run 39444108011](https://github.com/Echo-love928/CodeLess/actions/runs/39444108011) 对 `63c5153` 的 infra-preflight、verify:static、verify:runner、verify:api、verify:e2e、ci-gate 全部 success（15:06:40Z 完成，只读取一次）。
- B 本机完整 E2E 在 `e63f5e6` 上为 69 通过 / 3 失败 / 3 未运行，应继续原样保留在 B 的交接中。同一代码在本机 75/75，远端 verify:e2e 也是 success，失败没有在另外两个环境复现。B 的增量不涉及 runner、预览和截图模块。这只是对照数据，不是 B 机器上的根因证明。
- A+B 真实组合联调未执行，由最后启用 PR 承担，不能称为完成。

### 建议（非阻塞）

1. 重启提示只在 `reconnecting` 时显示（`WorkbenchPage.vue` 的 `showRecoveryNotice`）。服务快速重启时，SSE 先恢复为“事件已连接”，提示随之消失，但任务仍显示运行中。
   D18-A 下新进程不会续跑或重新领取该任务，要等旧租约到期（默认 60 秒、每 20 秒续期，即崩溃后 40–60 秒）才由 `TASK_FAILED/INTERRUPTED` 事件收敛。可以把提示保留到该任务收到新事件或进入终态。
2. 迟到的取消网络错误：SSE 已把任务置为 `FAILED/CANCELLED` 后，`report()` 仍写入“网络连接失败，请检查连接后重试。”，此时已没有可重试的取消按钮。
   单测只断言不含“取消结果尚未确认”。可在权威终态时清除该错误，或改成说明性文字。
3. 合并顺序：“约一分钟”依赖 #54 的 60 秒租约。若 #53 先于 #54 合入，main 上租约仍等于 12 分钟截止。文案有“取决于服务配置和可用性”的限定，可以接受；最好 #54 先合或同批合入。
4. `INTEGRATION-CHECKLIST.md` 可补一条降级分支：冻结报告失败（D18-A `DraftConvergence` 返回 UNAVAILABLE）时版本仍转为 FAILED，但 snapshot 读取失败。
   界面应显示 `验证失败` 和 `无法读取该版本的冻结错误摘要，请刷新版本重试。`（`version-api.ts:68`），不能显示成功或空白。
5. 记录器：14:49 与 14:52 两次 static 运行记录的 head 是 `1cf20cf`，实际测的是未提交工作区。摘要比对显示代码与 `e63f5e6` 一致，只有 `tests/e2e/recovery/README.md` 不同。
   可在 run.json 中标记未提交工作区（`git status --porcelain` 非空）并记录差异摘要，避免 head 字段误导。

### 已核验内容

| 项 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 范围 | `git diff --name-only origin/main...63c5153`；对 services、contracts、scripts、.github、infra、锁文件、package.json 的 diff | 只改 `apps/web/src/features/**`、`tests/e2e/recovery/**`、`docs/ui-errors.md`、`docs/handoffs/D18-B.md`，后端、契约、CI 与锁文件为空。 |
| 建议 1 | `feature-request.ts`；`http.ts` 把任何 fetch 异常映射为 `ApiError('network')` | 调用方 abort 监听转发到内部 controller，已中止与稍后中止都生效；成功、失败、超时都会移除监听并清计时器，错误类型与原实现相同。测试令 `AbortSignal.any` 抛错；未在旧版 Safari/Firefox 实测（B 已声明）。 |
| 建议 2 | `use-workbench-task.ts` 的 `cancel()`；`TaskQueueService.cancel` | 每次取消先清空错误，只在同一 epoch、同一任务仍运行且为 network/server 错误时追加说明；不自动重发，`createTask` 只调用 1 次，`canCancel` 保持可用。服务端所有者取消对终态直接返回原状态，管理员返回 ALREADY_TERMINAL；D18-A-T2 证明并发下只有 1 条 `TASK_FAILED`。`ui-errors.md` 与之一致。 |
| 建议 3 | `WorkbenchPage.vue`；`flow.spec.ts` 新用例 | 只在已知运行中任务 reconnecting 时显示，权威 FAILED/INTERRUPTED 后消失，全程 1 次 POST，没有伪造 READY。`lease-ms` 范围 1000..600000 与 D18-A `TaskScheduler` 一致。 |
| 建议 4 | `INTEGRATION-CHECKLIST.md` 对照 D18-A 代码 | 第 3 项“同事务 DRAFT→FAILED”与 `DraftConvergence`（MANDATORY 传播）一致。第 4 项 null 形状与 `LocalVolumeSnapshotStore.freezeOutcome` 显式写 null 一致，`VersionHttpIntegrationTest:162` 已证明全局 non-null 配置下 HTTP 响应仍保留显式 null。第 5 项文案与 `VersionWorkspace.vue:20`、`version-api.ts:64-65` 一致。清单不是执行结果。 |
| static | `record-command.mjs static` @`63c5153`（run `2026-10-20T15-15-08.833Z-static`，日志 sha256 `1746038a…`） | exit 0：契约 18/18，vitest 26 个文件 199/199，类型与生产构建通过。 |
| 完整 E2E | `record-command.mjs e2e` @`63c5153`（run `2026-10-20T15-15-38.516Z-e2e`，日志 sha256 `d147a2aa…`） | exit 0：跨资源 READY/发布流程通过；Playwright 75/75（8 workers，1.1 分钟），包括 B 本机失败的 D10-B 成功 fixture（4.2 秒）、D09-B 真实预览（35.2 秒）、D16-B 截图（5.8 秒），以及 D18 十一项与发布七项。结束后 worktree 无受跟踪文件改动。 |
| 远端 CI | `GET /actions/runs?head_sha=63c5153…` 与 `/runs/39444108011/jobs`，读取一次 | 六个检查全部 success。 |
| 四个重点 | 新增路径与全量 E2E | 无死按钮：取消失败后 `cancelling` 在 finally 释放，取消与刷新保持可用。重试不重复：只对同一任务重发取消，不新建任务。键盘与窄屏：本轮未改，D18-B-T3/T4 在本机通过。 |
| B 的证据 | 用 `e63f5e6` 的文件重算 B 两次运行的 sourceDigests（允许 CRLF 检出） | 最终 E2E 运行 69/69 一致；14:52 static 运行 68/69 一致，只有 README 不同。 |
