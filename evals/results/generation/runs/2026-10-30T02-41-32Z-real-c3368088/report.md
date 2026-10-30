# D21-A 生成评测报告 2026-10-30T02-41-32Z-real-c3368088

由 `scripts/eval/report.mjs#v2` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`165e31c0fec532fc910396257b8d468499ae91e3`（IN_PLACE）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 14，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**6/9**（66.7%）
- 3 轮内最终成功（平台 READY）：**6/9**（66.7%）；目标 ≥8/9：未达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无；样本进程异常（不计成功）：无
- 修复：共 6 轮，2 个样本发生修复
- 实际 token：197695；输入 168677 / 输出 29018；已知下限 输入 168677 / 输出 29018；缓存命中（已含在输入中）101760
- 运行时预算计费（含保守估算，非实际用量）：197695，估算调用 0
- 模型请求 47，工具槽 69；耗时中位数 20.7 s，最大 78.0 s（已知 9，未知 0）
- 失败类型：MODEL_OUTPUT×1，CODE_NOT_REPAIRED×2

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | 834cde11-29ed-4b10-be20-b14ced970827 | VERIFIED | READY | 0 | — | 3 | 9968 | 15.7 s |
| SHOW-02 | SHOWCASE | 81fd8b5b-79a8-4cb6-a1e8-7b87d248f9fb | VERIFIED | READY | 0 | — | 3 | 10247 | 16.3 s |
| SHOW-03 | SHOWCASE | 939e6d74-8e1d-4049-bcb1-093f567994e8 | VERIFIED | READY | 0 | — | 7 | 31010 | 27.1 s |
| TASK-01 | TASKS | 83021c98-fb2d-4cef-88e2-ce4472ad031a | VERIFIED | READY | 0 | — | 4 | 15463 | 20.0 s |
| TASK-02 | TASKS | 4cd5e652-7819-4257-b89c-a75a42f11bcc | NONE | FAILED | 0 | MODEL_OUTPUT / MODEL_INVALID_RESPONSE | 3 | 12740 | 16.8 s |
| TASK-03 | TASKS | 56ee328e-6ddc-45ff-9b96-2508bff89e28 | VERIFIED | READY | 0 | — | 4 | 15622 | 20.7 s |
| CAT-01 | CATALOG | f3e58518-8d21-4880-9b87-cb8640e91e23 | VERIFIED | READY | 0 | — | 4 | 16296 | 21.7 s |
| CAT-02 | CATALOG | 91325f70-06ac-469e-affa-9f7c54fbf3ed | FAILED | FAILED | 3 | CODE_NOT_REPAIRED / AGENT_REPAIR_LIMIT_EXCEEDED | 10 | 44093 | 66.0 s |
| CAT-03 | CATALOG | 21600bc8-53fa-47e6-b6cb-0cf34005777d | FAILED | FAILED | 3 | CODE_NOT_REPAIRED / AGENT_REPAIR_LIMIT_EXCEEDED | 9 | 42256 | 78.0 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**2/3**；环境故障按预期停止：**2/2**
- 故障集实际 token：≥88800（1 次未知）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：PASSED

任务 97b7d2c2-e08e-46ff-ae45-17c1dc97566b；最终 READY；修复轮 1；失败 —

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "READY" | 通过 |
| repair rounds | "1..3" | 1 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-CODE-02（CODE / STRICT_TYPE_ERROR，基于 TASK-01）：PASSED

任务 b73c64a1-0040-4833-9ff5-44752add51e4；最终 READY；修复轮 2；失败 —

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "READY" | 通过 |
| repair rounds | "1..3" | 2 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：FAILED

任务 8bd029d5-4e2b-43e6-b903-02083e4c3aca；最终 FAILED；修复轮 3；失败 CODE_NOT_REPAIRED / AGENT_REPAIR_LIMIT_EXCEEDED

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 3 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-ENV-01（ENVIRONMENT / CONTAINER_CLI_UNAVAILABLE，基于 SHOW-02）：PASSED

任务 1c460d31-c579-4c0a-a4aa-26be35e33e31；最终 FAILED；修复轮 0；失败 ENVIRONMENT / AGENT_RUNNER_UNAVAILABLE

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| container CLI absent in sample JVM | false | false | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure stage | "VERIFY" | "VERIFY" | 通过 |
| failure category | "INFRASTRUCTURE" | "INFRASTRUCTURE" | 通过 |
| no REPAIR decision | true | true | 通过 |
| repair rounds | 0 | 0 | 通过 |
| REPAIR model calls | 0 | 0 | 通过 |
| immutable candidates | 1 | 1 | 通过 |
| file tool calls after failure | 0 | 0 | 通过 |

### FAULT-ENV-02（ENVIRONMENT / MODEL_ENDPOINT_UNREACHABLE，基于 TASK-02）：PASSED

任务 e3a04d65-b8af-4c70-aa13-2e58077d7f6a；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| proxy route refused before task | "REFUSED" | "REFUSED" | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure code | "MODEL_NETWORK" | "MODEL_NETWORK" | 通过 |
| failure category | "MODEL_INTERFACE" | "MODEL_INTERFACE" | 通过 |
| model calls (no retry) | 1 | 1 | 通过 |
| failed call usage | "UNKNOWN" | "UNKNOWN" | 通过 |
| file tool calls | 0 | 0 | 通过 |
| repair rounds | 0 | 0 | 通过 |

## 一致性核对

评测计算的模型请求数、工具槽与预算计费均与平台日志计量一致。


## 输入文件摘要

- `batch-complete.json` sha256:d5eb7949b975f08f8397d96e4328389848728753f2d876ca3e199a49b5dde687
- `batch.json` sha256:820cd950e5a63d95f79f416b4be8932828527fed496a5194ecbf423067e8ae7d
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:c6aa6b86fb9812a6d1b9a9683f5199bad9acbe6dc7f250a306e2102d9c19dcd7
- `samples/CAT-01/record.json` sha256:94112cd3d084d0d5c18b1ebb886cb4d8efdd51e131a0ca9caf8b00a10f028615
- `samples/CAT-01/spec.json` sha256:23cc00865b7f1a667024d0009c3ae52a51b692ba399dc22b9cd13cbdd1e6747e
- `samples/CAT-02/invocation-result.json` sha256:057a307ea15969ff6ad8e7ba4592af857e9894c6031c3b3d155753f8465d2772
- `samples/CAT-02/record.json` sha256:6c7fd0e1df7a96489cdd7db0f74b2aefdaf1078d10af722dd69f226cc653b312
- `samples/CAT-02/spec.json` sha256:505c0157005ae1825a568638959cbc951e54da4536795f4be99b5cc5aa8f16d0
- `samples/CAT-03/invocation-result.json` sha256:60593e0654ac948ea988829dc0d6510ce491437c0c3bd674679607ed7d389df7
- `samples/CAT-03/record.json` sha256:3f1e83318e9ac21500d3e6090adec9a5156c64fb4f43a669dbee84c4d4162a79
- `samples/CAT-03/spec.json` sha256:3a9fc88501d8be4e0b917197dfd2ea752b03916cf8d6968e3d3dbf9a40153c70
- `samples/FAULT-CODE-01/invocation-result.json` sha256:c6cc1bc2d795cab012041dafbfdb5e6181b878448d3c53a5a1064f15dfffda3c
- `samples/FAULT-CODE-01/record.json` sha256:22538298d87507fa1a7155f255b8fac59a3be79d82b138910456f327bb0b8037
- `samples/FAULT-CODE-01/spec.json` sha256:6101ffd1d287663c93f53be823fab153d65bdfb093ec29960b37fac64c6f1967
- `samples/FAULT-CODE-02/invocation-result.json` sha256:2cf88268ca2adeb88f8b78391b2b52f86b62c137fd80436d2a8611b8c837e05f
- `samples/FAULT-CODE-02/record.json` sha256:51766b02b2acbf8a56cec4058b44ce4a62ca64a972fb6cd013fd30f169ddc554
- `samples/FAULT-CODE-02/spec.json` sha256:6b3d9c73144ee809273a21c531390943de72a3257bbdcbd9f9f267a66cc35062
- `samples/FAULT-CODE-03/invocation-result.json` sha256:a0321edd01fb0a02b995496dd98d27633fcb46cc3a69e9733da778db3c41e58a
- `samples/FAULT-CODE-03/record.json` sha256:755f737ba43c5cb9b9d4b1fd44fea7e3139890b2acc7bc8a11ba113f8862863b
- `samples/FAULT-CODE-03/spec.json` sha256:c75cd4c5308e422203e244b32de80c5f7474ce4ad01eb132cab373640f2d7a29
- `samples/FAULT-ENV-01/invocation-result.json` sha256:412bb953fc767328e37eff74d71f76d6da294865b3c6b00fa3e02a7871a370e2
- `samples/FAULT-ENV-01/record.json` sha256:51752f967ac7d6a3877e31b17e8758cb55f7804fea915d195fa3b00608a6deba
- `samples/FAULT-ENV-01/spec.json` sha256:cf61ae90f0da83b57caaca393c072cb1e3a326d650f1141c4e3208c848bfb057
- `samples/FAULT-ENV-02/invocation-result.json` sha256:0bbe6b07c481f42a48930a7eb1777372008954d9ef831e378e432aa3e6af2527
- `samples/FAULT-ENV-02/record.json` sha256:9ba8c3c878df93c6fef10ac6a6f08d573d71ac7cdf87a0c0e8bc0fb3cde653f4
- `samples/FAULT-ENV-02/spec.json` sha256:9a67952c487d98f95a7014f38fe2abd0bc591aeb6ca3b0b561a1e628a15008a8
- `samples/SHOW-01/invocation-result.json` sha256:41bb3d18be797f79beccf866c722268de89e08820d63e2852f862dcc6f6cc7c6
- `samples/SHOW-01/record.json` sha256:46360cd5220d90d6e14823467ff260b2f4a70340bd9a03cc95561ac7e19ec3d4
- `samples/SHOW-01/spec.json` sha256:d14a81e73a01a17c8cb6223194b3faa69d146cfcb40d001aac156891fff178ac
- `samples/SHOW-02/invocation-result.json` sha256:125bfa90c2747bcfcb54edda09f7f5b4879053b645c323cd8dd85a034212b369
- `samples/SHOW-02/record.json` sha256:b0a3477b75591b4d9ff29ad94999a41a315b488d85e2080747ff8f3471b9723e
- `samples/SHOW-02/spec.json` sha256:74cc2d324d3145fe7cb749fcb166ce8b4c23efe5006ab58d0db848e5f90d5298
- `samples/SHOW-03/invocation-result.json` sha256:01abd4d475694520adf4e472f6f34bc748e78b6977f285626c91381d61f9af7f
- `samples/SHOW-03/record.json` sha256:398fc23da5a90acbd058229af9182fd0a40a3e3b1cda10fec73c8b29d60a3a32
- `samples/SHOW-03/spec.json` sha256:7acf9b1c51252ca5d15f93e24943cdd60a10dae417261fd79000ef5d3c61d94f
- `samples/TASK-01/invocation-result.json` sha256:6f1291d054597818391a4dd9fb1b9d5d7bf55b45987588099be26a2467edb380
- `samples/TASK-01/record.json` sha256:2683743854404ade96c246f2c42e2fa119753c1307dde167e7ccb5590dd2fffa
- `samples/TASK-01/spec.json` sha256:c2a2cf92e5cfa89dbd2b847fd75c86917904e677b253a6d24ec2170e61477f95
- `samples/TASK-02/invocation-result.json` sha256:704b773141a639ba57da60a6592c6510a19f54c4dc6829398ccf66d5828094da
- `samples/TASK-02/record.json` sha256:c607cb3286c96f8081264e0289665081c46675e347fe56bb3449f266f297d388
- `samples/TASK-02/spec.json` sha256:e6f0eac31f06552d7437d91e5792ee0341e2a6f53db643333b5d233325970cc8
- `samples/TASK-03/invocation-result.json` sha256:f1b9bbf14ff69d6810867c71a58dc2bcfcdcc271fd1950a18acd9c3aa7781b21
- `samples/TASK-03/record.json` sha256:b6ce31488d841e96cefcaf24d285ac4675cf84d8501232a5c55f849cf0fd6dd4
- `samples/TASK-03/spec.json` sha256:36f5dd4343528fd2ff1af6c225b92afc7849e1d607bbd45b209d44a5a89fb613
