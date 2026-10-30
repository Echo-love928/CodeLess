# D21-A 生成评测报告 2026-10-30T02-28-18Z-real-f1960e81

由 `scripts/eval/report.mjs#v2` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`ad4c8f04ae6fd5857f5e32ccaedc709c4a088b54`（IN_PLACE）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 14，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**6/9**（66.7%）
- 3 轮内最终成功（平台 READY）：**6/9**（66.7%）；目标 ≥8/9：未达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无；样本进程异常（不计成功）：无
- 修复：共 4 轮，2 个样本发生修复
- 实际 token：216641；输入 187808 / 输出 28833；已知下限 输入 187808 / 输出 28833；缓存命中（已含在输入中）113280
- 运行时预算计费（含保守估算，非实际用量）：216641，估算调用 0
- 模型请求 50，工具槽 63；耗时中位数 19.4 s，最大 75.5 s（已知 9，未知 0）
- 失败类型：MODEL_OUTPUT×1，CODE_NOT_REPAIRED×1，BUDGET×1

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | bc192d7d-e3d8-4fe4-9ecf-3701d541e08c | VERIFIED | READY | 0 | — | 4 | 13977 | 18.4 s |
| SHOW-02 | SHOWCASE | 36510cac-0c03-4d1f-90df-4e13fd4208ee | VERIFIED | READY | 0 | — | 4 | 13883 | 16.2 s |
| SHOW-03 | SHOWCASE | 95187af2-fc52-4b3b-bd6d-da50c2c9acb7 | NONE | FAILED | 0 | BUDGET / AGENT_MODEL_BUDGET_EXCEEDED | 7 | 30966 | 18.6 s |
| TASK-01 | TASKS | b5cd1d44-e2f3-48d2-b31b-3e70cca18ce1 | VERIFIED | READY | 0 | — | 4 | 14949 | 18.8 s |
| TASK-02 | TASKS | 6598242e-39f0-49d7-b541-7a97924ab79d | FAILED | FAILED | 3 | CODE_NOT_REPAIRED / AGENT_REPAIR_LIMIT_EXCEEDED | 9 | 41705 | 75.5 s |
| TASK-03 | TASKS | 1c1d3e4b-1a49-4d92-ae33-8860c46ae037 | VERIFIED | READY | 0 | — | 4 | 15277 | 19.4 s |
| CAT-01 | CATALOG | 24c9dd3e-f43a-4a81-99d1-8211b0e18ee7 | VERIFIED | READY | 0 | — | 4 | 17204 | 23.1 s |
| CAT-02 | CATALOG | a676e49f-bb62-4fb0-8c70-f6cc7af64fe2 | VERIFIED | READY | 0 | — | 7 | 34418 | 31.9 s |
| CAT-03 | CATALOG | 0a2b0dfa-0785-48ad-897c-0c76d2441fed | FAILED | FAILED | 1 | MODEL_OUTPUT / AGENT_MODEL_PROTOCOL_INVALID | 7 | 34262 | 33.6 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**2/3**；环境故障按预期停止：**2/2**
- 故障集实际 token：≥83661（1 次未知）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：PASSED

任务 48ab6789-b02c-4aca-b393-4f53c5898df2；最终 READY；修复轮 1；失败 —

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

任务 12052f5e-8a51-4d85-9a8f-d6a0aa2468d1；最终 READY；修复轮 1；失败 —

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

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：FAILED

任务 92c2dd2c-8631-47c6-a2a0-de53b74d38d6；最终 FAILED；修复轮 3；失败 BUDGET / AGENT_MODEL_BUDGET_EXCEEDED

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

任务 8f0c0f14-43d1-41c7-8314-8eba3f192e12；最终 FAILED；修复轮 0；失败 ENVIRONMENT / AGENT_RUNNER_UNAVAILABLE

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

任务 8dab9cc7-a747-4e5e-ad06-d7cdfa9fde7e；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

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

- `batch-complete.json` sha256:28292c90474f5846a08ea362fb306c43ea8803f5ad137da0978c20982ed2f8fd
- `batch.json` sha256:b273647c352ba87d06c1ee274a7d6fc5b9e86314e1aee108347b75f5bf162791
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:af45ba0f0d46523fa0e893f10939e39bfad221070a83521412c140c9b833eff5
- `samples/CAT-01/record.json` sha256:0f95daf5334f14cb60718d164c3921652700754896912e9534994f06b8ebd9b7
- `samples/CAT-01/spec.json` sha256:8993c090f13923c5fdccb8f8335415b2293fccbf5cd3b084a1faaf826e02e1ed
- `samples/CAT-02/invocation-result.json` sha256:1eef5f56653e7ebb800f97aee644a072656ba36b6b0ad99c6e62626373802000
- `samples/CAT-02/record.json` sha256:3e798872817f780338512ffb0a2725e6645a9b76e286bf211eedae38cffa3408
- `samples/CAT-02/spec.json` sha256:538213ffa2081795d73f428d632646ed6eef17777af626a33d12ca3072b11984
- `samples/CAT-03/invocation-result.json` sha256:46cf7e8945bdf29a485e8784b5dd415581a4ff48ae57b3e3387fb853fcaac68b
- `samples/CAT-03/record.json` sha256:fd861ba5e5a6e07a189110be13add0373d60c042a859cc37fc1daed68ab408db
- `samples/CAT-03/spec.json` sha256:6f2de86fd6ca6492c6c6984b64729fc11b60d7c15f819ab4b225af2c6e4437bc
- `samples/FAULT-CODE-01/invocation-result.json` sha256:937a12257bafaed4c4fa062716ea33b6a69f2c03a23b61597e2b2f9764bc14de
- `samples/FAULT-CODE-01/record.json` sha256:b67a2ca999a7f84a582f4e0a20be3f93c510159ce457b736ea45ad87a05e40cd
- `samples/FAULT-CODE-01/spec.json` sha256:f0bbee2377844963a6cf144c207c01e8fb9b9e3360df0637c2568ea862652c3d
- `samples/FAULT-CODE-02/invocation-result.json` sha256:08a736de540446cac3b267d6377d1ef8f0dd16949faebe9c18653f8d631b7abb
- `samples/FAULT-CODE-02/record.json` sha256:7a35f0bdedd5ccb690ad4ea43a7a25fd94f3a7d240ca5595751fd363dc719cf4
- `samples/FAULT-CODE-02/spec.json` sha256:fadb9784b34be6c97b9bf3586a951aeb84cef6001780d6d7202c089052cd7d5a
- `samples/FAULT-CODE-03/invocation-result.json` sha256:1521e85b2dbda8fe6c4f9e105dbeb7a1d76feef0eb908b986b9e21628277dcc8
- `samples/FAULT-CODE-03/record.json` sha256:a8637a9ebfcfc1ab66f5d5888901c9a1c9403583d3cb9796b8c94ebec5b8b9cb
- `samples/FAULT-CODE-03/spec.json` sha256:3577868e02744190ef883bdab0e48d9345f967fbb7f1006d7fa8643945887cfa
- `samples/FAULT-ENV-01/invocation-result.json` sha256:07b37704faebfa67880a607677ca913392b379c28420201e9c832fb37767c4ca
- `samples/FAULT-ENV-01/record.json` sha256:8ae36a82eacf2fed9c33332a85f8c710fd801cb9a0232d85ad1aab16ffdaeb3e
- `samples/FAULT-ENV-01/spec.json` sha256:c29876b7042f8113571470f872e7226162762bb2809a23a3c6beee2372dba028
- `samples/FAULT-ENV-02/invocation-result.json` sha256:9f836e3bef687389acfa0394c12a88161683ea1c2f4712d4608f9c450a1a275e
- `samples/FAULT-ENV-02/record.json` sha256:711ed8bc9172db91da8d4af6f3b95f919a734ec115bb23734749f8269da998db
- `samples/FAULT-ENV-02/spec.json` sha256:89abb1792f83b75469d882182b7a643f69432fc617866fd9ba1bd8f870c82248
- `samples/SHOW-01/invocation-result.json` sha256:74a8e48a447122b51b9b610a650ed69d3495afeb4ce8223e464179495405228e
- `samples/SHOW-01/record.json` sha256:cd1efe2165cf20bfe819db0988fc19b003d594fa45071bad54053a271aefa563
- `samples/SHOW-01/spec.json` sha256:b9c3d1c36b6c25868b8d7e85b3d8c93e93dd0ea5c3996972748cfcf15c438294
- `samples/SHOW-02/invocation-result.json` sha256:dd78a49d42d16358b04216c3c7de9b2f2be095183a3ab762ba33d8b2fd9f1a7c
- `samples/SHOW-02/record.json` sha256:2aebbc1416535fc152b701f6b065250ee79453e7cebc0abacdd76d59aba00433
- `samples/SHOW-02/spec.json` sha256:1be76d4f6b845f1e9f7ce2513f9873cb13f3bbe226c5b276445b5c3324c0b2b5
- `samples/SHOW-03/invocation-result.json` sha256:2a9815bf162934095b12ea3b0b3925920888a135235018a549ac9e779138ac9f
- `samples/SHOW-03/record.json` sha256:4778b4465c9642dc6971aae27297f9eaa30f44ae38fb07eecd6cf9824f4bd3a5
- `samples/SHOW-03/spec.json` sha256:e21ac3bc32407f7a4d717f9041b39c0806021faea4cb47c0317e011b299d5a11
- `samples/TASK-01/invocation-result.json` sha256:b1dea41114c386faf1b2c369b54867e79bac5711dbf676910817d5df021944de
- `samples/TASK-01/record.json` sha256:ac11e78b94f1cd271eff019cc5a26208197886027a60193befb47e9b1dc9de27
- `samples/TASK-01/spec.json` sha256:a81759e96804c45078fde201e356262b6b7629968c7de00d9621442a0fe98249
- `samples/TASK-02/invocation-result.json` sha256:355b7957c83893d1e2213ebb3338bee6b3d14f0865d13edf7909b82dc13f3ee1
- `samples/TASK-02/record.json` sha256:ce43b660ce2b95dbf1aea75d02f191d9071f06d6c5c8df7ebff2f1a51934fc45
- `samples/TASK-02/spec.json` sha256:98ea086f389f7f237f3e1f016593131442ecb1aee4947e2ed14e94fe68cf21a0
- `samples/TASK-03/invocation-result.json` sha256:f408d5d224b531211e4e34cc437b47e808c689e4260c269c0005466d0facb6e7
- `samples/TASK-03/record.json` sha256:ebbe3cc43a654e297c64a00da2949a7b6c484dfcec15424daa0f23f885d4c7ec
- `samples/TASK-03/spec.json` sha256:0d490e52c04eeed16e1fb877de4bc489fd58071b9a6f6fce8c19099d66ca9056
