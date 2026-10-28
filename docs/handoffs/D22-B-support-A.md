# D22：B交付给A的部署与runner测量配合

B负责部署资源、runner干扰与证据支持；A负责真实模型请求、API容量结论及公共契约同步。最终批准和是否合并由用户决定，A可只读核验。本次不启动真实模型调用、不读取模型配置或密钥、不修改A分支/公共契约、不切换线上服务。

## B已交付

- `tests/performance/runner/resource-monitor.py`：Linux只读旁路采样，可附挂到A已启动的隔离API/worker PID。每条记录有UTC和Linux CLOCK_MONOTONIC纳秒读窗口、进程身份/CPU ticks/RSS、cgroup CPU/内存/peak/OOM/PID限制、宿主资源及可选临时目录计数。可读取明确提供的完整容器ID，记录实际Docker状态、限制和cgroup，不枚举其他业务容器。
- `resource-monitor-smoke.py`：在独占目录验证真实CPU增长、96MiB cgroup OOM、确认后释放guardian、容器回收和临时目录消失；压力容器无网络、非root、只读rootfs、1 CPU/128 PID/无额外capability。容器与镜像命名唯一，结束只回收本轮对象，不扩大生产权限。
- `resource-monitor.test.py`及既有runner入口：覆盖PID复用、未知值、拒绝凭据/命令/挂载信息输出、Docker权限失败与真实不存在的区别、临时目录链接不跟随。Linux真实验证及原始匿名快照见本卡的资源配合证据目录；原部署机Mock校准仍单独保留。
- 既有`api-isolation.mjs`继续用于自建Mock API的回归，**不能拿它替换A的真实模型API测量**。新旁路采样器不会改变A的provider、进程、数据库、资源上限或任何公共字段。

## A接入时提供的信息

只需隔离API/worker的PID、唯一run ID、允许观察的临时根目录，以及确有runner作业时的本轮完整容器ID。B不需要模型密钥、cookie或prompt。真实模型配置的受保护位置、请求/费用预算及付费调用仍由A向用户确认并执行。

在目标Linux机的A+B隔离工作区运行，例如：

```sh
# api_pid由A从自己启动的API进程/独占systemd单元取得；不要附挂无关服务。
# resource_run必须是本轮新目录，日志/输出放受保护目录，不复用已有证据。
python3 tests/performance/runner/resource-monitor.py \
  --pid "$api_pid" \
  --out "$resource_run/resources" \
  --interval 0.5 --duration 300 \
  --stop-file "$resource_run/stop"
```

A将该命令作为独立旁路进程启动。等待`resources/ready.json`且确认采样进程仍运行后，再执行已批准的真实模型测量；无论业务成功或失败，都在finally创建`stop`，等待采样进程结束并分别保存**业务原生退出码和采样原生退出码**，最后再停止API。300秒为默认观测预算，可在1–1800秒范围内显式设置，不据此修改业务/provider/runner截止。

如需要runner容器与临时目录的旁路观察，追加：

```sh
  --containers-file "$resource_run/container-ids" \
  --scratch "$owned_runner_temporary_root"
```

`container-ids`每行一个本轮完整64位小写hex ID，最多16个；由A/B可信宿主在获得真实容器ID后，用临时文件加原子rename更新。文件可在第一次作业前不存在。临时目录只做有界元数据计数，不读内容、不删除文件、不跟随链接；不要把保留已验证版本/历史证据的目录作为“应清零”目录。

## 结果合并口径

- `COMPLETE`仅表示旁路采样完成，`workloadResult=NOT_EVALUATED`、`modelRequests=NOT_MEASURED`保持原样；A必须用自己的真实调用、HTTP/数据库结果和预算账本判断业务是否通过。缺失指标为null，unlimited为`max`，不能改成0。
- cgroup统计覆盖整个进程组，可能包含采样器或其他进程；进程RSS只属于所选PID。先明确A使用的独占单元/进程组，再归属资源峰值，不叠加同一cgroup的重复统计，不把单API进程槽位当集群总量。
- PID用启动ticks绑定；PID被复用、Docker权限/查询失败、指标不完整均保留为INCOMPLETE/UNKNOWN，不能冒充进程/容器已清理。进程自然退出也不会产生虚构的0内存样本。
- `ready.json`只证明采样器取得首条记录，不能证明CPU压力、OOM或真实模型调用已经开始。CPU/OOM压力仍使用既有实际进程/用量增长和Docker OOM+cgroup屏障；请求开始须晚于屏障读取结束，若声称与运行中压力重叠，还须早于实际释放/停止事件。
- 每条快照是`[monotonicNs, completedMonotonicNs]`的非原子读窗口。A的请求/模型区间应保留UTC及同源Linux单调时钟；不能比较不同进程的`performance.now()`。Java/Node时钟若未验证同源，只能用UTC并说明精度，不能凭数值直接证明重叠。采样不覆盖两次快照之间的所有瞬时峰值。
- `manifest.json`绑定原始JSONL/summary/ready的实际字节；失败、不完整及取消轮次全部保留。发布时沿用用户已授权的匿名口径，不发布主机地址、SSH身份、部署目录、凭据或原始命令日志。

## B对契约同步的配合核对

已只读核对A当前f1c9be7：`TaskTiming.runnerDurations`消费现有`build.createdAt/completedAt`与`verification.startedAt/completedAt`，缺失/无效时间保留unknown；B无需新增runner公共字段。A的OpenAPI提案为任务、普通编辑和组件编辑三个POST各补429/503，共6个增量，不改变runner协议。`validate-contracts.mjs runner`已通过，来源和提案SHA见资源配合证据目录`compatibility.json`。B没有代替A应用公共契约补丁，也没有将CLI trial接入Java。

## 尚由A执行

A使用已批准的真实模型配置和预算，实测并发、排队、拒绝、取消、失败释放及普通查询；将B资源快照与自己的原始请求时间线按run ID和时钟关联。A推进429/503公共契约同步，并在最后启用功能的PR汇总真实模型结果、所用B提交及来源摘要。B这份交付不声明真实模型吞吐、质量、多实例总容量或线上公网验收通过。
