# D22-B 只读互审

检查时间：2026-10-27（Asia/Tokyo）。审查 [PR #74](https://github.com/Echo-love928/CodeLess/pull/74)，精确提交 `a518d3bb7dbd2e5a3012c28ba09a54ac5043d0b3`，base `dcb3866`。只读审查，不修改 B 分支、不代替独立批准。

## 阻塞问题

1. **[P1，验收证据] 当前提交没有可复核的原始样本与精确候选门禁。** `git ls-tree -r --name-only a518d3b tests/performance/runner/evidence` 无输出；`docs/handoffs/D22-B.md:19–33` 只有开发轮数字，且明确写最终 gate 仍在运行。因此还不能核验 T1–T4 的运行结果、机器/inspect、原始失败及恢复清单。需要运行并提交 `export-evidence.mjs` 输出，以及当前候选的原生退出码、完整四阶段结果；不能借用开发轮成功。此项阻塞验收批准，属于当前 PR 明示的待补证据，不推断代码已经失败。

2. **[P2，测量覆盖] OOM 组的 API 样本没有保证覆盖 OOM 压力或确认 OOM 后。** `tests/performance/runner/api-isolation.mjs:65–75,85–94` 只在整组开始确认容器 Running，然后先完成 10 个请求，之后才 `observeOOM(id)`；`runningAtStart` 对 10 条样本重复同一次布尔值。容器已启动并不证明分配器已开始耗尽内存；若在故障 fixture 的内存分配前插入 500ms 延迟，这 10 个快速请求仍可全在无内存压力时完成，而稍后的真实 OOM 依然使整轮通过。这样不能用这些样本证明“真实 OOM 期间 API 未被拖死”。最小修复：按独立 cgroup/内存事件或明确开始压力信号建立测量屏障，并保留 API 样本与压力/事件的时间关系；在 OOM 确认及故障清理后各补直接查询。此项阻塞该 T2 结论，其他安全隔离未因此被否定。

只读材料在 `tests/performance/api/evidence/peer-pr.json`。本轮没有执行 B 的脚本或声称复现其资源数据；上面的反例是对测量屏障的确定性控制流检查。作者补证/修复后只重查变化和受影响的 T2。

## 建议

B 的交接须保留 taskId/executionId/sourceDigest、机器与 Docker CPU/内存限额、样本数、每个冷/暖构建的原始时序、退出码和清理结果。API 已从既有 runner receipt 读取 build.createdAt/completedAt、verification.startedAt/completedAt，无需扩展 runner 权限或新增字段。

## 已核验内容

已读取 12 个改动文件的 diff、交接、方法、专项测试和 API 干扰测量。已核验代码内容：

- `acceptance.test.mjs` 对每个精确 container/workspace 名确认清理，并检查 worker/browser PID 消失；成功产物由 harness 显式消费删除，文档没有冒充生产自动回收已验证版本。
- A→A→B→A 的 marker、摘要、四个 build UUID、source/build/artifact 回执绑定均有断言；只读镜像依赖复用与新 tmpfs/源码隔离的描述相符。
- `profiles.mjs` 的 trial 只收紧 60s/16KiB，原 policy 对 CPU/内存/PID/网络等上限继续有效，未知 profile/override 有拒绝断言；Java 白名单未擅自转发该环境变量。
- OOM 保持真实 cgroup/exit137，日志洪泛保留 exit7、400000 observed bytes 与 16384 retained bytes；失败不变成功，未增加构建重试。
- 浏览器计时按 phase 累计，进程标识只加入内部诊断；未改公共契约、平台权限、发布流程、模型凭据、根锁文件或 CI。
- 机器配置、样本数与失败保留在代码中有采集路径；实际原始数据和最终退出码尚待第 1 项补齐。没有把静态审查当作运行通过。

接手：D22-B 补原始报告并收紧 T2 时间屏障；最后启用功能 PR 承担 A+B 真实资源组合。最初查询未发现 PR 的记录已被 14:56Z 的新 PR 查询更新，不再列为当前阻塞。
