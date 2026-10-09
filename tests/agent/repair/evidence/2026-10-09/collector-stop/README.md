# D10-A：父采集器停止与清理

`followup.json` 保存命令、真实退出码、完整私有日志路径/摘要、导出文件字节摘要及范围限制；文件保持原字节，旧 evidence 未改写。

- `before-*`：原 deb305e 父异常退出后的子孙存活事实，观察在 fixture 兜底清理之前。真实 Windows 进程，Docker 明确为桩。
- `after-*`：修复后14条生命周期回归；原1/7/Stopped与清理失败保留。归属及既有Node测试另18/18。
- `normal-*`：真实Docker/PostgreSQL/Chromium完整平台专项1/1、3样本、65个同ID匹配，真实资源全部清理。模型为 deterministic-mock，不证明真实模型效果。
- `real-interrupt-acceptance.json` / `fault-*`：确认私有实际 ingress 存活后，注入父异常。父exit1、子树停止、实际down0、全部容器/网络查询0且remaining0；回归harness0不等于被中断的平台/Maven通过。
- `ci-gate-excerpts.txt` / `current-filetools-cleanup-failure.txt`：完整本地gate失败；static/E2E的Windows异常退出和API的TempDir error不能转换为success。

复现环境：Windows + PowerShell7，D01锁定工具链，已有Docker Desktop、`.local-data/d07-a/env.ps1`；所有平台命令固定mock并移除真实模型凭据/批准变量。执行：

```powershell
node --test tests/agent/repair/collector-lifecycle.test.mjs
node --test tests/agent/repair/collector-owner.test.mjs tests/agent/repair/preview-http-observe.test.mjs tests/agent/repair/preview-http-cleanup.test.mjs
pwsh -NoProfile -File tests/agent/repair/capture-platform-network.ps1 -LogDirectory .local-data/d10-a/collector-review-normal
pwsh -NoProfile -File tests/agent/repair/fixtures/collector-real-interrupt.ps1 -LogDirectory .local-data/d10-a/collector-review-fault
```

600秒是collector循环检查阈值，包含有界操作和后续清理时不构成硬墙钟截止；强制原生杀父/断电无法执行finally，未声称覆盖。原平台预算和动作不变。历史Windows cleanup/TCP/TLS等根因仍UNKNOWN；真实M1继续PAUSED_BY_USER/NOT_PASSED，新增付费真实调用0，开发token计量UNKNOWN。
