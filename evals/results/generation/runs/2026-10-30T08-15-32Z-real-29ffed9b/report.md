# D21-A 生成评测报告 2026-10-30T08-15-32Z-real-29ffed9b

由 `scripts/eval/report.mjs#v2` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`fb79c402de6b66bc849e87b6880bf955488f8032`（IN_PLACE）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 13，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**6/9**（66.7%）
- 3 轮内最终成功（平台 READY）：**7/9**（77.8%）；目标 ≥8/9：未达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无；样本进程异常（不计成功）：无
- 修复：共 1 轮，1 个样本发生修复
- 实际 token：136477；输入 117084 / 输出 19393；已知下限 输入 117084 / 输出 19393；缓存命中（已含在输入中）70400
- 运行时预算计费（含保守估算，非实际用量）：136477，估算调用 0
- 模型请求 37，工具槽 44；耗时中位数 25.4 s，最大 33.6 s（已知 9，未知 0）
- 失败类型：MODEL_OUTPUT×2

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | 0db85dbc-3d43-4409-b361-2e5d1ca66ed6 | VERIFIED | READY | 0 | — | 4 | 12532 | 24.9 s |
| SHOW-02 | SHOWCASE | 5f5ce810-8f3e-4258-a05d-bc7f37dc9631 | FAILED | READY | 1 | — | 4 | 14010 | 33.6 s |
| SHOW-03 | SHOWCASE | 8f83402f-df0c-4550-bb77-30a30d3d7204 | VERIFIED | READY | 0 | — | 5 | 18093 | 25.4 s |
| TASK-01 | TASKS | f1a5c15e-088e-42ba-9119-d9c151a0c879 | VERIFIED | READY | 0 | — | 4 | 14215 | 22.5 s |
| TASK-02 | TASKS | bb4501fa-b19b-4753-b4d8-2862cb58e116 | NONE | FAILED | 0 | MODEL_OUTPUT / MODEL_INVALID_RESPONSE | 3 | 9838 | 9.5 s |
| TASK-03 | TASKS | fb95b253-52d8-4c3f-ba69-a6ae96665be9 | VERIFIED | READY | 0 | — | 5 | 20832 | 30.0 s |
| CAT-01 | CATALOG | e2eec89d-4cd9-4ca1-a48c-a09e77551e2e | NONE | FAILED | 0 | MODEL_OUTPUT / MODEL_INVALID_RESPONSE | 1 | 1795 | 3.0 s |
| CAT-02 | CATALOG | 6b986e9b-4ede-4a81-897d-78a0c3596d6c | VERIFIED | READY | 0 | — | 5 | 20753 | 29.5 s |
| CAT-03 | CATALOG | 4ac79e37-046a-4aeb-8490-b273f6381aae | VERIFIED | READY | 0 | — | 6 | 24409 | 31.7 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**1/3**；环境故障按预期停止：**0/2**
- 故障集实际 token：≥35756（3 次未知，1 个样本无任务记录，1 个样本无调用记录）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：PASSED

任务 a13ce4ce-a02b-49f0-aa98-47cf1acef4a0；最终 READY；修复轮 1；失败 —

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

### FAULT-CODE-02（CODE / STRICT_TYPE_ERROR，基于 TASK-01）：FAILED

任务 474ba000-6f04-48e8-b3a8-d865f9e16632；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_UNAVAILABLE

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | null | **未通过** |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | null | **未通过** |
| first verify | "FAILED" | "NONE" | **未通过** |
| first failure category | "CODE" | null | **未通过** |
| first decision | "REPAIR" | null | **未通过** |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 0 | **未通过** |
| acceptance actions unchanged | true | false | **未通过** |
| final source differs from injected source | true | false | **未通过** |

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：FAILED

任务 9a0db6bc-c8d2-4efd-bcef-2a757546d1f2；最终 FAILED；修复轮 2；失败 MODEL_TRANSPORT / MODEL_UNAVAILABLE

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
| repair rounds | "1..3" | 2 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-ENV-01（ENVIRONMENT / CONTAINER_CLI_UNAVAILABLE，基于 SHOW-02）：FAILED

任务 914d003c-db7b-401f-8444-3ae7b06ebd19；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_UNAVAILABLE

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| container CLI absent in sample JVM | false | false | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure stage | "VERIFY" | "PLAN" | **未通过** |
| failure category | "INFRASTRUCTURE" | "MODEL_INTERFACE" | **未通过** |
| no REPAIR decision | true | true | 通过 |
| repair rounds | 0 | 0 | 通过 |
| REPAIR model calls | 0 | 0 | 通过 |
| immutable candidates | 1 | 0 | **未通过** |
| file tool calls after failure | 0 | 0 | 通过 |

### FAULT-ENV-02（ENVIRONMENT / MODEL_ENDPOINT_UNREACHABLE，基于 TASK-02）：MISSING

任务 —；最终 MISSING；修复轮 —；失败 HARNESS / —

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "LAUNCH_ERROR" | **未通过** |
| record present with task | true | false | **未通过** |

## 一致性核对

评测计算的模型请求数、工具槽与预算计费均与平台日志计量一致。


## 输入文件摘要

- `batch-complete.json` sha256:0e1912410a55c1ad538c62d40d65d424fbac6c873b7098097d7f8fb7f389bbb7
- `batch.json` sha256:4c7b1a6e5bed2d8fa5245d3d56c9937ed4ebae5c913b894e276624c5a115cd56
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:6c7ef31e9f3e0f8045915990c0a9355faa5a6be5925a298e375a1a8b0d0f3bd0
- `samples/CAT-01/record.json` sha256:da8a01ca2f72e4028a5409d845c159e5c3ebfa06df474d87aa5ad94943326b54
- `samples/CAT-01/spec.json` sha256:b4715d8f9d567e04937085da519f21e978e030878b4098136c92d7a653c655cb
- `samples/CAT-02/invocation-result.json` sha256:4dda01d10ddbc28ac3e35aa040984d44b4b37da77cdc513bb2717f1e85fdc939
- `samples/CAT-02/record.json` sha256:a108013bc850664e51da4181ef95afd70a1a53cce5e0f58bc3d590b00ba75a98
- `samples/CAT-02/spec.json` sha256:91e063a3aef5d8e576131db1926846cafc4806e0072a2e1339f0b4c385ecc588
- `samples/CAT-03/invocation-result.json` sha256:0fb0db6de7a6307e07a53c1defccb87e2e54f4fd11ed8bd3fc375ea7e984b1d7
- `samples/CAT-03/record.json` sha256:8bff031da45aa177f3f72c41150f2fac3a987faf982a7bdab0b39fcd017de9bb
- `samples/CAT-03/spec.json` sha256:ff4248c37a65db1a0519bb43cc59e1cd8091ea82af02df11a3267289d60cf1c1
- `samples/FAULT-CODE-01/invocation-result.json` sha256:e47eb22188db973358c85ab35095325e2a80e7888ec6c3f37bdc314d5f64f617
- `samples/FAULT-CODE-01/record.json` sha256:a91cdee09df23ea5ee7db0ba597abc4c026a784a3c4fb3c8de50c82c2ba7187a
- `samples/FAULT-CODE-01/spec.json` sha256:6263f6c73a2fb9f3f00cb42fe52dc35b6e11dd4cfd8c9dd004e1ea30dd02c3f1
- `samples/FAULT-CODE-02/invocation-result.json` sha256:9bbaec9a9cafe6a782bde332a7bb81b55fd04ed955aedd18487cf89703a23009
- `samples/FAULT-CODE-02/record.json` sha256:25e632ced0cd5f4a2a9ae68ce15b3507007623652bd1a3e9879f24092d54c6d7
- `samples/FAULT-CODE-02/spec.json` sha256:2460e4d30f1e8718da1703e0eda07adc445f8d610a69166711347d7c41d36c76
- `samples/FAULT-CODE-03/invocation-result.json` sha256:2ae81af580be01a51182631211d8cf8ddb6bbdb5411fcd966a468627101646d0
- `samples/FAULT-CODE-03/record.json` sha256:5e60184afaa36510f539d677ed679c715efe053f098d2f3b1ff784aa1bdca1b5
- `samples/FAULT-CODE-03/spec.json` sha256:3ae014f34094919a5d58ad6a9de28acd49cc56afaf0ff3ca9449274971c3c9e5
- `samples/FAULT-ENV-01/invocation-result.json` sha256:d92f94d957cf33ce0e94f1a9ad0be5dd08165954417ef461939c6fa930592def
- `samples/FAULT-ENV-01/record.json` sha256:93f4285cec7d09951b96e5fd8d78324fdfb07a1f98770579721e1c6e4a1798f9
- `samples/FAULT-ENV-01/spec.json` sha256:3b327405e215c6bfc7b4d507803a100c1ed517761788dbb62e643e70ae97e3ef
- `samples/FAULT-ENV-02/invocation-result.json` sha256:91c5c977a5e95a94e95a166e711feac6bd7ef2983015516624a61e1f6c1dd1d0
- `samples/FAULT-ENV-02/spec.json` sha256:cffaedde4d435702aa26d54d623d7fbb1fa35d4a3144f9a348774119b8409785
- `samples/SHOW-01/invocation-result.json` sha256:60931036c42bcee40980c07c88c551c8bd7ba48d6f67a66af18954d74d476889
- `samples/SHOW-01/record.json` sha256:0a1c9109ac05becde5c96a7d098eb5b06cc208edaaf7c2e64277dc242a098648
- `samples/SHOW-01/spec.json` sha256:524f400d54b2cbb0e4751b04c8c4412d7e9d752cec3029269a96a27d0c07b2bd
- `samples/SHOW-02/invocation-result.json` sha256:a0fb8e7cf24144c2202c81b471816a0946f444ace36813c7c36d74a61fc2cbee
- `samples/SHOW-02/record.json` sha256:a14e50b8d0be6081d55aab64b8347686f46281ecc718f9866c3467a6c5e1dd08
- `samples/SHOW-02/spec.json` sha256:5edecd54f982f8bd976d057edf5f9e2d5162b6a7263e034e93a40cd3d61ae1e3
- `samples/SHOW-03/invocation-result.json` sha256:593537412b0b05762dee1615b62532bcc8a88f7edd3e11f2f347cf1387857c4b
- `samples/SHOW-03/record.json` sha256:60467c3979afd03bfcb8b3292772eb8f8a7d0cdf9fc14472e629343cc7494395
- `samples/SHOW-03/spec.json` sha256:162c573b5d19e594014105595b6f3ce7f0dccee659b0bb97f1c82c3882d2c095
- `samples/TASK-01/invocation-result.json` sha256:120412adbf02105ec1a541c10b7d231776b5291bcc83991928780f410d775d83
- `samples/TASK-01/record.json` sha256:c4cc167f05b4fcae2d27e3fef7f10698e4b886b16efde603103c6ba19f13806f
- `samples/TASK-01/spec.json` sha256:b47414f4bb2f5cb6fbc04781bb5ff28998b66d175866edbe918bb1c73729a931
- `samples/TASK-02/invocation-result.json` sha256:dd0b17b951e8ea7b6f686a996a58d39c3c798837009820b22267dc663df8ebaa
- `samples/TASK-02/record.json` sha256:1587d3e292d2e8a77ee38ff8a2f76f4095cb57e8d814dc95c4081bbb018e9428
- `samples/TASK-02/spec.json` sha256:62fde86ac2e3a9e42009d7a6c7e609af7fc6f0d42dbf1f3372907134e09691b4
- `samples/TASK-03/invocation-result.json` sha256:c32b4415c84f288fe4da071aabc2decfcf1107dec3153d09b06ea4fc1c343c9a
- `samples/TASK-03/record.json` sha256:ec18f7e5333904020f6522e310847a7c47a8e4af0d75664a371bce7c575d0752
- `samples/TASK-03/spec.json` sha256:7f25d89b89e4e9f23e633b79e12933bf51e568822ce306cb18efc700cbc8c286
