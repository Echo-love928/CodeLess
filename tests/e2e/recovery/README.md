# D18-B 恢复体验验收

从仓库根目录：

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
node tests/e2e/recovery/record-command.mjs static
node tests/e2e/recovery/record-command.mjs browser
node tests/e2e/recovery/record-command.mjs gate
```

锁定版本和Docker按根README准备。browser需先由static/build生成最新生产dist，使用仓库既有Playwright配置/Chromium，不增加重试、不放宽断言或超时。审查跟进后，`browser` 包含D18十一项及原发布七项；`gate`调用既有ci:gate，依次执行四类门禁。全量e2e自动扫描本目录flow.spec.ts。

fixture.ts明确是HTTP契约测试替身，复用既有D11版本fixture与D14预览选择fixture。任务Map/key记录器用于断言请求身份和旧对象保留，不等于PostgreSQL、服务重启、资源回收或真实模型证据。实际测试的是生产Vue构建与Chromium中的渲染/请求、原生键盘、iframe通信和布局。

T1：五类错误/未知码、503读取恢复、15秒真实挂起POST与发布回归。T2：新key新ID与旧任务深链；丢失响应刷新后同key同prompt/单任务。T3：Enter只换行、Ctrl+Enter提交，平台/iframe Esc回焦。T4：375px/横屏可见任务与iframe、无横溢、长日志全文和恶意标签不执行。

审查跟进另验证：运行中断连显示约一分钟后刷新核对的建议；恢复为权威FAILED/INTERRUPTED后提示消失，且没有额外POST或伪造成功。旧浏览器取消信号适配与取消网络错误后的显式重试/迟到结果由Vitest覆盖。最后启用PR的真实后端版本文案断言见INTEGRATION-CHECKLIST.md，不把HTTP fixture当组合联调证据。

每次执行生成独立 `.local-data/d18-b/<timestamp>-<mode>/command.log` 与 `run.json`，公开 `evidence/<run>/run.json` 记录原生命令/退出码/信号、源文件SHA256和日志摘要。门禁会重生成旧证据；记录器先保存所有已有受跟踪证据，结束时将本轮生成副本存入私有generated-history，再逐字节恢复旧证据，不删除失败或跳过测试。

公开截图在 `evidence/browser-screenshots`；旧成功轮截图仍在首轮run/screenshots。最终状态、异常轮和同日联调边界见 `docs/handoffs/D18-B.md`。真实模型调用与开发token分账，不能用fixture结果证明模型质量。
