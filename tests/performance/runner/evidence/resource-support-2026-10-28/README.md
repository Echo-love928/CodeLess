# B资源配合：真实Linux验证

这是B为A真实模型测量准备的只读旁路工具验证，**没有执行真实模型请求或公共契约修改**。完整使用/结果归属说明见`docs/handoffs/D22-B-support-A.md`，最终批准及合并仍由用户决定。

- 最终真实验证原生0，13条资源快照：所选进程真实CPU增长198 ticks，96MiB cgroup达到实际OOM、Docker OOMKilled及`oom_kill>0`，采样读窗口结束早于guardian确认释放；容器真实exit137，之后观察到REMOVED和临时目录ABSENT，自有对象回收无错误。
- Linux边界测试8/8、native0、无跳过；Windows同一测试集因本机不允许创建符号链接有1项跳过，Linux已实际覆盖。首轮本地默认沙盒Temp不可写的错误也保留在开发记录，随后将测试fixture明确放入工作区，没有放宽断言。
- 首轮采样器为INCOMPLETE、验证为FAILED：Docker对已删容器返回空行及小写`no such object`，当时被当作JSON解码失败。按真实响应增加回归，验证修复前失败、修复后通过。权限拒绝和Docker超时仍为UNKNOWN，不能当成回收成功。首轮FAILED及原始快照保留，未改写。
- `attempt-02-passed`保留兼容性修正后的通过；最终`attempt-03-final`另加完整采样读窗口和源码SHA绑定后再次验证，没有扩大压力、预算或业务截止。

原始快照直接来自只输出白名单字段的采样器，不含主机地址/主机名/SSH身份/部署目录、进程命令或环境、Docker Env/挂载/标签。公开清单绑定18份原样文件；47份完整私有材料（含命令日志、各版源码）全部SHA256匹配，私有归档摘要见manifest，原始命令不发布。

采样器的`COMPLETE`不等于业务通过：`workloadResult=NOT_EVALUATED`、`modelProvider=NOT_OBSERVED`、`modelRequests=NOT_MEASURED`故意保留。本验证脚本明确只有固定CPU/OOM fixture，所以脚本记录0付费模型请求；A实际模型测量不能复用这个0。cgroup统计是整个进程组，不能归因成单PID或集群总量。

```sh
python3 tests/performance/runner/resource-monitor.test.py
python3 tests/performance/runner/resource-monitor-smoke.py \
  --repo "$isolated_repo" --out "$new_private_run_directory"
node --test tests/performance/runner/resource-monitor.test.mjs
```

真实压力验证只在获授权且具Docker权限的Linux独占工作区运行；它读取既有受控fault fixture，使用本轮唯一镜像/容器并回收，不启动API、不访问模型配置、不替代A的真实模型吞吐或API查询测试。
