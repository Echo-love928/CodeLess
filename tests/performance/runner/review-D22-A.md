# D22-A 只读互审

审查 [PR #75](https://github.com/Echo-love928/CodeLess/pull/75)，精确候选 `9c5cf47143810b27eee9666a13e1ba609d2698e3`，base `dcb3866`。读取生产差异、6项OpenAPI响应提案、方法/交接、原始前后样本及测试；在私有detached副本独立运行专项。没有修改A源码或分支，没有提交GitHub批准。

## 阻塞问题

本次代码检查和独立10项专项中未发现新的阻塞代码缺陷；这不是完整生产容量批准。以下合并/部署前置仍未完成：

- `tests/performance/api/openapi.patch.json` 的429/503及Retry-After响应增量仍需公共契约维护者同步。B不越权修改共享契约。
- A本地完整API的npm下载ECONNRESET失败与B本地既有失败应保留；远端旧success不替代最终HEAD检查。B的OOM测量屏障缺陷由本分支修复并补证，不反向视为A的实现问题。
- 本地组合验收不能代替生产硬件、公网模型或多实例总容量校准；不得据单进程2个模型槽位推断集群总量。

## 建议

- 部署说明继续明确queue=32是等待任务数量，user=16/app=8包含QUEUED+RUNNING；模型2槽位为每API进程。增加副本前统一限额并重新测量runner总量。
- `DefaultCapacityCalibrationTest`的100个满队列查询是服务层查询，30个普通查询及10个SSE才是真实HTTP测量；保留口径区别，不合并为140个HTTP样本。
- 小样本前后延迟只做描述。`summarize.mjs:8`拒绝非零退出码，`:15`检查同硬件，`:17`使用nearest-rank且不剔除样本；没有证据需要添加缓存或提高并发。

## 已核验内容

| 检查点 | 位置与结果 |
| --- | --- |
| 超限明确拒绝 | `CapacityPolicy.java:25`要求事务，`:32`使用1秒锁等待，`:50`起依次拒绝app/user/queue；`PlatformRepository.java:82`在共同入队位置调用，普通任务和编辑共用。幂等重放在入队前返回旧任务，不新增任务/事件。 |
| 模型有界且无等待队列 | `BoundedModelProvider.java:21`使用tryAcquire，`:24`在真实call返回/异常后释放；取消不提前释放。`ModelConfiguration.java:19`包装实际生产provider，未增加模型权限或返回虚构usage。 |
| 查询不被长模型阻塞 | `ApiCapacityMeasurementTest.java:97`逐个确认30个HTTP查询完成时provider仍未返回；10个SSE验证游标1后的完整sequence2帧。独立实测provider包络2697.0984ms；30查询、10SSE均保留，模型为明确慢Mock。 |
| 真实容量与失败路径 | 独立12个并发提交恰4个接受、8个TASK_QUEUE_FULL；锁等待1028.8759ms后TASK_ADMISSION_BUSY。出厂32/16/8、取消释放、模型槽位取消/异常和未知计时/usage均由10个专项实际覆盖。 |
| 机器与前后样本 | A原报告有同机30/10前后原样样本及硬件；独立复核运行额外记录i7-13650HX/20逻辑CPU/25,551,560,704字节RAM。不同机器数据不作因果对比。 |
| 范围/隔离 | 未见修改CI、锁、迁移、runner权限或根契约。计时只在回执验真后读构建/浏览器时间，缺失/非法/溢出保持null。 |

独立复现命令：在A精确副本、Java21/Node24.22.1下运行 `node tests/performance/api/record.mjs acceptance`，**native0、10/10、0 fail/error/skip**。A生产源码运行后diff为空。
本卡复制的原始命令/机器/源码摘要和5组样本：`evidence/peer-a/command.json`、`evidence/peer-a/samples/`。完整日志和JUnit留在 `.local-data/d22-a-review/tests/performance/api/evidence/2026-10-27T15-43-18.033Z-acceptance/`，未把A历史结果冒充本次独立重跑。
