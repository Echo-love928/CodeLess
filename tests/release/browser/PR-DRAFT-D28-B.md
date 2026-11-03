D28-B｜修复 Windows E2E 资源调度并完成本地完整复核，M5 **HOLD**。

原10-worker配置可复现D16失败：截图87.5ms完成，Chromium关闭耗时12.6秒并耗尽任务截止，代理关闭约2ms。保留D08早期独立任务槽，另将D09/D15/D16限制为一个任务槽，并给普通UI保留执行空间；原80项逐项且仅一次、120秒总截止、断言和零重试均保留。两种未奏效的调度方案和旧CI失败也保留，未用新绿覆盖原事故。

下载原trace的10秒中约7.07秒耗在按钮未就绪，实际export只观察约2.89秒即被测试中断，原请求完成时间UNKNOWN。本轮明确分开按钮就绪与下载事件计时，并捕获请求/响应/下载；这是测试同步和诊断变更，未宣称修复服务端性能。另独立核算本轮四次就绪+下载均<10秒，恢复后总9896ms（下载事件3712ms），余量较小，最终统一候选须重测。新增清理前同次代理原日志与API/browser生命周期取证。

固定B源码 `edded45dd40d30d1bc0d83186c3828b22eba4ce7` 的独立结果：原Windows verify:e2e整体native0（80/80及后续完整platform）；原四阶段ci:gate整体native0，static/API/runner/E2E均exit0，API90份新JUnit/428项全通过且failure/error/skip为0，runner285/285；strict双用户链native0/canonical=true、无清理错误，含真实修复/编辑/发布/ZIP、双向权限、失败/离线恢复和12路由视口。源码SHA六项CI均completed/success；后续报告HEAD的CI另查。

两个生成版本的本地HTTPS URL、源码ZIP及部署/发布文件清单已同源核验；这些是明确mock/loopback fixture，未充当公网、真实模型或生产cover。历史EPERM/ENOTEMPTY/CLEANUP_FAILED及原API中断仍开放；原件及缺失项保留，不因本轮通过关闭。A尚未完成新统一封存包；重封、预算同候选绑定、成组部署及真实公网同源验收、双方复审前不批准或合并。main未改，未部署或启动付费批次。

范围：本轮3文件为 `apps/web/playwright.config.ts`、`tests/release/browser/d28-user-flow.spec.ts`、`tests/release/browser/d28-flow.mjs`；此前授权的取消终态前端两文件和恢复fixture/预览取证修复保留。无契约、依赖锁、CI工作流、迁移或生产截图/导出配置变更。

[当前证据](https://github.com/Echo-love928/CodeLess/tree/codex/d28-b-candidate-acceptance/tests/release/browser/evidence/d28/resolution-20261103) · [验收记录](https://github.com/Echo-love928/CodeLess/blob/codex/d28-b-candidate-acceptance/docs/acceptance/frontend.md) · [交接](https://github.com/Echo-love928/CodeLess/blob/codex/d28-b-candidate-acceptance/docs/handoffs/D28-B.md)。原始认证trace、日志和ZIP仅受控交接，公开摘要/长度及定位；开发token实测UNKNOWN，不将预算当用量。

追加390px平台双用户完整链也已原生0，11个登录/列表/生成/编辑/下载/恢复检查点均无横向溢出，权限和ZIP/部署清单绑定通过。保持原业务断言、480s/500s及零重试，私有视口变体与SHA单列；实际可见trace帧核对完成，原空白过渡帧保留，未改候选源码。恢复重下载事件约781ms、就绪约1872ms。
