任务ID：D22-A。默认等待队列固定为32、单用户活动任务16、单应用8，普通生成与编辑在同一入队事务里原子检查；模型每API进程2个调用，满载立即拒绝，取消但尚未返回的调用继续占位。幂等重放不新增任务/事件或消耗容量。保留租约、预算、真实构建/浏览器和不可变版本要求。

增加排队、业务、provider、runner包络及验真回执构建/浏览器计时；缺失、非法或溢出仍为未知。没有增加worker、缓存或中间件。

- **公共契约已落地到本PR**：按用户本轮授权由A单一写入 `contracts/openapi.v0.json`，同步三个任务创建POST的六个429/503响应、实际错误码及容量Retry-After=1。编辑原有快照/存储503及其错误码保留，非容量503不强制该header。既有static入口新增契约正反断言，补丁与公共文件一致，不再仅保留提案。未改成功资源、认证或CSRF。
- **真实模型一次补验通过**：在既有部署机独占候选环境，使用生产BoundedModelProvider/DeepSeek/PLAN与真实HTTP/PG；single API JVM，手动claim控制并发，未切线上。`real-cc5e3cd7-bff5-4829-a204-b04eb920d16d` Maven/单元/SSH原生0、JUnit1/1。8次尝试中2次本地MODEL_CAPACITY_EXCEEDED，6次进入真实transport尝试（5返回、1计划内1ms超时）；取消后尚未结束的调用保留槽位，迟到回复不复活任务，超时后双槽并发复用。32个排队HTTP接受后第33个明确503。未为追绿重复真实批次。
- **样本与口径**：2逻辑CPU/4,106,088,448字节RAM；候选实读cgroup为1CPU/1.5GiB/swap0，PG0.5CPU/384MiB。真实30/30 HTTP查询都在provider包络内完成，p95=67.575777ms；6个包络p95=2609.020430ms，观察窗口7.391766452s，完成包络0.811714次/s，不能当完整应用生成吞吐或长期SLA。配置/响应model均deepseek-flash，官网当日映射V4.1-Flash-1017，响应未给不可变权重revision。明确MOCK准备批次另列，真实模型质量、多实例均未据此证明。
- **费用与隐私**：用户授权2元，最多8尝试的保守最坏预留<0.80元；本批尺寸预留0.14172元。5个已知回复input6560/output1016/total7576 tokens，按高峰价估算上界0.021248元；超时用量、真实总量与实际扣费UNKNOWN。密钥只经内存/SSH stdin/0600临时配置，结束删除；公开白名单派生数据与摘要，完整17文件原始归档及JUnit仅私有保存。测试容器回收，4个原线上容器仍running。
- **验证**：新增预算/缺报告/未知/脱敏与公共契约共9/9、native0；REAL与MOCK各17文件摘要、报告重算与实际单调钟独立审计native0；当前static native0（52个Node、199个前端、lint/typecheck/build）。原有十项容量验收默认继续由API gate发现；付费IT仅显式运行。最终精确HEAD四阶段及ci-gate另查，不继承旧success。旧本机API374/375的npm ECONNRESET、准备轮编译/Docker/JAVA_HOME/401失败均保留，不回填为通过。
- **B联调材料**：复核#74 `01aa4f9`已解除T2屏障问题；另核对`34f3901`部署机匿名报告摘要，B记录Mock容量10/10、runner4/4、资源80/80、两用户完整链路与账本专项通过，旧UNKNOWN失败保留。本方未冒称重跑B私有62文件归档。
- **剩余验收**：最后启用功能PR仍需以不可变A+B实际组合，完成真实模型自动PLAN→GENERATE→VERIFY→REPAIR/READY、runner干扰/SSE/取消/失败、用户发布和旧版本保留；生产网关慢客户端、线上切换后公网、长时间负载与多实例总量未由小样本覆盖。B的trial未自动接入Java；真实模型质量评测另账。最终批准及是否合并由用户决定，保持draft，未自批/未合并。

来源、原生命令、全部失败与边界：`docs/handoffs/D22-A.md` 当前补验节、`docs/performance-api.md`、`tests/performance/api/evidence/2026-10-28-real-capacity/`及各runId目录。无迁移、依赖升级、根锁或CI修改；生产回退仍为部署前一API版本，不能删除失败证据或历史任务。
