# D18-A 对 D18-B 的只读互审

- 对象：草稿 PR #53 `codex/d18-b-recovery`，候选 `1cf20cf02e94e385c05ef9b325fd1e6a58cafa79`（运行时代码最终候选 `2a0d284`），基线 `436c04a`。
- 方式：隔离 worktree `.d18-b-review/`（detached，只读，未提交、未推送、未改 B 代码），`pnpm install --frozen-lockfile`，B 自带记录器 `tests/e2e/recovery/record-command.mjs`。
- 重点：错误状态无死按钮或无限 loading；重试不会重复旧请求；键盘能完成提交和退出选择；窄屏可以查看任务与预览；范围、失败路径、秘密与测试强度。

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
