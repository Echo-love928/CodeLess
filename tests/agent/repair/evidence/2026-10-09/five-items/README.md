# D10-A 五项清单整改

`followup.json` 记录真实命令/退出码/私有完整日志摘要及72份artifact字节摘要。before-*保留整改前反例；after-*保留整改后。历史证据不重写。

- Windows进程17/17：原14项加root0/7退出后孙进程及截断查询；Job在挂起启动阶段绑定，统计全Job剩余0，不凭root退出宣告全树结束。
- 采样7/7：无归属/错nonce/错port/外来project/截断不探测；可信归属加外来目录只探测自身port；清理截断保持NULL并使成功collector转exit1。
- 导出9/9+原归属/解析/清理18/18：实际执行导出器，全失败/混合/非401/缺TLS/非DIRECT/截断/进程失败/正常/不可覆写均按输入判定；记录回放不发网络请求。
- Java准备4/4：实际Node进程，正常0/失败7/超时断言/中断标志保留，finally回收及有界等待。
- 正常平台1/1：模型明确mock，Docker/SQL/构建/Chromium与原签名预览实际执行，nonce/root/port/project一致，67个同ID关联，Job及私有project资源0。
- 实际父异常：harness0表示清理断言通过；实际parent1、被中断Maven未知、整链false，不作为平台成功。

本地完整gate exit0：API127/127、RepairLoop13、准备4、runner40、E2E33、static通过。旧环境失败仍UNKNOWN；原真实json_object任务修复次数0，真实协议效果/M1继续PAUSED_BY_USER/NOT_PASSED，新增付费真实调用0。开发tokenUNKNOWN；正常专项7/12/336为synthetic，故障用量NULL。

Windows/PowerShell7、锁定D01工具链和既有Docker下复现：

```powershell
node --test tests/agent/repair/collector-lifecycle.test.mjs
node --test tests/agent/repair/collector-sampling.test.mjs
node --test tests/agent/repair/export-diagnostics.test.mjs tests/agent/repair/collector-owner.test.mjs tests/agent/repair/preview-http-observe.test.mjs tests/agent/repair/preview-http-cleanup.test.mjs
services/api/mvnw.cmd -f services/api/pom.xml -Dtest=PreparationProcessTest test
pwsh -NoProfile -File tests/agent/repair/capture-platform-network.ps1 -LogDirectory .local-data/d10-a/review-five-normal
pwsh -NoProfile -File tests/agent/repair/fixtures/collector-real-interrupt.ps1 -LogDirectory .local-data/d10-a/review-five-fault
```
