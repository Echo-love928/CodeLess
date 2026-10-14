# D14-B 可视化修改验收

`flow.spec.ts` 在生产平台 UI、跨源 iframe 和真实 Chromium 中验证四类修改作用范围、显式共享确认、
连续版本/摘要更新、旧选择清理、失败可读日志与旧页面导航/再次修改、409 保留需求及未知状态不晋级。
API、模型提案、生成页面与构建结果使用明确的 `D14 UI contract fixture`，不能当作真实数据库/构建或模型质量证明。
既有 `selector/flow.spec.ts` 的 origin/source/nonce/version/digest/重放拒绝、Esc和手机回归一并执行。

真实联调使用 `PreviewPlatformIntegrationTest`：真实身份、CSRF、Postgres、受限 Docker/Vue 构建、
Chromium/TLS/签名预览、选中组件、共享确认、精确新版本及旧源码保留。只在原脚本加显式确认勾选，
保留其全部既有断言。A/B 组合目录另加入 D14-A 的 EditVerificationIntegrationTest（7项），验证
文案/颜色、TS1109修复、无进展停止、失败指针与历史恢复；它不替代B四类UI fixture的结果。

固定环境：Node24.16.0、corepack/pnpm12.6.0、Java21、Maven3.9.11及锁定bundled Chromium。
本机Java位置 `C:/Program Files/Java/jdk-21.0.12.1`；嵌套pnpm使用已有 `.local-data/d13-b/bin` shim。

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21.0.12.1'
node tests/e2e/visual-edit/record-command.mjs unit
node tests/e2e/visual-edit/record-command.mjs static
node tests/e2e/visual-edit/record-command.mjs browser
node tests/e2e/visual-edit/record-command.mjs gate
# 独立组合目录准备后执行，不可与同工作树其他 Maven/E2E 并发
node tests/e2e/visual-edit/record-command.mjs integration
node tests/e2e/visual-edit/export-evidence.mjs
```

记录器移除模型凭据并固定deterministic-mock，保留实际native退出码、signal、时间、HEAD/工作树变化和日志SHA256。
API/gate/integration完整日志在 `.local-data/d14-b/`，公开证据仅摘要；UI日志和截图可直接复核。
任何未结束运行都标UNKNOWN；失败记录保留。状态与候选见 `docs/handoffs/D14-B.md`。

客户端沿用服务器解析的 `SOURCE_FILE/shared:true`，写请求只有基版本、prompt和三字段selection。
不发送路径、实例权限、发布/恢复指令；日志/源码按文本展示。A的新增恢复API不属于本卡UI接口依赖，
公共OpenAPI登记及最终启用/正式批准由维护者处理。
