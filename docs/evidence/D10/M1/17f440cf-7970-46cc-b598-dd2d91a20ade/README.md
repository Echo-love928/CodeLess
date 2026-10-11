# M1真实验收：修复上下文整改后的协议失败

执行候选c9604e8d0ed298501a33c0eda11a8b12975ffbd6（A PR30）；B增量复审已核对专项24/24与额外边界3/3、真实fixture补丁/浏览器/签名预览，但未以其作为真实模型结果。本次日期2026-10-10，Asia/Shanghai；任务17f440cf-7970-46cc-b598-dd2d91a20ade；模型全部真实DeepSeek/deepseek-flash，唯一新任务，无外层重试。

实际终态FAILED/AGENT_MODEL_PROTOCOL_INVALID、M1 NOT_PASSED。初次真实构建exit2/TS2307后进入REPAIR，读取HomePage和ProfileCard各一次；第三次回复原文为`{"type":"json_object","error":"Invalid protocol reply."}`。协议只允许闭合tool/done，该原回复必须保留和拒绝；没有模型修复更新、done、第二候选、重建或签名预览。模型为何输出此对象的内部原因UNKNOWN，原HTTP请求体未抓包，不据此臆测transport或提示词根因。

## 证据与复核

- `acceptance.json`、`source/candidate-0/`：实际协议回复、完整usage、唯一故障候选、真实失败构建、原GEN actions与停止事件；SQL终态已捕获。`M1-run-record.md`为一段式结果及A整改记录。
- `protocol-audit.json`：REPAIR原回复和三个实际请求的预算可行性。各预留12,264/14,482/15,620；最后请求前charged24,910、余额25,090，预留后40,530<=50,000。最终charged28,515；本次没有AGENT_MODEL_BUDGET_EXCEEDED或重复读，但新成功/未触发不能关闭历史失败。
- `runtime-verification.json`、`junit-summary.json`：真实9请求/11工具/1轮，PLAN1/GENERATE5/REPAIR3，input26,947/output1,568/total28,515实测；JUnit1失败、Maven/外层exit1。模型传输全部SUCCEEDED只证明当次传输，不证明业务协议或真实M1效果。
- `commands.json`与`logs/`：实际命令、退出码、私有原日志摘要及脱敏副本。准备、Job/归属预检、编译exit0；付费验收exit1；原日志不改写。默认CI不选择Real*IT，新增提交门禁不会重新付费。
- `resource-cleanup.json`、`java-project-cleanup.json`、`process-result.json`、`orchestration-result.json`：独立关闭及实际可信项目down0/完整查询remaining0；原Node/native/Maven非零码保持。没有全局删除容器或杀进程。
- `historical-preservation.json`、`manifest.json`、`credential-scan.json`：703份跟踪旧证据和两个旧M1清单51项不变，新包字节绑定，当前模型密钥精确扫描不外发值。没有成功截图；失败在预览前发生，明确NOT_CAPTURED。

零付费复核可用本目录JSON和源码核对最后model.response及failure，查看三个请求的reserved/charged数字，并运行c9604e8原RepairPolicyTest/RepairLoopIntegrationTest的非法协议停止用例；不需要或授权再次执行RealRepairPreviewPlatformAcceptanceIT。当前完整原回复对象与早期单字段json_object不同，不能覆盖旧fixture/失败记录。

A需继续处理的文件位置：`services/api/src/main/resources/model/prompts/agent-proposal-protocol-v1.txt`、`prompts/runtime/repair/agent-repair-v1.txt`及`services/api/src/main/java/dev/codeless/api/agent/AgentLoop.java`/`AgentModel.java`的REPAIR输入、业务协议校验路径。先以本次真实响应/当前上下文做离线回归，定位原因再做最小修正；任何方案仍须保持原actions、保守预留、全部上限与原tool/done拒绝规则。此说明只交接，不在B证据提交里改A实现。

执行候选c9604e8六项远端普通门禁全部success，不能代替真实M1。本次独立文档/证据提交的新SHA门禁另查；维持草稿、未批准、未合并。历史TLS/504/TCP/cleanup/libuv/exit137等只按原证据处理。本次付费金额及开发token UNKNOWN，历史已付费usage分账，本次授权已使用，后续新任务需新授权。
