# evals/generation（D21-A 维护）

真实模型生成/修复评测的冻结输入与原始记录。方法、口径与命令见 [docs/evaluation-method.md](../../docs/evaluation-method.md)。

| 路径 | 说明 |
| --- | --- |
| `requirements.json` | 冻结的 9 个需求（每类 3 个），原始提示词按字节发送 |
| `faults.json` | 冻结的 3 个代码故障 + 2 个环境故障，全部标注为主机注入 |
| `run-config.json` | provider、运行时预算、尝试策略、隔离与计量口径 |
| `runs/<batchId>/` | 每个 REAL 批次一个目录，只追加，不删除、不覆盖；重跑只能是新批次 |

批次目录：

```text
batch.json                 计划分母、HEAD、冻结副本摘要、代码摘要（先于样本写入）
frozen/*.json              冻结文件按字节副本
preflight-N.json           Docker/镜像/Chromium/编译预检
samples/<id>/spec.json     发给 harness 的样本输入（含冻结需求与故障原文）
samples/<id>/invocation.json, invocation-result.json   单次进程的开始/结束、退出码、私有日志摘要
samples/<id>/record.json   harness 原始记录（SQL 真值、模型审计、任务日志、注入证据、环境探测）
samples/<id>/source/v<N>/  每个不可变候选的源码；screenshots/ 平台浏览器验证截图
batch-events.jsonl         每个样本一行，只追加
batch-complete.json        全部样本结束 + 凭据字节扫描结果
report.json, report.md     由 scripts/eval/report.mjs 从以上原始文件计算，可 --check 复算
```

dry run（`--mode mock`）只写入 `.local-data/d21-a/mock-runs/`，不属于本目录，也不进入任何统计。
